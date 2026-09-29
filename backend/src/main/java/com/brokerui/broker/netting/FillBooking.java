package com.brokerui.broker.netting;

import com.brokerui.broker.AccountTransaction;
import com.brokerui.broker.AccountTransactionRepository;
import com.brokerui.broker.BrokerApiController;
import com.brokerui.broker.BrokerOrder;
import com.brokerui.broker.ContractSpecs;
import com.brokerui.broker.MarginLoanService;
import com.brokerui.broker.Notification;
import com.brokerui.broker.NotificationRepository;
import com.brokerui.broker.Position;
import com.brokerui.broker.PositionRepository;
import com.brokerui.broker.TradingAccount;
import com.brokerui.broker.TradingFees;
import com.brokerui.market.MarketPriceService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * The one place that books a fill into an account — shared by internal crosses, external fills
 * and resting LIMIT/LIQUIDITY fills, so the money logic exists once.
 *
 * Same economics as the pre-netting {@code OrderExecutionService.executeFilled}: the cash that was
 * reserved when the order was placed is compared with what the fill really costs (margin +
 * commission). Unused reserve is returned via {@link MarginLoanService#repaySettlementOrBorrow};
 * a more expensive fill borrows the difference via {@link MarginLoanService#tryCoverShortfall}
 * (credit-limit checked). Partial fills consume the reserve proportionally.
 */
@Component
public class FillBooking {
  private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(FillBooking.class);

  private final MarginLoanService marginLoanService;
  private final AccountTransactionRepository txRepo;
  private final PositionRepository positionRepo;
  private final NotificationRepository notificationRepo;
  private final MarketPriceService priceService;

  public FillBooking(MarginLoanService marginLoanService, AccountTransactionRepository txRepo,
      PositionRepository positionRepo, NotificationRepository notificationRepo, MarketPriceService priceService) {
    this.marginLoanService = marginLoanService;
    this.txRepo = txRepo;
    this.positionRepo = positionRepo;
    this.notificationRepo = notificationRepo;
    this.priceService = priceService;
  }

  /** Price × qty × contract size / leverage — the margin formula used everywhere in the project. */
  public static BigDecimal margin(String symbol, BigDecimal qty, BigDecimal price, TradingAccount ta) {
    BigDecimal leverage = BigDecimal.valueOf(ta.getLeverage() > 0 ? ta.getLeverage() : 100);
    return price.multiply(qty).multiply(ContractSpecs.getContractSize(symbol)).divide(leverage, 4, RoundingMode.HALF_UP);
  }

  /**
   * Cash still reserved for the unfilled part of {@code o}. Orders created before V32 have no
   * {@code reserveRemaining}; for them the original formula (limit/stop × qty) is used, which is
   * exactly what {@code cancelOrder} refunded before netting existed.
   */
  public static BigDecimal outstandingReserve(BrokerOrder o, TradingAccount ta) {
    if (o.getReserveRemaining() != null) return o.getReserveRemaining();
    BigDecimal price = o.getLimitPrice() != null ? o.getLimitPrice()
        : (o.getStopPrice() != null ? o.getStopPrice() : BigDecimal.ZERO);
    if (price.compareTo(BigDecimal.ZERO) <= 0) return BigDecimal.ZERO;
    return margin(o.getSymbolCode(), o.remainingQty(), price, ta);
  }

  /** The share of the outstanding reserve that belongs to {@code qty} (the last fill takes everything left). */
  public static BigDecimal reservePortion(BrokerOrder o, TradingAccount ta, BigDecimal qty) {
    BigDecimal outstanding = outstandingReserve(o, ta);
    BigDecimal remaining = o.remainingQty();
    if (remaining.signum() <= 0 || qty.compareTo(remaining) >= 0) return outstanding;
    return outstanding.multiply(qty).divide(remaining, 4, RoundingMode.HALF_UP);
  }

  /** What a fill of {@code qty} at {@code price} costs the account: margin + commission. */
  public record FillCost(BigDecimal margin, BigDecimal commission, BigDecimal reservePortion) {
    public BigDecimal total() { return margin.add(commission); }
    /** Positive = cash to return, negative = extra cash needed. */
    public BigDecimal settlement() { return reservePortion.subtract(total()); }
  }

  public FillCost cost(BrokerOrder o, TradingAccount ta, BigDecimal qty, BigDecimal price) {
    return new FillCost(margin(o.getSymbolCode(), qty, price, ta),
        TradingFees.calculateCommission(o.getSymbolCode(), qty, price), reservePortion(o, ta, qty));
  }

  /** Same test as {@link MarginLoanService#tryCoverShortfall}, without touching the account. */
  public static boolean canCover(TradingAccount ta, BigDecimal extra) {
    if (extra == null || extra.signum() <= 0) return true;
    if (ta.getBalance().compareTo(extra) >= 0) return true;
    BigDecimal shortfall = extra.subtract(ta.getBalance());
    BigDecimal debt = ta.getBorrowedBalance() == null ? BigDecimal.ZERO : ta.getBorrowedBalance();
    BigDecimal limit = ta.getCreditLimit() == null ? BigDecimal.ZERO : ta.getCreditLimit();
    return debt.add(shortfall).compareTo(limit) <= 0;
  }

  public boolean affordable(TradingAccount ta, FillCost c) {
    return canCover(ta, c.settlement().negate());
  }

  /**
   * Books one fill for one side. Caller holds the order and account locks and has already
   * checked {@link #affordable}.
   *
   * @param internal true for an internal cross, false for an external fill
   */
  public void book(BrokerOrder o, TradingAccount ta, BigDecimal qty, BigDecimal price, FillCost c, boolean internal) {
    // 1. Cash: return unused reserve, or borrow the extra (pre-checked, cannot fail here).
    BigDecimal settle = c.settlement();
    if (settle.signum() > 0) {
      marginLoanService.repaySettlementOrBorrow(ta, settle);
    } else if (settle.signum() < 0) {
      if (!marginLoanService.tryCoverShortfall(ta, settle.negate(), ta.isSimulated() ? null : ta.getUser(), null)) {
        throw new IllegalStateException("fill of order #" + o.getId() + " not affordable after pre-check");
      }
    }
    o.setReserveRemaining(outstandingReserve(o, ta).subtract(c.reservePortion()).max(BigDecimal.ZERO));

    // 2. Commission (accumulates across partial fills; TradingFees.charge sets, so add back the previous).
    BigDecimal previousCommission = o.getCommission() == null ? BigDecimal.ZERO : o.getCommission();
    TradingFees.charge(ta, o, c.commission());
    o.setCommission(previousCommission.add(c.commission()));
    AccountTransaction feeTx = new AccountTransaction();
    feeTx.setTradingAccount(ta);
    feeTx.setTxType("COMMISSION");
    feeTx.setAmount(c.commission());
    feeTx.setCurrency(ta.getCurrency());
    feeTx.setStatus("APPROVED");
    feeTx.setProcessedAt(Instant.now());
    txRepo.save(feeTx);

    // 3. Position (hedging model: every fill is its own position).
    boolean isBuy = "BUY".equalsIgnoreCase(o.getSide());
    Position pos = new Position();
    pos.setTradingAccount(ta);
    pos.setSymbolCode(o.getSymbolCode());
    pos.setSide(isBuy ? "LONG" : "SHORT");
    pos.setQuantity(qty);
    pos.setAvgPrice(price);
    pos.setUnrealizedPnl(BigDecimal.ZERO);
    pos.setOpenedAt(Instant.now());
    pos.setTakeProfit(o.getTakeProfit());
    pos.setStopLoss(o.getStopLoss());
    positionRepo.save(pos);

    // 4. Order bookkeeping.
    BigDecimal filledBefore = o.getFilledQty() == null ? BigDecimal.ZERO : o.getFilledQty();
    BigDecimal filledAfter = filledBefore.add(qty);
    BigDecimal prevEntry = o.getEntryPrice();
    if (prevEntry == null || filledBefore.signum() == 0) {
      o.setEntryPrice(price);
    } else {
      o.setEntryPrice(prevEntry.multiply(filledBefore).add(price.multiply(qty)).divide(filledAfter, 8, RoundingMode.HALF_UP));
    }
    o.setFilledQty(filledAfter);
    if (internal) {
      o.setInternalQty((o.getInternalQty() == null ? BigDecimal.ZERO : o.getInternalQty()).add(qty));
    } else {
      o.setExternalQty((o.getExternalQty() == null ? BigDecimal.ZERO : o.getExternalQty()).add(qty));
    }
    o.setRouting(routingOf(o));
    o.setFilledAt(Instant.now());
    if (o.getRealizedPnl() == null) o.setRealizedPnl(BigDecimal.ZERO);

    // 5. Account snapshot fields (same as the rest of the codebase: equity = balance + floating P/L).
    ta.setEquity(liveEquity(ta));
    ta.setFreeMargin(ta.getBalance());

    // 6. Notification for real clients (same payload as before netting).
    if (!ta.isSimulated()) {
      try {
        Notification n = new Notification();
        n.setUser(ta.getUser());
        n.setNotifType("TRADE");
        n.setTitle("notification.tradeOpened.title");
        n.setBody(String.format(java.util.Locale.US, "{\"side\":\"%s\",\"qty\":\"%.4f\",\"symbol\":\"%s\",\"price\":\"%.4f\"}",
            o.getSide(), qty.doubleValue(), o.getSymbolCode(), price.doubleValue()));
        notificationRepo.save(n);
      } catch (Exception e) {
        log.warn("Failed to create notification: {}", e.getMessage());
      }
    }
  }

  /** Returns the whole outstanding reserve (cancel / reject of the unfilled part). */
  public BigDecimal releaseReserve(BrokerOrder o, TradingAccount ta) {
    BigDecimal refund = outstandingReserve(o, ta);
    if (refund.signum() > 0) marginLoanService.repaySettlementOrBorrow(ta, refund);
    o.setReserveRemaining(BigDecimal.ZERO);
    ta.setEquity(liveEquity(ta));
    ta.setFreeMargin(ta.getBalance());
    return refund;
  }

  public static String routingOf(BrokerOrder o) {
    boolean in = o.getInternalQty() != null && o.getInternalQty().signum() > 0;
    boolean ex = o.getExternalQty() != null && o.getExternalQty().signum() > 0;
    if (in && ex) return "SPLIT";
    if (in) return "INTERNAL";
    if (ex) return "EXTERNAL";
    return o.getRouting();
  }

  /** Cash balance + live floating P/L — same definition as BrokerApiController / OrderExecutionService. */
  public BigDecimal liveEquity(TradingAccount ta) {
    List<Position> positions = positionRepo.findByTradingAccountIdOrderByUpdatedAtDesc(ta.getId());
    BigDecimal total = BigDecimal.ZERO;
    for (Position p : positions) {
      try {
        double live = priceService.getLivePrice(p.getSymbolCode());
        if (live <= 0) {
          total = total.add(p.getUnrealizedPnl() == null ? BigDecimal.ZERO : p.getUnrealizedPnl());
          continue;
        }
        total = total.add(BrokerApiController.liveUnrealizedPnl(p, BigDecimal.valueOf(live)));
      } catch (Exception e) {
        total = total.add(p.getUnrealizedPnl() == null ? BigDecimal.ZERO : p.getUnrealizedPnl());
      }
    }
    return ta.getBalance().add(total);
  }
}
