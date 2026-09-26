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
 * Feeds live pricing quotes, executes orders when conditions match, recalculates accounts equity,
 * calls the Python NN model advisor, and routes orders either internally or forwards them to the MT5 bridge.
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
  private final NNPredictorClient nnPredictorClient;
  private final MarginLoanService marginLoanService;
  private final AccountTransactionRepository txRepo;

  @Autowired @Lazy
  private OrderExecutionService self;

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
      AccountTransactionRepository txRepo) {
    this.accountRepo = accountRepo;
    this.txRepo = txRepo;
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
    List<BrokerOrder> open = orderRepo.findTop50ByStatusOrderByCreatedAtAsc("NEW");
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
    if (!"NEW".equalsIgnoreCase(order.getStatus())) return;

    String symbolCode = order.getSymbolCode();
    Symbol sym = symbolRepo.findByCode(symbolCode).orElse(null);
    if (sym == null || !sym.isEnabled()) {
      order.setStatus("REJECTED");
      orderRepo.save(order);
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

    boolean shouldFill = (type.equals("MARKET")) ||
        switch (type) {
          case "LIMIT" -> shouldFillLimit(order, side, last);
          case "STOP" -> shouldFillStop(order, side, last);
          default -> false;
        };
    if (!shouldFill) return;

    // Re-check under the same row lock: a concurrent cancel that already finished would
    // have flipped status away from NEW before we could acquire the lock.
    if (!"NEW".equalsIgnoreCase(order.getStatus())) return;

    executeFilled(order, last);
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
   * Core logic that fills the matched order.
   * Deducts funds/collateral, updates balance, creates position record, queries the AI advisor,
   * logs the fill, and forwards to MT5 if internal AI matching is skipped.
   *
   * @param order the matched order entity
   * @param price the actual execution price quote
   */
  private void executeFilled(BrokerOrder order, BigDecimal rawPrice) {
    TradingAccount ta = order.getTradingAccount();
    ta = accountRepo.findByIdForUpdate(ta.getId()).orElseThrow();
    
    boolean isBuy = "BUY".equalsIgnoreCase(order.getSide());
    BigDecimal price = TradingFees.applySpread(rawPrice, isBuy);

    BigDecimal qty = order.getQuantity();
    BigDecimal contractSize = BrokerApiController.getContractSize(order.getSymbolCode());
    BigDecimal leverage = BigDecimal.valueOf(ta.getLeverage() > 0 ? ta.getLeverage() : 100);
    BigDecimal margin = price.multiply(qty).multiply(contractSize).divide(leverage, 4, RoundingMode.HALF_UP);
    BigDecimal orderEntryPrice = price;
    BigDecimal orderRealizedPnl = BigDecimal.ZERO;

    // Commission is only charged once the order actually fills (not on pending reservation).
    // Uses the same dynamic formula as MARKET orders so LIMIT/STOP fills aren't charged a
    // different (flat) fee for an equivalent trade.
    BigDecimal commission = TradingFees.calculateCommission(order.getSymbolCode(), qty, price);

    BigDecimal reservedPrice = order.getLimitPrice() != null ? order.getLimitPrice()
        : (order.getStopPrice() != null ? order.getStopPrice() : price);
    BigDecimal reserved = reservedPrice.multiply(qty).multiply(contractSize).divide(leverage, 4, RoundingMode.HALF_UP);
    BigDecimal actualCost = margin.add(commission);
    BigDecimal unusedReserve = reserved.subtract(actualCost);
    if (unusedReserve.compareTo(BigDecimal.ZERO) >= 0) {
      marginLoanService.repaySettlementOrBorrow(ta, unusedReserve);
    } else {
      // Fill is more expensive than the reservation (worse price + commission). Extra borrow
      // used to skip the credit-limit check; a client at the ceiling could open uncapped debt.
      BigDecimal extra = actualCost.subtract(reserved);
      if (!marginLoanService.tryCoverShortfall(ta, extra, ta.getUser(), null)) {
        marginLoanService.repaySettlementOrBorrow(ta, reserved);
        order.setStatus("REJECTED");
        orderRepo.save(order);
        ta.setEquity(recalcEquity(ta));
        ta.setFreeMargin(ta.getBalance());
        accountRepo.save(ta);
        log.warn("Rejected fill of order #{} — adverse price would exceed credit limit (reserved {}, needed {})",
            order.getId(), reserved, actualCost);
        return;
      }
    }

    TradingFees.charge(ta, order, commission);
    AccountTransaction feeTx = new AccountTransaction();
    feeTx.setTradingAccount(ta);
    feeTx.setTxType("COMMISSION");
    feeTx.setAmount(commission);
    feeTx.setCurrency(ta.getCurrency());
    feeTx.setStatus("APPROVED");
    feeTx.setProcessedAt(java.time.Instant.now());
    txRepo.save(feeTx);

    String posSide = isBuy ? "LONG" : "SHORT";
    positionRepo.save(openNewPosition(ta, order.getSymbolCode(), posSide, qty, price, order.getTakeProfit(), order.getStopLoss()));

    ta.setEquity(recalcEquity(ta));
    // Prepaid-margin model: remaining balance is free cash.
    ta.setFreeMargin(ta.getBalance());
    accountRepo.save(ta);

    try {
      Notification notif = new Notification();
      notif.setUser(ta.getUser());
      notif.setNotifType("TRADE");
      notif.setTitle("notification.tradeOpened.title");
      notif.setBody(String.format(java.util.Locale.US, "{\"side\":\"%s\",\"qty\":\"%.4f\",\"symbol\":\"%s\",\"price\":\"%.4f\"}", 
          order.getSide(), qty.doubleValue(), order.getSymbolCode(), price.doubleValue()));
      notificationRepo.save(notif);
    } catch (Exception e) {
      log.warn("Failed to create notification: {}", e.getMessage());
    }

    order.setStatus("FILLED");
    order.setFilledAt(Instant.now());
    order.setEntryPrice(orderEntryPrice);
    order.setRealizedPnl(orderRealizedPnl);

    // Call Neural Network Predictor for Routing Decision
    boolean routeExternal = true;
    try {
        double buyQtyNorm = qty.doubleValue() / 100.0;
        double sellQtyNorm = 0.45;
        try {
            long activeSellQty = orderRepo.countBySymbolCodeAndSideAndStatus(order.getSymbolCode(), "SELL", "NEW");
            if (activeSellQty > 0) sellQtyNorm = activeSellQty / 100.0;
        } catch (Exception ignored) {}

        double pVal = price.doubleValue();
        double scaledPrice = pVal;
        if (pVal > 0) {
            double log10 = Math.log10(pVal);
            long exp = Math.round(log10) - 2;
            scaledPrice = pVal / Math.pow(10, exp);
        }
        double spreadNorm = Math.min((scaledPrice * 0.00015) / 1.0, 1.0);

        double imbalance = 0.0;
        try {
            long buys = orderRepo.countBySymbolCodeAndSideAndStatus(order.getSymbolCode(), "BUY", "NEW");
            long sells = orderRepo.countBySymbolCodeAndSideAndStatus(order.getSymbolCode(), "SELL", "NEW");
            if (buys + sells > 0) {
                imbalance = (double) (buys - sells) / (buys + sells);
            }
        } catch (Exception ignored) {}

        double midPriceNorm = Math.min(scaledPrice / 200.0, 1.0);

        double bookDepthBuy = 0.0;
        try {
            bookDepthBuy = orderRepo.countBySymbolCodeAndSideAndStatus(order.getSymbolCode(), "BUY", "NEW") / 10.0;
        } catch (Exception ignored) {}

        double bookDepthSell = 0.0;
        try {
            bookDepthSell = orderRepo.countBySymbolCodeAndSideAndStatus(order.getSymbolCode(), "SELL", "NEW") / 10.0;
        } catch (Exception ignored) {}

        double[] features = {
            buyQtyNorm, sellQtyNorm, spreadNorm, imbalance,
            midPriceNorm, bookDepthBuy, bookDepthSell, 0.72
        };

        // AI ROUTING DECISION:
        // - INTERNAL (B-Book / Internal Matching): Retail / Noise trade. The brokerage acts as counterparty, capturing spread & commission.
        // - EXTERNAL (A-Book / MT5 Routing Bridge): High-probability / Toxic trade. Forwarded to MetaTrader 5 bridge to hedge risk externally.
        java.util.Map<String, Object> pred = nnPredictorClient.getPrediction(features);
        if (pred != null) {
            double matchProb = ((Number) pred.get("matchProb")).doubleValue();
            double expectedSavings = ((Number) pred.get("expectedSavings")).doubleValue();
            double routeRecommendation = ((Number) pred.get("routeRecommendation")).doubleValue();

            order.setNnMatchProb(matchProb);
            order.setNnExpectedSavings(BigDecimal.valueOf(expectedSavings));
            
            if (routeRecommendation > 0.5) {
                // INTERNAL (B-Book): Retain trade internally in platform liquidity pool
                order.setNnRouteRecommendation("INTERNAL");
                routeExternal = false;
            } else {
                // EXTERNAL (A-Book): Hedge trade externally via MetaTrader 5 Bridge
                order.setNnRouteRecommendation("EXTERNAL");
                routeExternal = true;
            }
        } else {
            order.setNnRouteRecommendation("EXTERNAL");
            order.setNnMatchProb(0.0);
            order.setNnExpectedSavings(BigDecimal.ZERO);
        }
    } catch (Exception e) {
        log.warn("[AI ROUTING ERROR] Failed to fetch NN recommendation: {}", e.getMessage());
        order.setNnRouteRecommendation("EXTERNAL");
        order.setNnMatchProb(0.0);
        order.setNnExpectedSavings(BigDecimal.ZERO);
    }

    orderRepo.save(order);

    if (routeExternal) {
        // EXTERNAL ROUTING: Forward trade to MetaTrader 5 Bridge
        log.info("[AI ROUTING - EXTERNAL (A-BOOK)] Order #{} for {} {} {} @ {} routed to MetaTrader 5 Bridge.",
            order.getId(), order.getSide(), order.getSymbolCode(),
            String.format("%.4f", qty.doubleValue()), String.format("%.4f", price.doubleValue()));
        try {
            mt5Service.sendTrade(
                order.getSymbolCode(), 
                order.getSide(), 
                price.doubleValue(), 
                order.getTakeProfit() != null ? order.getTakeProfit().doubleValue() : 0.0, 
                order.getStopLoss() != null ? order.getStopLoss().doubleValue() : 0.0, 
                qty.doubleValue()
            );
        } catch (Exception ex) {
            log.error("[MT5 ROUTING ERROR] Failed to forward trade to MT5: {}", ex.getMessage());
        }
    } else {
        // INTERNAL ROUTING: Retain trade internally on platform ledger
        log.info("[AI ROUTING - INTERNAL (B-BOOK)] Order #{} for {} {} {} @ {} matched internally. Skipped MT5 routing.",
            order.getId(), order.getSide(), order.getSymbolCode(),
            String.format("%.4f", qty.doubleValue()), String.format("%.4f", price.doubleValue()));
    }
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

  /**
   * Factory method to build a new Position instance.
   *
   * @param ta trading account
   * @param symbolCode asset symbol
   * @param side position side (LONG or SHORT)
   * @param qty asset volume quantity
   * @param fillPrice entry rate price
   * @return populated Position entity
   */
  private Position openNewPosition(TradingAccount ta, String symbolCode, String side, BigDecimal qty, BigDecimal fillPrice, BigDecimal tp, BigDecimal sl) {
    Position pos = new Position();
    pos.setTradingAccount(ta);
    pos.setSymbolCode(symbolCode);
    pos.setSide(side);
    pos.setQuantity(qty);
    pos.setAvgPrice(fillPrice);
    pos.setUnrealizedPnl(BigDecimal.ZERO);
    pos.setOpenedAt(Instant.now());
    pos.setTakeProfit(tp);
    pos.setStopLoss(sl);
    return pos;
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
    TradingFees.charge(ta, order, close.closeCommission());

    AccountTransaction closeFeeTx = new AccountTransaction();
    closeFeeTx.setTradingAccount(ta);
    closeFeeTx.setTxType("COMMISSION");
    closeFeeTx.setAmount(close.closeCommission());
    closeFeeTx.setCurrency(ta.getCurrency());
    closeFeeTx.setStatus("APPROVED");
    closeFeeTx.setProcessedAt(Instant.now());
    txRepo.save(closeFeeTx);

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
