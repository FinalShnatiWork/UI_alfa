package com.brokerui.broker.netting;

import static com.brokerui.broker.netting.NettingTypes.*;

import com.brokerui.broker.BrokerOrder;
import com.brokerui.broker.BrokerOrderRepository;
import com.brokerui.broker.ContractSpecs;
import com.brokerui.broker.MT5IntegrationService;
import com.brokerui.broker.MarginLoanService;
import com.brokerui.broker.NNPredictorClient;
import com.brokerui.broker.Position;
import com.brokerui.broker.PositionRepository;
import com.brokerui.broker.PriceSpread;
import com.brokerui.broker.TradingAccount;
import com.brokerui.broker.TradingAccountRepository;
import com.brokerui.broker.TradingFees;
import com.brokerui.market.MarketPriceService;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Executes an order through the internal book first (netting), then routes what is left.
 *
 * Remainder rules:
 *  - MARKET / triggered STOP: the unmatched quantity fills externally immediately (as before netting).
 *  - CLOSE (manual, stop, or liquidation): waits the same window as a marketable LIMIT, so another
 *    client's order can take the position inside. After the window the rest leaves at the bid or ask.
 *  - LIMIT that is marketable: waits up to {@code limit-wait-ms} as PENDING_NET so an opposite order
 *    can cross it internally; after the window it fills externally (if still marketable).
 *  - LIMIT that is not marketable: rests as NEW / PARTIALLY_FILLED.
 *  - LIQUIDITY (simulator): always rests; never goes external.
 *
 * Locking (plan R1): the incoming order is locked first, resting orders are locked with
 * SKIP LOCKED (never waits), accounts are locked in ascending id order. No lock is ever waited on
 * out of order, so two executions cannot deadlock; a lock failure is retried up to 3 times.
 * The NN (shadow) and MT5 calls run only after commit, never while locks are held.
 */
@Service
public class NettingService {
  private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(NettingService.class);

  public static final String NEW = "NEW";
  public static final String PARTIALLY_FILLED = "PARTIALLY_FILLED";
  public static final String PENDING_NET = "PENDING_NET";
  public static final String FILLED = "FILLED";
  public static final String CANCELLED = "CANCELLED";
  public static final String REJECTED = "REJECTED";
  public static final String LIQUIDITY = "LIQUIDITY";
  public static final List<String> OPEN_STATUSES = List.of(NEW, PARTIALLY_FILLED, PENDING_NET);
  private static final List<String> RESTING_TYPES = List.of("LIMIT", LIQUIDITY, "CLOSE");
  /** A closing sell accepts any mid. A closing buy (covering a short) does too. */
  private static final BigDecimal CLOSE_SELL_LIMIT = new BigDecimal("0.00000001");
  private static final BigDecimal CLOSE_BUY_LIMIT = new BigDecimal("1000000000");

  /** Service-level event codes (engine codes are in {@link NettingTypes}). */
  public static final String EXTERNAL_FILL = "EXTERNAL_FILL";
  public static final String WAITING_FOR_MATCH = "WAITING_FOR_MATCH";
  public static final String RESTING = "RESTING";
  public static final String FUNDS_SKIP = "FUNDS_SKIP";
  public static final String ORDER_REJECTED = "ORDER_REJECTED";
  public static final String MATCHED = "MATCHED";

  private final BrokerOrderRepository orderRepo;
  private final TradingAccountRepository accountRepo;
  private final InternalMatchRepository matchRepo;
  private final MarketPriceService priceService;
  private final FillBooking booking;
  private final NettingEventLog eventLog;
  private final NettingProperties props;
  private final NNPredictorClient nnClient;
  private final MT5IntegrationService mt5Service;
  private final MarginLoanService marginLoanService;
  private final PositionRepository positionRepo;
  private final EntityManager em;
  private final TransactionTemplate requiresNew;
  private final TransactionTemplate readOnly;
  private final ExecutorService shadowExecutor = Executors.newSingleThreadExecutor(r -> {
    Thread t = new Thread(r, "nn-shadow");
    t.setDaemon(true);
    return t;
  });

  public NettingService(BrokerOrderRepository orderRepo, TradingAccountRepository accountRepo,
      InternalMatchRepository matchRepo, MarketPriceService priceService, FillBooking booking,
      NettingEventLog eventLog, NettingProperties props, NNPredictorClient nnClient,
      MT5IntegrationService mt5Service, MarginLoanService marginLoanService,
      PositionRepository positionRepo, EntityManager em,
      PlatformTransactionManager txManager) {
    this.orderRepo = orderRepo;
    this.accountRepo = accountRepo;
    this.matchRepo = matchRepo;
    this.priceService = priceService;
    this.booking = booking;
    this.eventLog = eventLog;
    this.props = props;
    this.positionRepo = positionRepo;
    this.nnClient = nnClient;
    this.mt5Service = mt5Service;
    this.marginLoanService = marginLoanService;
    this.em = em;
    this.requiresNew = new TransactionTemplate(txManager);
    this.requiresNew.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    this.readOnly = new TransactionTemplate(txManager);
    this.readOnly.setReadOnly(true);
  }

  /** What happened to an order in one execution. */
  public record Result(Long orderId, String status, BigDecimal quantity, BigDecimal filledQty,
      BigDecimal internalQty, BigDecimal externalQty, BigDecimal avgPrice, String routing,
      BigDecimal newBalance, int matches) {
    public boolean anyFill() { return filledQty != null && filledQty.signum() > 0; }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Entry points
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Executes a freshly placed order in its OWN transaction (call it after the placement
   * transaction committed). Retries on lock failures.
   */
  public Result executeNow(Long orderId) {
    RuntimeException last = null;
    for (int attempt = 1; attempt <= 3; attempt++) {
      try {
        return requiresNew.execute(s -> {
          BrokerOrder o = orderRepo.findByIdForUpdate(orderId).orElseThrow(() -> new IllegalArgumentException("order " + orderId + " not found"));
          return process(o, null);
        });
      } catch (PessimisticLockingFailureException e) { // includes CannotAcquireLockException and deadlock losers
        last = e;
        log.warn("[Netting] lock conflict executing order #{} (attempt {}/3): {}", orderId, attempt, e.getMessage());
        try { Thread.sleep(50L * attempt); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
      }
    }
    throw last;
  }

  /**
   * Called from {@code OrderExecutionService.tryExecute} inside its transaction, with the order
   * already locked and its fill condition already true at {@code livePrice}.
   */
  public Result executeLocked(BrokerOrder lockedOrder, BigDecimal livePrice) {
    return process(lockedOrder, livePrice);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Core
  // ───────────────────────────────────────────────────────────────────────────

  private Result process(BrokerOrder in, BigDecimal knownMid) {
    Pending pending = new Pending(in.getSymbolCode());
    String status = in.getStatus();
    if (!OPEN_STATUSES.contains(status) || in.remainingQty().signum() <= 0) {
      return result(in, 0);
    }
    String symbol = in.getSymbolCode();
    boolean isBuy = BUY.equalsIgnoreCase(in.getSide());
    String type = in.getOrderType() == null ? "" : in.getOrderType().toUpperCase();

    BigDecimal mid = knownMid;
    if (mid == null) {
      double p = priceService.getLivePrice(symbol);
      if (!(p > 0)) {
        pending.event(in.getId(), null, "PRICE_UNAVAILABLE", "no live price for " + symbol);
        pending.publishAfterCommit();
        return result(in, 0);
      }
      mid = BigDecimal.valueOf(p);
    }
    Quote q = quoteFor(symbol, mid);

    Set<Long> simIds = new HashSet<>(accountRepo.findSimulatedIds());
    Long inAccountId = in.getTradingAccount().getId();
    boolean inSim = simIds.contains(inAccountId);
    // MARKET and triggered STOP orders accept any price (implicit limit = ask / bid).
    BigDecimal inLimit = ("LIMIT".equals(type) || LIQUIDITY.equals(type)) ? in.getLimitPrice() : null;
    IncomingOrder incoming = new IncomingOrder(in.getId(), inAccountId, inSim, isBuy ? BUY : SELL, in.remainingQty(), inLimit);

    // 1. Dry run on an unlocked snapshot of the opposite side.
    String opposite = isBuy ? SELL : BUY;
    List<BrokerOrder> candidates = orderRepo.findResting(symbol, opposite, OPEN_STATUSES, RESTING_TYPES, in.getId());
    List<RestingOrder> snapshot = toResting(candidates, simIds);
    MatchPlan dry = NettingEngine.plan(incoming, snapshot, q);

    // 2. Lock only the resting orders the plan wants (skip rows someone else holds), refresh, re-plan.
    Map<Long, BrokerOrder> lockedResting = new HashMap<>();
    MatchPlan plan = dry;
    if (!dry.fills().isEmpty()) {
      List<Long> wanted = dry.fills().stream().map(Fill::restingOrderId).toList();
      for (BrokerOrder r : orderRepo.lockSkipLocked(wanted)) {
        em.refresh(r);
        if (OPEN_STATUSES.contains(r.getStatus()) && r.remainingQty().signum() > 0) lockedResting.put(r.getId(), r);
      }
      // Fresh locked rows + the untouched rest of the snapshot (so every skip/reject is still reported;
      // a fill can only be booked against a row we actually hold — see the booking loop).
      List<RestingOrder> finalBook = toResting(new ArrayList<>(lockedResting.values()), simIds);
      for (RestingOrder r : snapshot) if (!wanted.contains(r.orderId())) finalBook.add(r);
      plan = NettingEngine.plan(incoming, finalBook, q);
    }
    for (Decision d : plan.decisions()) pending.event(in.getId(), d.restingOrderId(), d.code(), d.detail());

    // 3. Lock every account involved, lowest id first, and refresh them.
    TreeSet<Long> accountIds = new TreeSet<>();
    accountIds.add(inAccountId);
    for (Fill f : plan.fills()) if (lockedResting.containsKey(f.restingOrderId())) accountIds.add(f.restingAccountId());
    Map<Long, TradingAccount> accounts = new HashMap<>();
    for (Long id : accountIds) {
      TradingAccount ta = accountRepo.findByIdForUpdate(id).orElseThrow();
      em.refresh(ta);
      accounts.put(id, ta);
    }
    TradingAccount inTa = accounts.get(inAccountId);

    // 4. Book each internal cross (both sides at the mid).
    int matches = 0;
    BigDecimal cs = ContractSpecs.getContractSize(symbol);
    for (Fill f : plan.fills()) {
      BrokerOrder r = lockedResting.get(f.restingOrderId());
      TradingAccount rTa = accounts.get(f.restingAccountId());
      if (r == null || rTa == null) {
        pending.event(in.getId(), f.restingOrderId(), "LOCK_SKIP", "resting order is busy in another transaction");
        continue;
      }
      BigDecimal qty = f.qty().min(in.remainingQty()).min(r.remainingQty());
      if (qty.signum() <= 0) continue;
      if (!booking.canBook(in, inTa, qty, q.mid(), true)) {
        pending.event(in.getId(), r.getId(), FUNDS_SKIP, "incoming account cannot fund an internal fill");
        break;
      }
      if (!booking.canBook(r, rTa, qty, q.mid(), true)) {
        pending.event(in.getId(), r.getId(), FUNDS_SKIP, "resting account cannot fund this fill");
        continue;
      }
      booking.book(in, inTa, qty, q.mid(), booking.cost(in, inTa, qty, q.mid()), true);
      booking.book(r, rTa, qty, q.mid(), booking.cost(r, rTa, qty, q.mid()), true);
      settleStatusAfterFill(r);

      BrokerOrder buy = isBuy ? in : r;
      BrokerOrder sell = isBuy ? r : in;
      InternalMatch m = new InternalMatch();
      m.setSymbolCode(symbol);
      m.setBuyOrderId(buy.getId());
      m.setSellOrderId(sell.getId());
      m.setBuyAccountId(isBuy ? inAccountId : rTa.getId());
      m.setSellAccountId(isBuy ? rTa.getId() : inAccountId);
      m.setQuantity(qty);
      m.setBid(q.bid());
      m.setMid(q.mid());
      m.setAsk(q.ask());
      m.setBuyerImprovement(q.ask().subtract(q.mid()).multiply(qty).multiply(cs));
      m.setSellerImprovement(q.mid().subtract(q.bid()).multiply(qty).multiply(cs));
      // Both sides stayed in-house, so the venue fee is not paid on either one.
      m.setExternalFeeSaved(TradingFees.exchangeFee(symbol, qty, q.mid()).multiply(BigDecimal.valueOf(2)));
      m.setBuyerSimulated(isBuy ? inSim : f.restingSimulated());
      m.setSellerSimulated(isBuy ? f.restingSimulated() : inSim);
      m = matchRepo.save(m);
      matches++;
      pending.event(in.getId(), r.getId(), MATCHED, qty.stripTrailingZeros().toPlainString() + " @ " + q.mid().toPlainString(), m.getId());
      orderRepo.save(r);
    }

    // 5. Remainder.
    BigDecimal left = in.remainingQty();
    Instant now = Instant.now();
    if (left.signum() > 0) {
      if (LIQUIDITY.equals(type)) {
        restOrder(in);
        pending.event(in.getId(), null, RESTING, "computer quote rests " + left.stripTrailingZeros().toPlainString());
      } else if ("CLOSE".equals(type)) {
        waitThenExternal(in, inTa, left, mid, now, pending);
      } else if ("LIMIT".equals(type)) {
        boolean marketable = isBuy ? q.mid().compareTo(in.getLimitPrice()) <= 0 : q.mid().compareTo(in.getLimitPrice()) >= 0;
        if (!marketable) {
          restOrder(in);
          pending.event(in.getId(), null, RESTING, "limit " + in.getLimitPrice().toPlainString() + " not marketable at mid " + q.mid().toPlainString());
        } else {
          long wait = props.getLimitWaitMs();
          Instant deadline = in.getNetDeadline();
          if (wait > 0 && deadline == null) {
            in.setNetDeadline(now.plus(Duration.ofMillis(wait)));
            in.setStatus(PENDING_NET);
            pending.event(in.getId(), null, WAITING_FOR_MATCH, "waiting up to " + wait + " ms for an internal counterparty");
          } else if (wait > 0 && now.isBefore(deadline)) {
            in.setStatus(PENDING_NET);
          } else {
            externalFill(in, inTa, left, mid, pending);
          }
        }
      } else {
        // MARKET, or a STOP whose trigger fired: fill the rest on the external market now.
        externalFill(in, inTa, left, mid, pending);
      }
    }
    settleStatusAfterFill(in);
    orderRepo.save(in);
    for (TradingAccount ta : accounts.values()) accountRepo.save(ta);

    // 6. After commit: events, MT5, NN shadow.
    if (!LIQUIDITY.equals(type) && !inSim && props.isNnShadow()) {
      BigDecimal crossable = NettingEngine.crossableQty(incoming, snapshot, q);
      int ownDepth = 0;
      for (BrokerOrder o : orderRepo.findResting(symbol, isBuy ? BUY : SELL, OPEN_STATUSES, RESTING_TYPES, in.getId())) ownDepth++;
      double[] features = FeatureBuilder.extract(incoming.qty().doubleValue(), crossable.doubleValue(),
          q.bid().doubleValue(), q.ask().doubleValue(), ownDepth, snapshot.size(), historicalMatchRate());
      pending.shadow(in.getId(), features, in.getInternalQty() != null && in.getInternalQty().signum() > 0);
    }
    pending.publishAfterCommit();
    return result(in, matches);
  }

  /** A close waits the same window as a marketable limit, then leaves at the bid or ask. */
  private void waitThenExternal(BrokerOrder in, TradingAccount inTa, BigDecimal left, BigDecimal mid, Instant now, Pending pending) {
    if (CANCELLED.equals(in.getStatus()) || REJECTED.equals(in.getStatus())) return;
    long wait = props.getLimitWaitMs();
    Instant deadline = in.getNetDeadline();
    if (wait > 0 && (deadline == null || now.isBefore(deadline))) {
      if (deadline == null) {
        in.setNetDeadline(now.plus(Duration.ofMillis(wait)));
        pending.event(in.getId(), null, WAITING_FOR_MATCH, "close waiting up to " + wait + " ms for an internal counterparty");
      }
      in.setStatus(PENDING_NET);
    } else {
      externalFill(in, inTa, left, mid, pending);
    }
  }

  private void externalFill(BrokerOrder in, TradingAccount inTa, BigDecimal qty, BigDecimal mid, Pending pending) {
    if (CANCELLED.equals(in.getStatus()) || REJECTED.equals(in.getStatus())) return;
    boolean isBuy = BUY.equalsIgnoreCase(in.getSide());
    BigDecimal price = PriceSpread.apply(mid, isBuy);
    FillBooking.FillCost c = booking.cost(in, inTa, qty, price);
    if (!booking.canBook(in, inTa, qty, price, false)) {
      booking.releaseReserve(in, inTa);
      in.setStatus(in.getFilledQty() != null && in.getFilledQty().signum() > 0 ? CANCELLED : REJECTED);
      in.setNetDeadline(null);
      pending.event(in.getId(), null, ORDER_REJECTED, "credit limit would be exceeded by the external fill");
      log.warn("Rejected external fill of order #{} — adverse price would exceed credit limit", in.getId());
      return;
    }
    booking.book(in, inTa, qty, price, c, false);
    in.setNetDeadline(null);
    pending.event(in.getId(), null, EXTERNAL_FILL, qty.stripTrailingZeros().toPlainString() + " @ " + price.toPlainString());
    pending.mt5(in.getSymbolCode(), in.getSide(), mid.doubleValue(),
        in.getTakeProfit() != null ? in.getTakeProfit().doubleValue() : 0.0,
        in.getStopLoss() != null ? in.getStopLoss().doubleValue() : 0.0, qty.doubleValue());
  }

  private static void restOrder(BrokerOrder o) {
    o.setNetDeadline(null);
    if (!FILLED.equals(o.getStatus()) && !REJECTED.equals(o.getStatus()) && !CANCELLED.equals(o.getStatus())) {
      o.setStatus(o.getFilledQty() != null && o.getFilledQty().signum() > 0 ? PARTIALLY_FILLED : NEW);
    }
  }

  private static void settleStatusAfterFill(BrokerOrder o) {
    if (REJECTED.equals(o.getStatus()) || CANCELLED.equals(o.getStatus())) return;
    if (o.remainingQty().signum() <= 0) {
      o.setStatus(FILLED);
      o.setNetDeadline(null);
    } else if (NEW.equals(o.getStatus()) && o.getFilledQty() != null && o.getFilledQty().signum() > 0) {
      o.setStatus(PARTIALLY_FILLED);
    }
  }

  private List<RestingOrder> toResting(List<BrokerOrder> orders, Set<Long> simIds) {
    List<RestingOrder> out = new ArrayList<>();
    for (BrokerOrder o : orders) {
      Long acc = o.getTradingAccount().getId();
      long created = o.getCreatedAt() == null ? 0L : o.getCreatedAt().toEpochMilli();
      out.add(new RestingOrder(o.getId(), acc, simIds.contains(acc), o.getSide().toUpperCase(), o.remainingQty(), o.getLimitPrice(), created));
    }
    return out;
  }

  /** Live quote for a symbol, honouring the test "crossed market" override. */
  public Quote quoteFor(String symbol, BigDecimal mid) {
    MarketPriceService.TestOverride o = priceService.getTestOverride(symbol);
    if (o != null && o.crossed()) return Quote.crossed(mid);
    return Quote.of(mid);
  }

  public Quote currentQuote(String symbol) {
    double p = priceService.getLivePrice(symbol);
    if (!(p > 0)) return null;
    return quoteFor(symbol, BigDecimal.valueOf(p));
  }

  private double historicalMatchRate() {
    try {
      List<Object[]> rows = orderRepo.internalShareSince(Instant.now().minus(Duration.ofHours(24)));
      if (rows.isEmpty()) return 0;
      Object[] row = rows.get(0);
      double internal = row[0] == null ? 0 : ((Number) row[0]).doubleValue();
      double filled = row[1] == null ? 0 : ((Number) row[1]).doubleValue();
      return filled > 0 ? internal / filled : 0;
    } catch (Exception e) {
      return 0;
    }
  }

  private Result result(BrokerOrder o, int matches) {
    BigDecimal balance = null;
    try { balance = o.getTradingAccount().getBalance(); } catch (Exception ignored) {}
    return new Result(o.getId(), o.getStatus(), o.getQuantity(), o.getFilledQty(), o.getInternalQty(), o.getExternalQty(),
        o.getEntryPrice(), o.getRouting(), balance, matches);
  }

  /**
   * Puts a position close on the internal book and tries to match it now.
   * If nobody is waiting on the other side, the close stays up for the usual
   * limit window, then the rest is filled outside. Returns null when the position is gone.
   */
  public Result offerClose(Long positionId) {
    Long orderId = requiresNew.execute(s -> stageClose(positionId));
    if (orderId == null) return null;
    return executeNow(orderId);
  }

  /** Creates the close order, or returns the one already waiting for this position. */
  private Long stageClose(Long positionId) {
    Position pos = positionRepo.findById(positionId).orElse(null);
    if (pos == null || pos.getTradingAccount() == null) return null;
    Long accountId = pos.getTradingAccount().getId();
    TradingAccount ta = accountRepo.findByIdForUpdate(accountId).orElse(null);
    if (ta == null) return null;
    pos = positionRepo.findByIdForUpdate(positionId).orElse(null);
    if (pos == null || pos.getQuantity() == null || pos.getQuantity().signum() <= 0) return null;

    List<BrokerOrder> waiting = orderRepo.findByClosesPositionIdAndStatusIn(positionId, OPEN_STATUSES);
    if (!waiting.isEmpty()) return waiting.get(0).getId();

    boolean coverShort = "SHORT".equals(pos.getSide());
    BrokerOrder o = new BrokerOrder();
    o.setTradingAccount(ta);
    o.setSymbolCode(pos.getSymbolCode());
    o.setSide(coverShort ? BUY : SELL);
    o.setOrderType("CLOSE");
    o.setStatus(NEW);
    o.setQuantity(pos.getQuantity());
    o.setLimitPrice(coverShort ? CLOSE_BUY_LIMIT : CLOSE_SELL_LIMIT);
    o.setReserveRemaining(BigDecimal.ZERO);
    o.setClosesPositionId(pos.getId());
    o.setOpenPrice(pos.getAvgPrice());
    o.setOpenedAt(pos.getOpenedAt());
    o.setCommission(BigDecimal.ZERO);
    o.setFilledQty(BigDecimal.ZERO);
    o.setInternalQty(BigDecimal.ZERO);
    o.setExternalQty(BigDecimal.ZERO);
    return orderRepo.save(o).getId();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Simulator / admin helpers
  // ───────────────────────────────────────────────────────────────────────────

  /** Places a resting LIQUIDITY order for a simulated account, then lets it cross whatever is waiting. */
  public Result placeLiquidity(Long accountId, String symbol, String side, BigDecimal qty, BigDecimal limit, String tag) {
    Long id = requiresNew.execute(s -> {
      TradingAccount ta = accountRepo.findByIdForUpdate(accountId).orElseThrow();
      if (!ta.isSimulated()) throw new IllegalArgumentException("account " + accountId + " is not simulated");
      BigDecimal reserve = FillBooking.margin(symbol, qty, limit, ta);
      if (!marginLoanService.tryCoverShortfall(ta, reserve, null, null)) throw new IllegalStateException("simulated account out of funds");
      BrokerOrder o = new BrokerOrder();
      o.setTradingAccount(ta);
      o.setSymbolCode(symbol);
      o.setSide(side);
      o.setOrderType(LIQUIDITY);
      o.setStatus(NEW);
      o.setQuantity(qty);
      o.setLimitPrice(limit);
      o.setReserveRemaining(reserve);
      o.setClientTag(tag);
      ta.setFreeMargin(ta.getBalance());
      accountRepo.save(ta);
      return orderRepo.save(o).getId();
    });
    return executeNow(id);
  }

  /** A MARKET order from a simulated account (the computer taking liquidity). */
  public Result placeSimMarket(Long accountId, String symbol, String side, BigDecimal qty, String tag) {
    Long id = requiresNew.execute(s -> {
      TradingAccount ta = accountRepo.findByIdForUpdate(accountId).orElseThrow();
      if (!ta.isSimulated()) throw new IllegalArgumentException("account " + accountId + " is not simulated");
      double p = priceService.getLivePrice(symbol);
      if (!(p > 0)) throw new IllegalStateException("price unavailable for " + symbol);
      BigDecimal px = PriceSpread.apply(BigDecimal.valueOf(p), BUY.equals(side));
      BigDecimal reserve = FillBooking.margin(symbol, qty, px, ta).add(TradingFees.calculateCommission(symbol, qty, px));
      if (!marginLoanService.tryCoverShortfall(ta, reserve, null, null)) throw new IllegalStateException("simulated account out of funds");
      BrokerOrder o = new BrokerOrder();
      o.setTradingAccount(ta);
      o.setSymbolCode(symbol);
      o.setSide(side);
      o.setOrderType("MARKET");
      o.setStatus(NEW);
      o.setQuantity(qty);
      o.setReserveRemaining(reserve);
      o.setClientTag(tag);
      accountRepo.save(ta);
      return orderRepo.save(o).getId();
    });
    return executeNow(id);
  }

  /**
   * Cancels a LIQUIDITY order (skip if another transaction is using it). Never-filled ones are
   * deleted so the simulator does not flood the orders table.
   *
   * @return true if cancelled/deleted
   */
  public boolean cancelLiquidity(Long orderId) {
    return Boolean.TRUE.equals(requiresNew.execute(s -> {
      List<BrokerOrder> locked = orderRepo.lockSkipLocked(List.of(orderId));
      if (locked.isEmpty()) return false;
      BrokerOrder o = locked.get(0);
      em.refresh(o);
      if (!LIQUIDITY.equals(o.getOrderType()) || !OPEN_STATUSES.contains(o.getStatus())) return false;
      TradingAccount ta = accountRepo.findByIdForUpdate(o.getTradingAccount().getId()).orElseThrow();
      em.refresh(ta);
      booking.releaseReserve(o, ta);
      accountRepo.save(ta);
      if (o.getFilledQty() == null || o.getFilledQty().signum() == 0) {
        orderRepo.delete(o);
      } else {
        o.setStatus(CANCELLED);
        orderRepo.save(o);
      }
      return true;
    }));
  }

  public NettingEventLog events() { return eventLog; }

  // ───────────────────────────────────────────────────────────────────────────
  // After-commit side effects
  // ───────────────────────────────────────────────────────────────────────────

  private final class Pending {
    private final String symbol;
    private final List<Object[]> events = new ArrayList<>();
    private final List<Runnable> afterCommit = new ArrayList<>();

    Pending(String symbol) { this.symbol = symbol; }

    void event(Long orderId, Long restingId, String code, String detail) { event(orderId, restingId, code, detail, null); }

    void event(Long orderId, Long restingId, String code, String detail, Long matchId) {
      events.add(new Object[] { orderId, restingId, code, detail, matchId });
    }

    void mt5(String sym, String side, double price, double tp, double sl, double lot) {
      afterCommit.add(() -> {
        try {
          mt5Service.sendTrade(sym, side, price, tp, sl, lot);
        } catch (Exception ex) {
          log.error("[MT5 ROUTING ERROR] Failed to forward trade to MT5: {}", ex.getMessage());
        }
      });
    }

    void shadow(Long orderId, double[] features, boolean actuallyInternal) {
      afterCommit.add(() -> shadowExecutor.submit(() -> runShadow(orderId, features, actuallyInternal)));
    }

    void publishAfterCommit() {
      Runnable publish = () -> {
        for (Object[] e : events) eventLog.add(symbol, (Long) e[0], (Long) e[1], (String) e[2], (String) e[3], (Long) e[4]);
        for (Runnable r : afterCommit) r.run();
      };
      if (TransactionSynchronizationManager.isSynchronizationActive()) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
          @Override public void afterCommit() { publish.run(); }
        });
      } else {
        publish.run();
      }
    }
  }

  private void runShadow(Long orderId, double[] features, boolean actuallyInternal) {
    try {
      Double prob = null;
      BigDecimal savings = null;
      String route;
      if (props.isNnOffline()) {
        route = "OFFLINE";
      } else {
        Map<String, Object> pred = nnClient.getPrediction(features);
        if (pred == null) {
          route = "OFFLINE";
        } else {
          prob = ((Number) pred.get("matchProb")).doubleValue();
          savings = BigDecimal.valueOf(((Number) pred.get("expectedSavings")).doubleValue());
          route = ((Number) pred.get("routeRecommendation")).doubleValue() > 0.5 ? "INTERNAL" : "EXTERNAL";
        }
      }
      Boolean correct = "OFFLINE".equals(route) ? null : ("INTERNAL".equals(route) == actuallyInternal);
      final Double p = prob;
      final BigDecimal sv = savings;
      requiresNew.execute(s -> orderRepo.updateNnShadow(orderId, p, sv, route, correct));
    } catch (Exception e) {
      log.warn("[NN shadow] order #{}: {}", orderId, e.getMessage());
    }
  }
}
