package com.brokerui.broker;

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
 * Core service class for executing and managing limit, stop, and market orders.
 * Feeds live pricing quotes and, when an order's fill condition is met, hands it to
 * {@link com.brokerui.broker.netting.NettingService}: the internal book first (netting at the mid),
 * then the remainder (external market / MT5, or a PENDING_NET wait for marketable LIMITs).
 * Also runs the SL/TP sweep. The NN advisor is only consulted in shadow mode, after commit.
 */
@Service
public class OrderExecutionService {
  private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(OrderExecutionService.class);
  private final TradingAccountRepository accountRepo;
  private final PositionRepository positionRepo;
  private final BrokerOrderRepository orderRepo;
  private final NotificationRepository notificationRepo;
  private final SymbolRepository symbolRepo;
  private final MT5IntegrationService mt5Service;
  private final com.brokerui.market.MarketPriceService priceService;
  /** Kept for constructor compatibility; the NN is now called by NettingService in shadow mode. */
  private final NNPredictorClient nnPredictorClient;
  private final MarginLoanService marginLoanService;
  private final CommissionLedger commissionLedger;

  @Autowired @Lazy
  private OrderExecutionService self;

  /** Netting engine entry point (field-injected so existing constructor-based tests stay unchanged). */
  @Autowired(required = false) @Lazy
  private com.brokerui.broker.netting.NettingService nettingService;

  /**
   * Constructs the OrderExecutionService with required components.
   *
   * @param accountRepo database trading account repository
   * @param positionRepo database position repository
   * @param orderRepo database order repository
   * @param notificationRepo database notification alerts repository
   * @param symbolRepo database symbols configuration repository
   * @param mt5Service MetaTrader 5 service integration
   * @param priceService general market price aggregator
   * @param nnPredictorClient Neural Network server client adapter
   * @param marginLoanService margin credit line service
   */
  public OrderExecutionService(
      TradingAccountRepository accountRepo,
      PositionRepository positionRepo,
      BrokerOrderRepository orderRepo,
      NotificationRepository notificationRepo,
      SymbolRepository symbolRepo,
      MT5IntegrationService mt5Service,
      com.brokerui.market.MarketPriceService priceService,
      NNPredictorClient nnPredictorClient,
      MarginLoanService marginLoanService,
      CommissionLedger commissionLedger) {
    this.accountRepo = accountRepo;
    this.commissionLedger = commissionLedger;
    this.positionRepo = positionRepo;
    this.orderRepo = orderRepo;
    this.notificationRepo = notificationRepo;
    this.symbolRepo = symbolRepo;
    this.mt5Service = mt5Service;
    this.priceService = priceService;
    this.nnPredictorClient = nnPredictorClient;
    this.marginLoanService = marginLoanService;
  }

  /**
   * Periodic scheduler tick running every 2 seconds.
   * Scans for pending NEW orders and attempts execution.
   */
  @Scheduled(fixedDelay = 2000)
  public void tick() {
    // NEW + PARTIALLY_FILLED + PENDING_NET, never the simulator's LIQUIDITY orders (they only fill by netting).
    List<BrokerOrder> open = orderRepo.findExecutable(com.brokerui.broker.netting.NettingService.OPEN_STATUSES,
        org.springframework.data.domain.PageRequest.of(0, 50));
    for (BrokerOrder o : open) {
      try {
        self.tryExecute(o.getId());
      } catch (Exception e) {
        // Must not abort the whole tick, but silence here used to leave orders stuck in NEW
        // with no trace of why.
        log.error("Failed to execute order #{}: {}", o.getId(), e.getMessage(), e);
      }
    }
    try {
      checkPositionsSlTp();
    } catch (Exception e) {
      log.error("SL/TP sweep failed: {}", e.getMessage(), e);
    }
  }

  /**
   * Attempts to execute a specific order by loading live price quotes and validating order fill conditions.
   *
   * @param orderId the order database ID
   */
  @Transactional
  public void tryExecute(Long orderId) {
    // Lock the order row first (before the account) so cancelOrder cannot refund the
    // reservation while this fill is in flight — both paths share this lock order.
    BrokerOrder order = orderRepo.findByIdForUpdate(orderId).orElse(null);
    if (order == null) return;
    if (!isOpen(order.getStatus())) return;
    // Simulator quotes never fill against the market — only through netting.
    if ("LIQUIDITY".equalsIgnoreCase(order.getOrderType())) return;

    String symbolCode = order.getSymbolCode();
    Symbol sym = symbolRepo.findByCode(symbolCode).orElse(null);
    // A close must still go through on a disabled symbol, otherwise the position is stuck.
    if ((sym == null || !sym.isEnabled()) && !"CLOSE".equalsIgnoreCase(order.getOrderType())) {
      rejectAndRefund(order);
      return;
    }

    BigDecimal last;
    try {
      double price = priceService.getLivePrice(symbolCode);
      if (price <= 0) return; // keep NEW
      last = BigDecimal.valueOf(price);
    } catch (Exception e) {
      return; // keep NEW
    }

    String side = order.getSide() == null ? "" : order.getSide().trim().toUpperCase();
    String type = order.getOrderType() == null ? "" : order.getOrderType().trim().toUpperCase();

    boolean shouldFill = (type.equals("MARKET") || type.equals("CLOSE")) ||
        switch (type) {
          case "LIMIT" -> shouldFillLimit(order, side, last);
          case "STOP" -> shouldFillStop(order, side, last);
          default -> false;
        };
    if (!shouldFill) {
      // A LIMIT that was waiting for an internal counterparty is no longer marketable: back to resting.
      if ("PENDING_NET".equalsIgnoreCase(order.getStatus())) {
        boolean partly = order.getFilledQty() != null && order.getFilledQty().signum() > 0;
        order.setStatus(partly ? "PARTIALLY_FILLED" : "NEW");
        order.setNetDeadline(null);
        orderRepo.save(order);
      }
      return;
    }

    // Re-check under the same row lock: a concurrent cancel that already finished would
    // have flipped status away from NEW before we could acquire the lock.
    if (!isOpen(order.getStatus())) return;

    if (nettingService == null) {
      throw new IllegalStateException("NettingService is not available");
    }
    // Internal book first, then the remainder (external now, or wait as PENDING_NET for LIMITs).
    nettingService.executeLocked(order, last);
  }

  /** Rejects an open order and returns whatever is still reserved for it, same as a cancel. */
  private void rejectAndRefund(BrokerOrder order) {
    TradingAccount ta = order.getTradingAccount() == null ? null
        : accountRepo.findByIdForUpdate(order.getTradingAccount().getId()).orElse(null);
    if (ta != null) {
      BigDecimal refund = com.brokerui.broker.netting.FillBooking.outstandingReserve(order, ta);
      if (refund.compareTo(BigDecimal.ZERO) > 0) {
        marginLoanService.repaySettlementOrBorrow(ta, refund);
        ta.setEquity(recalcEquity(ta));
        ta.setFreeMargin(ta.getBalance());
        accountRepo.save(ta);
      }
    }
    order.setReserveRemaining(BigDecimal.ZERO);
    order.setStatus("REJECTED");
    order.setNetDeadline(null);
    orderRepo.save(order);
  }

  private static boolean isOpen(String status) {
    return status != null && com.brokerui.broker.netting.NettingService.OPEN_STATUSES.contains(status.toUpperCase());
  }

  /**
   * Helper to verify if the limit order criteria match the current live price.
   *
   * @param o limit order
   * @param side BUY or SELL side
   * @param last last live quote
   * @return true if order must be filled, false otherwise
   */
  private static boolean shouldFillLimit(BrokerOrder o, String side, BigDecimal last) {
    BigDecimal limit = o.getLimitPrice();
    if (limit == null) return false;
    if ("BUY".equals(side)) return last.compareTo(limit) <= 0;
    if ("SELL".equals(side)) return last.compareTo(limit) >= 0;
    return false;
  }

  /**
   * Helper to verify if the stop order criteria match the current live price.
   *
   * @param o stop order
   * @param side BUY or SELL side
   * @param last last live quote
   * @return true if order must be filled, false otherwise
   */
  private static boolean shouldFillStop(BrokerOrder o, String side, BigDecimal last) {
    BigDecimal stop = o.getStopPrice();
    if (stop == null) return false;
    if ("BUY".equals(side)) return last.compareTo(stop) >= 0;
    if ("SELL".equals(side)) return last.compareTo(stop) <= 0;
    return false;
  }

  /**
   * Recalculates equity as cash balance + live floating P/L (prepaid-margin model).
   * Same definition as {@link BrokerApiController} overview equity / Dashboard.
   */
  private BigDecimal recalcEquity(TradingAccount ta) {
    List<Position> positions = positionRepo.findByTradingAccountIdOrderByUpdatedAtDesc(ta.getId());
    BigDecimal totalUnrealized = BigDecimal.ZERO;
    for (Position p : positions) {
      try {
        double live = priceService.getLivePrice(p.getSymbolCode());
        if (live <= 0) {
          totalUnrealized = totalUnrealized.add(p.getUnrealizedPnl() == null ? BigDecimal.ZERO : p.getUnrealizedPnl());
          continue;
        }
        totalUnrealized = totalUnrealized.add(BrokerApiController.liveUnrealizedPnl(p, BigDecimal.valueOf(live)));
      } catch (Exception e) {
        totalUnrealized = totalUnrealized.add(p.getUnrealizedPnl() == null ? BigDecimal.ZERO : p.getUnrealizedPnl());
      }
    }
    return ta.getBalance().add(totalUnrealized);
  }

  private void checkPositionsSlTp() {
    List<Position> active = positionRepo.findAll();
    for (Position pos : active) {
      double currentPrice;
      try {
        currentPrice = priceService.getLivePrice(pos.getSymbolCode());
        if (currentPrice <= 0) continue;
      } catch (Exception ignored) {
        continue;
      }
      BigDecimal last = BigDecimal.valueOf(currentPrice);

      // Keep stored floating P/L fresh so equity/API stay aligned with live prices
      // even when the position has no SL/TP attached.
      try {
        self.refreshUnrealizedPnl(pos.getId(), last);
      } catch (Exception e) {
        log.warn("Failed to refresh floating P/L for position #{}: {}", pos.getId(), e.getMessage());
      }

      BigDecimal sl = pos.getStopLoss();
      BigDecimal tp = pos.getTakeProfit();
      if ((sl == null || sl.compareTo(BigDecimal.ZERO) <= 0) && (tp == null || tp.compareTo(BigDecimal.ZERO) <= 0)) {
        continue;
      }

      boolean isShort = "SHORT".equals(pos.getSide());
      // Trigger on the executable price (same Bid/Ask the fill will use), not the mid.
      // Triggering on mid then filling at spread systematically closed the client past their SL.
      BigDecimal exec = TradingFees.applySpread(last, isShort);
      boolean shouldClose = false;
      String reason = "";

      if (sl != null && sl.compareTo(BigDecimal.ZERO) > 0) {
        if (isShort) {
          if (exec.compareTo(sl) >= 0) { shouldClose = true; reason = "STOP_LOSS"; }
        } else {
          if (exec.compareTo(sl) <= 0) { shouldClose = true; reason = "STOP_LOSS"; }
        }
      }

      if (tp != null && tp.compareTo(BigDecimal.ZERO) > 0) {
        if (isShort) {
          if (exec.compareTo(tp) <= 0) { shouldClose = true; reason = "TAKE_PROFIT"; }
        } else {
          if (exec.compareTo(tp) >= 0) { shouldClose = true; reason = "TAKE_PROFIT"; }
        }
      }

      if (shouldClose) {
        try {
          self.closePositionDueToSlTp(pos.getId(), last, reason);
        } catch (Exception e) {
          log.error("Failed to auto-close position #{} due to SL/TP: {}", pos.getId(), e.getMessage());
        }
      }
    }
  }

  /**
   * Re-reads the position inside its own transaction and updates its stored floating P/L.
   * <p>
   * The caller iterates over a snapshot taken before the (network-bound) price lookups, so by
   * now a position may already have been closed. Re-reading by id and bailing out when it is
   * gone is what keeps that case safe: calling {@code save()} on the stale detached instance
   * would make Hibernate re-insert the deleted row, resurrecting a closed position.
   *
   * @param posId     the position to refresh
   * @param livePrice the live quote to value it at
   */
  @Transactional
  public void refreshUnrealizedPnl(Long posId, BigDecimal livePrice) {
    Position pos = positionRepo.findById(posId).orElse(null);
    if (pos == null) return; // already closed — must not be written back
    BigDecimal uPnl = BrokerApiController.liveUnrealizedPnl(pos, livePrice);
    if (pos.getUnrealizedPnl() == null || pos.getUnrealizedPnl().compareTo(uPnl) != 0) {
      pos.setUnrealizedPnl(uPnl); // managed entity — flushed on commit, no merge/insert risk
    }
  }

  @Transactional
  public void closePositionDueToSlTp(Long posId, BigDecimal closePrice, String reason) {
    // A stop or take-profit is a forced close. Offer it to the internal book for the
    // same short window as a manual close, so another client can take it.
    if (nettingService != null) {
      nettingService.offerClose(posId);
      return;
    }
    // Locks are always taken account-first, then position — the same order used by
    // BrokerApiController.closePosition and MarginLoanService.liquidateAccount. Mixing the
    // order between these paths let two concurrent closes deadlock on each other.
    Long accountId = positionRepo.findById(posId)
        .map(p -> p.getTradingAccount().getId())
        .orElse(null);
    if (accountId == null) return;
    TradingAccount ta = accountRepo.findByIdForUpdate(accountId).orElse(null);
    if (ta == null) return;
    Position pos = positionRepo.findByIdForUpdate(posId).orElse(null);
    if (pos == null) return; // closed by the user (or liquidated) while we waited for the lock

    PositionCloseMath.Snapshot close = PositionCloseMath.compute(pos, ta, closePrice);
    BigDecimal qty = close.quantity();
    boolean isShort = close.shortPosition();
    closePrice = close.closePrice();
    BigDecimal netPnl = close.netPnl();

    BrokerOrder order = new BrokerOrder();
    order.setTradingAccount(ta);
    order.setSymbolCode(pos.getSymbolCode());
    order.setSide(close.closeSide());
    order.setOrderType("MARKET");
    order.setStatus("FILLED");
    order.setQuantity(qty);
    order.setFilledAt(Instant.now());
    order.setEntryPrice(closePrice);
    order.setRealizedPnl(netPnl);
    order.setOpenPrice(pos.getAvgPrice());
    order.setOpenedAt(pos.getOpenedAt());
    commissionLedger.record(ta, order, close.closeCommission());

    marginLoanService.repaySettlementOrBorrow(ta, close.settlement());
    positionRepo.delete(pos);
    ta.setEquity(recalcEquity(ta));
    ta.setFreeMargin(ta.getBalance());
    accountRepo.save(ta);
    orderRepo.save(order);

    try {
      Notification notif = new Notification();
      notif.setUser(ta.getUser());
      notif.setNotifType("TRADE");
      notif.setTitle(reason.equals("STOP_LOSS") ? "notification.tradeClosed.slTriggered" : "notification.tradeClosed.tpTriggered");
      notif.setBody(String.format(java.util.Locale.US, "{\"side\":\"%s\",\"qty\":\"%.4f\",\"symbol\":\"%s\",\"price\":\"%.4f\",\"pnl\":\"%.2f\"}",
          pos.getSide(), qty.doubleValue(), pos.getSymbolCode(), closePrice.doubleValue(), netPnl.doubleValue()));
      notificationRepo.save(notif);
    } catch (Exception e) {
      log.warn("Failed to push SL/TP close notification: {}", e.getMessage());
    }
  }
}
