package com.brokerui.broker;

import com.brokerui.broker.netting.NettingService;
import com.brokerui.market.MarketPriceService;
import com.brokerui.user.AppUser;
import jakarta.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Implements a Bybit-style margin credit line: when a trade needs more cash than
 * the account currently holds, the shortfall is automatically borrowed against a
 * fixed per-account credit limit. Borrowed funds accrue daily interest and, if the
 * account's equity falls too close to the outstanding debt, open positions are
 * force-liquidated to protect the broker from bad debt.
 */
@Service
public class MarginLoanService {
  private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(MarginLoanService.class);

  /** Fixed credit line available to every demo account, regardless of equity. */
  public static final BigDecimal CREDIT_LIMIT = new BigDecimal("10000");

  /** Daily interest rate charged on the outstanding borrowed balance. */
  public static final BigDecimal DAILY_INTEREST_RATE = new BigDecimal("0.005"); // 0.5%/day

  /** Below this margin level (equity / debt) a warning ("margin call") is shown. */
  public static final BigDecimal MARGIN_CALL_LEVEL = new BigDecimal("1.10"); // 110%

  /** Below this margin level positions are force-liquidated. */
  public static final BigDecimal LIQUIDATION_LEVEL = new BigDecimal("1.00"); // 100%

  private final TradingAccountRepository accountRepo;
  private final PositionRepository positionRepo;
  private final BrokerOrderRepository orderRepo;
  private final MarginLoanLedgerRepository ledgerRepo;
  private final NotificationRepository notificationRepo;
  private final CommissionLedger commissionLedger;
  private final MarketPriceService priceService;
  private final AuditLogService auditLogService;

  @Autowired @Lazy
  private MarginLoanService self;

  /** Present in the running app. Unit tests construct the service directly and leave this empty. */
  @Autowired(required = false) @Lazy
  private NettingService nettingService;

  public MarginLoanService(
      TradingAccountRepository accountRepo,
      PositionRepository positionRepo,
      BrokerOrderRepository orderRepo,
      MarginLoanLedgerRepository ledgerRepo,
      NotificationRepository notificationRepo,
      CommissionLedger commissionLedger,
      MarketPriceService priceService,
      AuditLogService auditLogService) {
    this.accountRepo = accountRepo;
    this.positionRepo = positionRepo;
    this.orderRepo = orderRepo;
    this.ledgerRepo = ledgerRepo;
    this.notificationRepo = notificationRepo;
    this.commissionLedger = commissionLedger;
    this.priceService = priceService;
    this.auditLogService = auditLogService;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Borrow / repay
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Attempts to cover the given required amount for a NEW trade/reservation.
   * Uses available cash first; if insufficient, borrows the shortfall from the
   * credit line, capped by {@link #CREDIT_LIMIT}. This is the only place where the
   * credit limit is enforced — it only gates voluntarily opening new exposure.
   *
   * @param ta       trading account (already locked by caller via findByIdForUpdate)
   * @param required total cash amount needed for the trade
   * @param user     acting user, for audit logging
   * @param request  current HTTP request, for audit logging (may be null)
   * @return true if the amount was covered (balance debited and/or borrowed), false if it
   *         would exceed the credit limit and the trade must be rejected
   */
  public boolean tryCoverShortfall(TradingAccount ta, BigDecimal required, AppUser user, HttpServletRequest request) {
    if (required.compareTo(BigDecimal.ZERO) <= 0) return true;

    if (ta.getBalance().compareTo(required) >= 0) {
      ta.setBalance(ta.getBalance().subtract(required));
      return true;
    }

    BigDecimal shortfall = required.subtract(ta.getBalance());
    BigDecimal currentDebt = ta.getBorrowedBalance() == null ? BigDecimal.ZERO : ta.getBorrowedBalance();
    if (currentDebt.add(shortfall).compareTo(ta.getCreditLimit()) > 0) {
      return false; // would exceed the account's credit line — reject the trade
    }

    ta.setBalance(BigDecimal.ZERO);
    ta.setBorrowedBalance(currentDebt.add(shortfall));
    if (ta.getLastInterestAt() == null) {
      ta.setLastInterestAt(Instant.now()); // interest clock starts from first borrow
    }
    writeLedger(ta, "BORROW", shortfall, "Auto-borrow to cover trade shortfall");
    if (user != null) {
      auditLogService.log(user, "MARGIN_BORROW",
          "Borrowed " + shortfall + " " + ta.getCurrency() + " (debt now " + ta.getBorrowedBalance() + ")", request);
    }
    return true;
  }

  /**
   * Interest charged on the debt that is open now. A closed episode drops back to zero.
   * The lifetime total stays on the account and in the credit ledger.
   */
  public BigDecimal interestOnOpenDebt(TradingAccount ta) {
    BigDecimal debt = ta.getBorrowedBalance() == null ? BigDecimal.ZERO : ta.getBorrowedBalance();
    if (debt.signum() <= 0 || ta.getId() == null) return BigDecimal.ZERO;
    List<MarginLoanLedger> oldestFirst = new ArrayList<>(
        ledgerRepo.findByTradingAccountIdOrderByCreatedAtDesc(ta.getId()));
    java.util.Collections.reverse(oldestFirst);
    return interestSinceDebtOpened(oldestFirst);
  }

  /** Oldest entry first. Interest counts only after the debt last returned to zero. */
  static BigDecimal interestSinceDebtOpened(List<MarginLoanLedger> oldestFirst) {
    BigDecimal accrued = BigDecimal.ZERO;
    if (oldestFirst == null) return accrued;
    for (MarginLoanLedger entry : oldestFirst) {
      if (entry == null) continue;
      if ("INTEREST".equals(entry.getEntryType()) && entry.getAmount() != null) {
        accrued = accrued.add(entry.getAmount());
      }
      if (entry.getBorrowedAfter() != null && entry.getBorrowedAfter().signum() == 0) {
        accrued = BigDecimal.ZERO;
      }
    }
    return accrued;
  }

  /**
   * Applies the proceeds of a settlement (position close, order cancel refund, etc.) to
   * the account. A positive amount first repays outstanding debt, with any remainder
   * credited to cash. A negative amount (a net loss) is deducted from cash first and,
   * if cash is insufficient, added to the debt — uncapped by the credit limit, since a
   * loss already happened and the liquidation engine is responsible for resolving excess debt.
   *
   * @param ta     trading account (already locked by caller)
   * @param amount signed settlement amount (margin returned + realized P/L)
   */
  public void repaySettlementOrBorrow(TradingAccount ta, BigDecimal amount) {
    repaySettlementOrBorrow(ta, amount, "Auto-repay from trade settlement");
  }

  /**
   * Same as {@link #repaySettlementOrBorrow(TradingAccount, BigDecimal)}.
   * {@code repayNote} is stored on the credit ledger when part of a positive amount
   * pays the debt down.
   */
  public void repaySettlementOrBorrow(TradingAccount ta, BigDecimal amount, String repayNote) {
    if (amount == null || amount.compareTo(BigDecimal.ZERO) == 0) return;

    if (amount.compareTo(BigDecimal.ZERO) > 0) {
      BigDecimal debt = ta.getBorrowedBalance() == null ? BigDecimal.ZERO : ta.getBorrowedBalance();
      if (debt.compareTo(BigDecimal.ZERO) > 0) {
        BigDecimal repay = amount.min(debt);
        ta.setBorrowedBalance(debt.subtract(repay));
        BigDecimal remainder = amount.subtract(repay);
        ta.setBalance(ta.getBalance().add(remainder));
        if (repay.compareTo(BigDecimal.ZERO) > 0) {
          String note = repayNote == null || repayNote.isBlank()
              ? "Auto-repay from trade settlement"
              : repayNote;
          writeLedger(ta, "REPAY", repay, note);
        }
      } else {
        ta.setBalance(ta.getBalance().add(amount));
      }
      return;
    }

    BigDecimal loss = amount.abs();
    if (ta.getBalance().compareTo(loss) >= 0) {
      ta.setBalance(ta.getBalance().subtract(loss));
      return;
    }
    BigDecimal extra = loss.subtract(ta.getBalance());
    ta.setBalance(BigDecimal.ZERO);
    BigDecimal debt = ta.getBorrowedBalance() == null ? BigDecimal.ZERO : ta.getBorrowedBalance();
    ta.setBorrowedBalance(debt.add(extra));
    if (ta.getLastInterestAt() == null) {
      ta.setLastInterestAt(Instant.now()); // interest clock starts from first debt
    }
    writeLedger(ta, "BORROW", extra, "Loss exceeded cash balance — added to credit line debt");
  }

  private void writeLedger(TradingAccount ta, String type, BigDecimal amount, String note) {
    try {
      MarginLoanLedger entry = new MarginLoanLedger();
      entry.setTradingAccount(ta);
      entry.setEntryType(type);
      entry.setAmount(amount);
      entry.setBorrowedAfter(ta.getBorrowedBalance());
      entry.setBalanceAfter(ta.getBalance());
      entry.setNote(note);
      ledgerRepo.save(entry);
    } catch (Exception e) {
      log.error("[MarginLoan] Failed to write ledger entry: {}", e.getMessage());
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Margin level
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Computes the account's margin level as a ratio of live equity to outstanding debt.
   * Returns {@code null} when the account has no debt (risk-free / not applicable).
   *
   * @param ta trading account
   * @return margin level ratio (1.0 = 100%), or null if there is no borrowed balance
   */
  public BigDecimal computeMarginLevel(TradingAccount ta) {
    BigDecimal debt = ta.getBorrowedBalance() == null ? BigDecimal.ZERO : ta.getBorrowedBalance();
    if (debt.compareTo(BigDecimal.ZERO) <= 0) return null;
    BigDecimal equity = liveEquity(ta);
    return equity.divide(debt, 4, RoundingMode.HALF_UP);
  }

  /**
   * Returns what the margin level would become if {@code cashAmount} were withdrawn from
   * the account right now (equity drops by exactly that much, debt is unchanged). Used to
   * block withdrawals that would immediately put an indebted account into margin call.
   * Returns null if the account has no outstanding debt (withdrawal is unrestricted).
   */
  public BigDecimal simulateMarginLevelAfterWithdrawal(TradingAccount ta, BigDecimal cashAmount) {
    BigDecimal debt = ta.getBorrowedBalance() == null ? BigDecimal.ZERO : ta.getBorrowedBalance();
    if (debt.compareTo(BigDecimal.ZERO) <= 0) return null;
    BigDecimal equityAfter = liveEquity(ta).subtract(cashAmount == null ? BigDecimal.ZERO : cashAmount);
    return equityAfter.divide(debt, 4, RoundingMode.HALF_UP);
  }

  /**
   * Computes the account's total liquidation value: cash balance plus, for every open
   * position, the margin that would be released on close plus its unrealized P/L.
   * <p>
   * NOTE: unlike {@code recalcEquity()} elsewhere in this codebase, this intentionally adds
   * back the margin locked into each position. Here, {@code balance} already has the margin
   * subtracted when a position is opened (see {@code BrokerApiController#placeOrder}), so a
   * plain {@code balance + unrealizedPnL} would understate the real collateral backing the
   * credit line by the full margin amount — making every leveraged trade look like an
   * instant margin call. This method reflects what the account would actually be worth if
   * every position were closed right now, which is the correct basis for margin level.
   */
  private BigDecimal liveEquity(TradingAccount ta) {
    List<Position> positions = positionRepo.findByTradingAccountIdOrderByUpdatedAtDesc(ta.getId());
    BigDecimal leverage = BigDecimal.valueOf(ta.getLeverage() > 0 ? ta.getLeverage() : 100);
    BigDecimal collateral = BigDecimal.ZERO;
    for (Position p : positions) {
      BigDecimal contractSize = BrokerApiController.getContractSize(p.getSymbolCode());
      BigDecimal avg = p.getAvgPrice() == null ? BigDecimal.ZERO : p.getAvgPrice();
      BigDecimal qty = p.getQuantity() == null ? BigDecimal.ZERO : p.getQuantity();
      BigDecimal marginLocked = avg.multiply(qty).multiply(contractSize).divide(leverage, 4, RoundingMode.HALF_UP);
      // A missing quote must never drop the position out of the collateral base: doing so
      // understated equity by the whole position and could margin-call a healthy account on
      // nothing worse than a price-feed blip. floatingPnl() falls back to the stored value.
      collateral = collateral.add(marginLocked).add(floatingPnl(p));
    }
    return ta.getBalance().add(collateral);
  }

  /**
   * Floating P/L for a position at its live quote, falling back to the last value stored on
   * the position when no quote is available.
   *
   * @param p the open position
   * @return signed floating P/L
   */
  private BigDecimal floatingPnl(Position p) {
    try {
      double live = priceService.getLivePrice(p.getSymbolCode());
      if (live > 0) {
        return BrokerApiController.liveUnrealizedPnl(p, BigDecimal.valueOf(live));
      }
    } catch (Exception e) {
      log.warn("[MarginLoan] No live quote for {} — using last stored floating P/L: {}",
          p.getSymbolCode(), e.getMessage());
    }
    return p.getUnrealizedPnl() == null ? BigDecimal.ZERO : p.getUnrealizedPnl();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Scheduled jobs
  // ───────────────────────────────────────────────────────────────────────────

  private static final long ONE_DAY_MS = 24L * 60 * 60 * 1000;

  /**
   * Checks, roughly once an hour, whether any indebted account is due for its daily
   * interest charge (i.e. at least 24h have passed since {@code lastInterestAt}). This
   * per-account time gate means restarting the server does not re-trigger interest —
   * unlike a naive fixed-delay-from-startup scheduler would.
   */
  @Scheduled(fixedDelay = 60L * 60 * 1000, initialDelay = 30_000)
  public void accrueDueInterestTick() {
    try {
      self.accrueDueInterest();
    } catch (Exception e) {
      log.error("[MarginLoan] Interest accrual failed: {}", e.getMessage());
    }
  }

  @Transactional
  public void accrueDueInterest() {
    Instant now = Instant.now();
    List<TradingAccount> debtors = accountRepo.findByBorrowedBalanceGreaterThan(BigDecimal.ZERO);
    for (TradingAccount ref : debtors) {
      if (ref.getLastInterestAt() != null
          && now.toEpochMilli() - ref.getLastInterestAt().toEpochMilli() < ONE_DAY_MS) {
        continue; // not due yet
      }
      chargeInterest(ref.getId());
    }
  }

  /**
   * Forcibly charges one day's interest on every indebted account right now, regardless
   * of when it was last charged. Used by the admin "run interest now" testing endpoint.
   */
  @Transactional
  public void accrueDailyInterest() {
    List<TradingAccount> debtors = accountRepo.findByBorrowedBalanceGreaterThan(BigDecimal.ZERO);
    for (TradingAccount ref : debtors) {
      chargeInterest(ref.getId());
    }
  }

  private void chargeInterest(Long accountId) {
    TradingAccount ta = accountRepo.findByIdForUpdate(accountId).orElse(null);
    if (ta == null) return;
    BigDecimal debt = ta.getBorrowedBalance();
    if (debt == null || debt.compareTo(BigDecimal.ZERO) <= 0) return;

    BigDecimal rate = ta.getDailyInterestRate() == null ? DAILY_INTEREST_RATE : ta.getDailyInterestRate();
    BigDecimal interest = debt.multiply(rate).setScale(8, RoundingMode.HALF_UP);
    ta.setBorrowedBalance(debt.add(interest));
    ta.setInterestAccruedTotal(
        (ta.getInterestAccruedTotal() == null ? BigDecimal.ZERO : ta.getInterestAccruedTotal()).add(interest));
    ta.setLastInterestAt(Instant.now());
    accountRepo.save(ta);
    String rateDisplay = rate.multiply(BigDecimal.valueOf(100)).stripTrailingZeros().toPlainString();
    writeLedger(ta, "INTEREST", interest, "Daily interest charge (" + rateDisplay + "%/day)");
  }

  /**
   * Monitors margin level for every indebted account and force-liquidates positions
   * when equity drops too close to the outstanding debt.
   */
  @Scheduled(fixedDelay = 10_000)
  public void checkLiquidationsTick() {
    try {
      self.checkLiquidations();
    } catch (Exception e) {
      log.error("[MarginLoan] Liquidation check failed: {}", e.getMessage());
    }
  }

  public void checkLiquidations() {
    List<TradingAccount> debtors = accountRepo.findByBorrowedBalanceGreaterThan(BigDecimal.ZERO);
    for (TradingAccount ref : debtors) {
      BigDecimal level = computeMarginLevel(ref);
      if (level == null || level.compareTo(LIQUIDATION_LEVEL) >= 0) continue;
      try {
        if (nettingService == null) {
          self.liquidateAccount(ref.getId());
          continue;
        }
        // One position at a time. A close that is still waiting blocks the next one,
        // so a recovery after the first fill is not overrun by closing everything.
        while (true) {
          Long posId = self.nextLiquidationPosition(ref.getId());
          if (posId == null || posId < 0) break;
          NettingService.Result result = nettingService.offerClose(posId);
          if (result == null || !"FILLED".equals(result.status())) break;
        }
        self.finishLiquidation(ref.getId());
      } catch (Exception e) {
        log.error("[MarginLoan] Failed to liquidate account #{}: {}", ref.getId(), e.getMessage());
      }
    }
  }

  /**
   * The worst open position that should be force-closed now.
   * Returns null when nothing should close, and -1 when a close is already waiting
   * on the book (do not start another until that one finishes).
   */
  @Transactional
  public Long nextLiquidationPosition(Long accountId) {
    TradingAccount ta = accountRepo.findByIdForUpdate(accountId).orElse(null);
    if (ta == null) return null;
    if (ta.getBorrowedBalance() == null || ta.getBorrowedBalance().compareTo(BigDecimal.ZERO) <= 0) return null;
    BigDecimal lockedLevel = computeMarginLevel(ta);
    if (lockedLevel == null || lockedLevel.compareTo(LIQUIDATION_LEVEL) >= 0) return null;

    List<Position> positions = new ArrayList<>(positionRepo.findByTradingAccountIdOrderByUpdatedAtDesc(ta.getId()));
    positions.sort(Comparator.comparing(this::floatingPnl));
    for (Position snapshot : positions) {
      BigDecimal level = computeMarginLevel(ta);
      if (level != null && level.compareTo(MARGIN_CALL_LEVEL) >= 0) return null;
      if (snapshot.getId() == null) continue;
      List<BrokerOrder> waiting = orderRepo.findByClosesPositionIdAndStatusIn(
          snapshot.getId(), NettingService.OPEN_STATUSES);
      if (!waiting.isEmpty()) return -1L;
      double live;
      try {
        live = priceService.getLivePrice(snapshot.getSymbolCode());
      } catch (Exception e) {
        continue;
      }
      if (live <= 0) continue;
      return snapshot.getId();
    }
    return null;
  }

  /** Writes off debt only after every position is actually gone. A waiting close is not gone. */
  @Transactional
  public void finishLiquidation(Long accountId) {
    TradingAccount ta = accountRepo.findByIdForUpdate(accountId).orElse(null);
    if (ta == null) return;
    BigDecimal remainingDebt = ta.getBorrowedBalance() == null ? BigDecimal.ZERO : ta.getBorrowedBalance();
    List<Position> stillOpen = positionRepo.findByTradingAccountIdOrderByUpdatedAtDesc(ta.getId());
    boolean positionsRemain = stillOpen != null && !stillOpen.isEmpty();
    if (remainingDebt.compareTo(BigDecimal.ZERO) > 0 && !positionsRemain) {
      writeLedger(ta, "LIQUIDATION", remainingDebt,
          "Liquidation complete — residual debt written off");
      ta.setBorrowedBalance(BigDecimal.ZERO);
      ta.setEquity(liveEquity(ta));
      accountRepo.save(ta);
      auditLogService.log(ta.getUser(), "LIQUIDATION", "residual debt written off after positions closed", null);
    }
  }

  /**
   * Force-closes every open position on the account (largest loss first) and applies the
   * proceeds to the debt until the margin level recovers, or all positions are closed.
   * Any residual un-payable debt is written off so the account doesn't get stuck.
   *
   * @param accountId the trading account to liquidate
   */
  @Transactional
  public void liquidateAccount(Long accountId) {
    TradingAccount ta = accountRepo.findByIdForUpdate(accountId).orElse(null);
    if (ta == null) return;
    if (ta.getBorrowedBalance() == null || ta.getBorrowedBalance().compareTo(BigDecimal.ZERO) <= 0) return;

    // Re-evaluate under the row lock. The scheduler's pre-check used a stale unlocked snapshot
    // and could force-close an account that had already recovered (or miss one that hadn't).
    BigDecimal lockedLevel = computeMarginLevel(ta);
    if (lockedLevel == null || lockedLevel.compareTo(LIQUIDATION_LEVEL) >= 0) return;

    List<Position> positions = new ArrayList<>(positionRepo.findByTradingAccountIdOrderByUpdatedAtDesc(ta.getId()));
    // One quote per position (cached in MarketPriceService), then a stable sort — calling
    // getLivePrice inside the comparator used to hammer the feed and could throw
    // "Comparison method violates its general contract".
    positions.sort(Comparator.comparing(this::floatingPnl));

    int closedCount = 0;
    boolean recovered = false;
    for (Position snapshot : positions) {
      BigDecimal level = computeMarginLevel(ta);
      if (level != null && level.compareTo(MARGIN_CALL_LEVEL) >= 0) { recovered = true; break; }

      Position pos = snapshot.getId() == null
          ? snapshot
          : positionRepo.findByIdForUpdate(snapshot.getId()).orElse(null);
      if (pos == null) continue;

      double live;
      try {
        live = priceService.getLivePrice(pos.getSymbolCode());
      } catch (Exception e) {
        continue;
      }
      if (live <= 0) continue;

      PositionCloseMath.Snapshot close = PositionCloseMath.compute(pos, ta, BigDecimal.valueOf(live));

      BrokerOrder order = new BrokerOrder();
      order.setTradingAccount(ta);
      order.setSymbolCode(pos.getSymbolCode());
      order.setSide(close.closeSide());
      order.setOrderType("MARKET");
      order.setStatus("FILLED");
      order.setQuantity(close.quantity());
      order.setFilledAt(Instant.now());
      order.setEntryPrice(close.closePrice());
      order.setOpenPrice(close.avgPrice());
      order.setOpenedAt(pos.getOpenedAt());
      order.setRealizedPnl(close.netPnl());
      commissionLedger.record(ta, order, close.closeCommission());
      orderRepo.save(order);

      positionRepo.delete(pos);
      repaySettlementOrBorrow(ta, close.settlement());
      closedCount++;

      try {
        Notification notif = new Notification();
        notif.setUser(ta.getUser());
        notif.setNotifType("LIQUIDATION");
        notif.setTitle("notification.liquidation.title");
        notif.setBody(String.format(java.util.Locale.US,
            "{\"symbol\":\"%s\",\"qty\":\"%.4f\",\"price\":\"%.4f\",\"pnl\":\"%.2f\"}",
            pos.getSymbolCode(), close.quantity().doubleValue(), close.closePrice().doubleValue(),
            close.netPnl().doubleValue()));
        notificationRepo.save(notif);
      } catch (Exception e) {
        log.warn("[MarginLoan] Failed to push liquidation notification: {}", e.getMessage());
      }
    }

    // Only write off remaining debt when every position has actually been liquidated and
    // the debt is truly unpayable. Do NOT forgive debt when:
    //  - the loop stopped early because margin level recovered (`recovered`), or
    //  - positions still remain (e.g. live prices were unavailable and we `continue`d) —
    //    otherwise a temporary quote outage would erase the client's credit-line debt
    //    while their positions are still open.
    BigDecimal remainingDebt = ta.getBorrowedBalance() == null ? BigDecimal.ZERO : ta.getBorrowedBalance();
    List<Position> stillOpen = positionRepo.findByTradingAccountIdOrderByUpdatedAtDesc(ta.getId());
    boolean positionsRemain = stillOpen != null && !stillOpen.isEmpty();
    if (remainingDebt.compareTo(BigDecimal.ZERO) > 0 && !recovered && !positionsRemain) {
      writeLedger(ta, "LIQUIDATION", remainingDebt, "Liquidation complete — " + closedCount
          + " position(s) closed; residual debt written off");
      ta.setBorrowedBalance(BigDecimal.ZERO);
    } else if (closedCount > 0 && recovered) {
      writeLedger(ta, "LIQUIDATION", BigDecimal.ZERO, "Liquidation complete — " + closedCount
          + " position(s) closed; margin level recovered");
    } else if (closedCount > 0 && positionsRemain) {
      writeLedger(ta, "LIQUIDATION", BigDecimal.ZERO, "Liquidation incomplete — " + closedCount
          + " position(s) closed, " + stillOpen.size() + " remain (prices unavailable?); debt kept");
    }

    ta.setEquity(liveEquity(ta));
    accountRepo.save(ta);

    auditLogService.log(ta.getUser(), "LIQUIDATION",
        closedCount + " position(s) force-closed due to margin call", null);
  }
}
