package com.brokerui.broker;

import com.brokerui.market.MarketPriceService;
import com.brokerui.user.AppUser;
import jakarta.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
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
  private final MarketPriceService priceService;
  private final AuditLogService auditLogService;

  @Autowired @Lazy
  private MarginLoanService self;

  public MarginLoanService(
      TradingAccountRepository accountRepo,
      PositionRepository positionRepo,
      BrokerOrderRepository orderRepo,
      MarginLoanLedgerRepository ledgerRepo,
      NotificationRepository notificationRepo,
      MarketPriceService priceService,
      AuditLogService auditLogService) {
    this.accountRepo = accountRepo;
    this.positionRepo = positionRepo;
    this.orderRepo = orderRepo;
    this.ledgerRepo = ledgerRepo;
    this.notificationRepo = notificationRepo;
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
    if (currentDebt.add(shortfall).compareTo(CREDIT_LIMIT) > 0) {
      return false; // would exceed the credit line — reject the trade
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
    if (amount == null || amount.compareTo(BigDecimal.ZERO) == 0) return;

    if (amount.compareTo(BigDecimal.ZERO) > 0) {
      BigDecimal debt = ta.getBorrowedBalance() == null ? BigDecimal.ZERO : ta.getBorrowedBalance();
      if (debt.compareTo(BigDecimal.ZERO) > 0) {
        BigDecimal repay = amount.min(debt);
        ta.setBorrowedBalance(debt.subtract(repay));
        BigDecimal remainder = amount.subtract(repay);
        ta.setBalance(ta.getBalance().add(remainder));
        if (repay.compareTo(BigDecimal.ZERO) > 0) {
          writeLedger(ta, "REPAY", repay, "Auto-repay from trade settlement");
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
      System.err.println("[MarginLoan] Failed to write ledger entry: " + e.getMessage());
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
      try {
        double live = priceService.getLivePrice(p.getSymbolCode());
        if (live <= 0) continue;
        BigDecimal contractSize = BrokerApiController.getContractSize(p.getSymbolCode());
        BigDecimal avg = p.getAvgPrice() == null ? BigDecimal.ZERO : p.getAvgPrice();
        BigDecimal qty = p.getQuantity() == null ? BigDecimal.ZERO : p.getQuantity();
        BigDecimal marginLocked = avg.multiply(qty).multiply(contractSize).divide(leverage, 4, RoundingMode.HALF_UP);
        BigDecimal diff = "SHORT".equals(p.getSide())
            ? avg.subtract(BigDecimal.valueOf(live))
            : BigDecimal.valueOf(live).subtract(avg);
        BigDecimal pnl = diff.multiply(qty).multiply(contractSize);
        collateral = collateral.add(marginLocked).add(pnl);
      } catch (Exception ignored) {}
    }
    return ta.getBalance().add(collateral);
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
      System.err.println("[MarginLoan] Interest accrual failed: " + e.getMessage());
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

    BigDecimal interest = debt.multiply(DAILY_INTEREST_RATE).setScale(8, RoundingMode.HALF_UP);
    ta.setBorrowedBalance(debt.add(interest));
    ta.setInterestAccruedTotal(
        (ta.getInterestAccruedTotal() == null ? BigDecimal.ZERO : ta.getInterestAccruedTotal()).add(interest));
    ta.setLastInterestAt(Instant.now());
    accountRepo.save(ta);
    writeLedger(ta, "INTEREST", interest, "Daily interest charge (" + DAILY_INTEREST_RATE.multiply(BigDecimal.valueOf(100)) + "%/day)");
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
      System.err.println("[MarginLoan] Liquidation check failed: " + e.getMessage());
    }
  }

  @Transactional
  public void checkLiquidations() {
    List<TradingAccount> debtors = accountRepo.findByBorrowedBalanceGreaterThan(BigDecimal.ZERO);
    for (TradingAccount ref : debtors) {
      BigDecimal level = computeMarginLevel(ref);
      if (level != null && level.compareTo(LIQUIDATION_LEVEL) < 0) {
        try {
          self.liquidateAccount(ref.getId());
        } catch (Exception e) {
          System.err.println("[MarginLoan] Failed to liquidate account #" + ref.getId() + ": " + e.getMessage());
        }
      }
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

    List<Position> positions = positionRepo.findByTradingAccountIdOrderByUpdatedAtDesc(ta.getId());
    // Close the most negative (worst loss) positions first, matching real exchange behavior.
    positions.sort((a, b) -> unrealizedPnlOf(a).compareTo(unrealizedPnlOf(b)));

    int closedCount = 0;
    for (Position pos : positions) {
      BigDecimal level = computeMarginLevel(ta);
      if (level != null && level.compareTo(MARGIN_CALL_LEVEL) >= 0) break; // recovered above safe threshold

      double live;
      try {
        live = priceService.getLivePrice(pos.getSymbolCode());
      } catch (Exception e) {
        continue;
      }
      if (live <= 0) continue;

      BigDecimal closePrice = BigDecimal.valueOf(live);
      BigDecimal qty = pos.getQuantity();
      BigDecimal avg = pos.getAvgPrice() == null ? BigDecimal.ZERO : pos.getAvgPrice();
      boolean isShort = "SHORT".equals(pos.getSide());
      BigDecimal contractSize = BrokerApiController.getContractSize(pos.getSymbolCode());
      BigDecimal leverage = BigDecimal.valueOf(ta.getLeverage() > 0 ? ta.getLeverage() : 100);
      BigDecimal marginReturned = avg.multiply(qty).multiply(contractSize).divide(leverage, 4, RoundingMode.HALF_UP);
      BigDecimal pnl = isShort
          ? avg.subtract(closePrice).multiply(qty).multiply(contractSize)
          : closePrice.subtract(avg).multiply(qty).multiply(contractSize);

      positionRepo.delete(pos);
      repaySettlementOrBorrow(ta, marginReturned.add(pnl));

      BrokerOrder order = new BrokerOrder();
      order.setTradingAccount(ta);
      order.setSymbolCode(pos.getSymbolCode());
      order.setSide(isShort ? "BUY" : "SELL");
      order.setOrderType("MARKET");
      order.setStatus("FILLED");
      order.setQuantity(qty);
      order.setFilledAt(Instant.now());
      order.setEntryPrice(closePrice);
      order.setOpenPrice(avg);
      order.setOpenedAt(pos.getOpenedAt());
      order.setRealizedPnl(pnl);
      orderRepo.save(order);
      closedCount++;

      try {
        Notification notif = new Notification();
        notif.setUser(ta.getUser());
        notif.setNotifType("LIQUIDATION");
        notif.setTitle("notification.liquidation.title");
        notif.setBody(String.format(java.util.Locale.US,
            "{\"symbol\":\"%s\",\"qty\":\"%.4f\",\"price\":\"%.4f\",\"pnl\":\"%.2f\"}",
            pos.getSymbolCode(), qty.doubleValue(), closePrice.doubleValue(), pnl.doubleValue()));
        notificationRepo.save(notif);
      } catch (Exception ignored) {}
    }

    // Write off any debt that couldn't be covered by liquidated positions, so the
    // account doesn't remain permanently stuck with unpayable negative net worth.
    BigDecimal remainingDebt = ta.getBorrowedBalance() == null ? BigDecimal.ZERO : ta.getBorrowedBalance();
    if (remainingDebt.compareTo(BigDecimal.ZERO) > 0) {
      writeLedger(ta, "LIQUIDATION", remainingDebt, "Liquidation complete — " + closedCount
          + " position(s) closed; residual debt written off");
      ta.setBorrowedBalance(BigDecimal.ZERO);
    } else if (closedCount > 0) {
      writeLedger(ta, "LIQUIDATION", BigDecimal.ZERO, "Liquidation complete — " + closedCount
          + " position(s) closed; margin level recovered");
    }

    ta.setEquity(liveEquity(ta));
    accountRepo.save(ta);

    auditLogService.log(ta.getUser(), "LIQUIDATION",
        closedCount + " position(s) force-closed due to margin call", null);
  }

  private BigDecimal unrealizedPnlOf(Position p) {
    try {
      double live = priceService.getLivePrice(p.getSymbolCode());
      if (live <= 0) return BigDecimal.ZERO;
      BigDecimal contractSize = BrokerApiController.getContractSize(p.getSymbolCode());
      BigDecimal avg = p.getAvgPrice() == null ? BigDecimal.ZERO : p.getAvgPrice();
      BigDecimal qty = p.getQuantity() == null ? BigDecimal.ZERO : p.getQuantity();
      BigDecimal diff = "SHORT".equals(p.getSide())
          ? avg.subtract(BigDecimal.valueOf(live))
          : BigDecimal.valueOf(live).subtract(avg);
      return diff.multiply(qty).multiply(contractSize);
    } catch (Exception e) {
      return BigDecimal.ZERO;
    }
  }
}
