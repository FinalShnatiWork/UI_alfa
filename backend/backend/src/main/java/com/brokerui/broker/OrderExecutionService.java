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
  private final TradingAccountRepository accountRepo;
  private final PositionRepository positionRepo;
  private final BrokerOrderRepository orderRepo;
  private final TradeFillRepository fillRepo;
  private final NotificationRepository notificationRepo;
  private final SymbolRepository symbolRepo;
  private final MT5IntegrationService mt5Service;
  private final com.brokerui.market.MarketPriceService priceService;
  private final NNPredictorClient nnPredictorClient;

  @Autowired @Lazy
  private OrderExecutionService self;

  /**
   * Constructs the OrderExecutionService with required components.
   *
   * @param accountRepo database trading account repository
   * @param positionRepo database position repository
   * @param orderRepo database order repository
   * @param fillRepo database trade fill repository
   * @param notificationRepo database notification alerts repository
   * @param symbolRepo database symbols configuration repository
   * @param mt5Service MetaTrader 5 service integration
   * @param priceService general market price aggregator
   * @param nnPredictorClient Neural Network server client adapter
   */
  public OrderExecutionService(
      TradingAccountRepository accountRepo,
      PositionRepository positionRepo,
      BrokerOrderRepository orderRepo,
      TradeFillRepository fillRepo,
      NotificationRepository notificationRepo,
      SymbolRepository symbolRepo,
      MT5IntegrationService mt5Service,
      com.brokerui.market.MarketPriceService priceService,
      NNPredictorClient nnPredictorClient) {
    this.accountRepo = accountRepo;
    this.positionRepo = positionRepo;
    this.orderRepo = orderRepo;
    this.fillRepo = fillRepo;
    this.notificationRepo = notificationRepo;
    this.symbolRepo = symbolRepo;
    this.mt5Service = mt5Service;
    this.priceService = priceService;
    this.nnPredictorClient = nnPredictorClient;
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
      } catch (Exception ignored) {}
    }
    try {
      checkPositionsSlTp();
    } catch (Exception ignored) {}
  }

  /**
   * Attempts to execute a specific order by loading live price quotes and validating order fill conditions.
   *
   * @param orderId the order database ID
   */
  @Transactional
  public void tryExecute(Long orderId) {
    BrokerOrder order = orderRepo.findById(orderId).orElse(null);
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
  private void executeFilled(BrokerOrder order, BigDecimal price) {
    TradingAccount ta = order.getTradingAccount();
    ta = accountRepo.findByIdForUpdate(ta.getId()).orElseThrow();

    BigDecimal qty = order.getQuantity();
    BigDecimal contractSize = BrokerApiController.getContractSize(order.getSymbolCode());
    BigDecimal leverage = BigDecimal.valueOf(ta.getLeverage() > 0 ? ta.getLeverage() : 100);
    BigDecimal margin = price.multiply(qty).multiply(contractSize).divide(leverage, 4, RoundingMode.HALF_UP);
    BigDecimal orderEntryPrice = price;
    BigDecimal orderRealizedPnl = BigDecimal.ZERO;

    if ("BUY".equalsIgnoreCase(order.getSide())) {
      // Regular LONG BUY - Refund reserved funds, then deduct actual cost
      BigDecimal reservedPrice = order.getLimitPrice() != null ? order.getLimitPrice()
          : (order.getStopPrice() != null ? order.getStopPrice() : price);
      BigDecimal reserved = reservedPrice.multiply(qty).multiply(contractSize).divide(leverage, 4, RoundingMode.HALF_UP);
      ta.setBalance(ta.getBalance().add(reserved).subtract(margin));

      Position longPos = openNewPosition(ta, order.getSymbolCode(), "LONG", qty, price, order.getTakeProfit(), order.getStopLoss());
      positionRepo.save(longPos);
    } else { // SELL order
      // SELL-SHORT (open new SHORT position) - Refund reserved funds, then lock actual collateral
      BigDecimal reservedPrice = order.getLimitPrice() != null ? order.getLimitPrice()
          : (order.getStopPrice() != null ? order.getStopPrice() : price);
      BigDecimal reserved = reservedPrice.multiply(qty).multiply(contractSize).divide(leverage, 4, RoundingMode.HALF_UP);
      ta.setBalance(ta.getBalance().add(reserved).subtract(margin));

      Position shortPos = openNewPosition(ta, order.getSymbolCode(), "SHORT", qty, price, order.getTakeProfit(), order.getStopLoss());
      positionRepo.save(shortPos);
    }

    ta.setEquity(recalcEquity(ta));
    ta.setFreeMargin(ta.getBalance().subtract(ta.getMarginUsed() == null ? BigDecimal.ZERO : ta.getMarginUsed()));
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
      System.err.println("Failed to create notification: " + e.getMessage());
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

        java.util.Map<String, Object> pred = nnPredictorClient.getPrediction(features);
        if (pred != null) {
            double matchProb = ((Number) pred.get("matchProb")).doubleValue();
            double expectedSavings = ((Number) pred.get("expectedSavings")).doubleValue();
            double routeRecommendation = ((Number) pred.get("routeRecommendation")).doubleValue();

            order.setNnMatchProb(matchProb);
            order.setNnExpectedSavings(BigDecimal.valueOf(expectedSavings));
            order.setNnRouteRecommendation(routeRecommendation > 0.5 ? "INTERNAL" : "EXTERNAL");
            
            if (routeRecommendation > 0.5) {
                routeExternal = false;
            }
        } else {
            order.setNnRouteRecommendation("EXTERNAL");
            order.setNnMatchProb(0.0);
            order.setNnExpectedSavings(BigDecimal.ZERO);
        }
    } catch (Exception e) {
        System.err.println("Failed to fetch NN recommendation: " + e.getMessage());
        order.setNnRouteRecommendation("EXTERNAL");
        order.setNnMatchProb(0.0);
        order.setNnExpectedSavings(BigDecimal.ZERO);
    }

    orderRepo.save(order);

    TradeFill fill = new TradeFill();
    fill.setOrder(order);
    fill.setPrice(price);
    fill.setQuantity(qty);
    fill.setLiquidity("TAKER");
    fillRepo.save(fill);

    if (routeExternal) {
        // Forward to MT5
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
            System.err.println("Failed to forward trade to MT5: " + ex.getMessage());
        }
    } else {
        System.out.println("AI Advisor matching: Routed order #" + order.getId() + " internally. Skipped external MT5 routing.");
    }
  }

  /**
   * Recalculates the equity value of a trading account by summing balance and active unrealized P/L.
   *
   * @param ta the trading account
   * @return total computed equity value
   */
  private BigDecimal recalcEquity(TradingAccount ta) {
    List<Position> positions = positionRepo.findByTradingAccountIdOrderByUpdatedAtDesc(ta.getId());
    BigDecimal totalUnrealized = positions.stream()
        .map(p -> p.getUnrealizedPnl() == null ? BigDecimal.ZERO : p.getUnrealizedPnl())
        .reduce(BigDecimal.ZERO, (a, b) -> a.add(b));
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
      BigDecimal sl = pos.getStopLoss();
      BigDecimal tp = pos.getTakeProfit();
      if ((sl == null || sl.compareTo(BigDecimal.ZERO) <= 0) && (tp == null || tp.compareTo(BigDecimal.ZERO) <= 0)) {
        continue;
      }
      double currentPrice;
      try {
        currentPrice = priceService.getLivePrice(pos.getSymbolCode());
        if (currentPrice <= 0) continue;
      } catch (Exception ignored) {
        continue;
      }
      BigDecimal last = BigDecimal.valueOf(currentPrice);
      boolean isShort = "SHORT".equals(pos.getSide());
      boolean shouldClose = false;
      String reason = "";

      // Check Stop Loss
      if (sl != null && sl.compareTo(BigDecimal.ZERO) > 0) {
        if (isShort) {
          if (last.compareTo(sl) >= 0) {
            shouldClose = true;
            reason = "STOP_LOSS";
          }
        } else {
          if (last.compareTo(sl) <= 0) {
            shouldClose = true;
            reason = "STOP_LOSS";
          }
        }
      }

      // Check Take Profit
      if (tp != null && tp.compareTo(BigDecimal.ZERO) > 0) {
        if (isShort) {
          if (last.compareTo(tp) <= 0) {
            shouldClose = true;
            reason = "TAKE_PROFIT";
          }
        } else {
          if (last.compareTo(tp) >= 0) {
            shouldClose = true;
            reason = "TAKE_PROFIT";
          }
        }
      }

      if (shouldClose) {
        try {
          self.closePositionDueToSlTp(pos.getId(), last, reason);
        } catch (Exception e) {
          System.err.println("Failed to auto-close position #" + pos.getId() + " due to SL/TP: " + e.getMessage());
        }
      }
    }
  }

  @Transactional
  public void closePositionDueToSlTp(Long posId, BigDecimal closePrice, String reason) {
    Position pos = positionRepo.findByIdForUpdate(posId).orElse(null);
    if (pos == null) return;
    TradingAccount ta = pos.getTradingAccount();
    ta = accountRepo.findByIdForUpdate(ta.getId()).orElseThrow();

    BigDecimal qty = pos.getQuantity();
    BigDecimal avg = pos.getAvgPrice() == null ? BigDecimal.ZERO : pos.getAvgPrice();
    boolean isShort = "SHORT".equals(pos.getSide());

    BigDecimal contractSize = BrokerApiController.getContractSize(pos.getSymbolCode());
    BigDecimal leverage = BigDecimal.valueOf(ta.getLeverage() > 0 ? ta.getLeverage() : 100);
    BigDecimal marginReturned = avg.multiply(qty).multiply(contractSize).divide(leverage, 4, RoundingMode.HALF_UP);

    BigDecimal pnl;
    if (isShort) {
      pnl = avg.subtract(closePrice).multiply(qty).multiply(contractSize);
    } else {
      pnl = closePrice.subtract(avg).multiply(qty).multiply(contractSize);
    }
    ta.setBalance(ta.getBalance().add(marginReturned).add(pnl));
    positionRepo.delete(pos);
    ta.setEquity(recalcEquity(ta));
    ta.setFreeMargin(ta.getBalance().subtract(ta.getMarginUsed() == null ? BigDecimal.ZERO : ta.getMarginUsed()));
    accountRepo.save(ta);

    // Save history order
    BrokerOrder order = new BrokerOrder();
    order.setTradingAccount(ta);
    order.setSymbolCode(pos.getSymbolCode());
    order.setSide(isShort ? "BUY" : "SELL");
    order.setOrderType("MARKET");
    order.setStatus("FILLED");
    order.setQuantity(qty);
    order.setFilledAt(Instant.now());
    order.setEntryPrice(closePrice);
    order.setRealizedPnl(pnl);
    orderRepo.save(order);

    // Push notification
    try {
      Notification notif = new Notification();
      notif.setUser(ta.getUser());
      notif.setNotifType("TRADE");
      notif.setTitle(reason.equals("STOP_LOSS") ? "notification.tradeClosed.slTriggered" : "notification.tradeClosed.tpTriggered");
      notif.setBody(String.format(java.util.Locale.US, "{\"side\":\"%s\",\"qty\":\"%.4f\",\"symbol\":\"%s\",\"price\":\"%.4f\",\"pnl\":\"%.2f\"}", 
          isShort ? "BUY" : "SELL", qty.doubleValue(), pos.getSymbolCode(), closePrice.doubleValue(), pnl.doubleValue()));
      notificationRepo.save(notif);
    } catch (Exception e) {
      System.err.println("Failed to push SL/TP close notification: " + e.getMessage());
    }
  }
}
