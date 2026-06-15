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

  @Scheduled(fixedDelay = 2000)
  public void tick() {
    List<BrokerOrder> open = orderRepo.findTop50ByStatusOrderByCreatedAtAsc("NEW");
    for (BrokerOrder o : open) {
      try {
        self.tryExecute(o.getId());
      } catch (Exception ignored) {}
    }
  }

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

  private static boolean shouldFillLimit(BrokerOrder o, String side, BigDecimal last) {
    BigDecimal limit = o.getLimitPrice();
    if (limit == null) return false;
    if ("BUY".equals(side)) return last.compareTo(limit) <= 0;
    if ("SELL".equals(side)) return last.compareTo(limit) >= 0;
    return false;
  }

  private static boolean shouldFillStop(BrokerOrder o, String side, BigDecimal last) {
    BigDecimal stop = o.getStopPrice();
    if (stop == null) return false;
    if ("BUY".equals(side)) return last.compareTo(stop) >= 0;
    if ("SELL".equals(side)) return last.compareTo(stop) <= 0;
    return false;
  }

  private void executeFilled(BrokerOrder order, BigDecimal price) {
    TradingAccount ta = order.getTradingAccount();
    ta = accountRepo.findByIdForUpdate(ta.getId()).orElseThrow();

    BigDecimal qty = order.getQuantity();
    BigDecimal notional = price.multiply(qty);

    Position pos = positionRepo.findByTradingAccountIdAndSymbolCodeForUpdate(ta.getId(), order.getSymbolCode()).orElse(null);
    BigDecimal orderEntryPrice = price;
    BigDecimal orderRealizedPnl = null;

    if ("BUY".equalsIgnoreCase(order.getSide())) {
      // Funds were already reserved (deducted) when the order was placed.
      // Refund the reserved amount and deduct the actual fill price to handle price differences.
      BigDecimal reservedPrice = order.getLimitPrice() != null ? order.getLimitPrice()
          : (order.getStopPrice() != null ? order.getStopPrice() : price);
      BigDecimal reserved = reservedPrice.multiply(qty);
      BigDecimal actual = notional;
      // Adjust balance: refund reserved, deduct actual fill cost
      ta.setBalance(ta.getBalance().add(reserved).subtract(actual));

      if (pos == null) {
        pos = new Position();
        pos.setTradingAccount(ta);
        pos.setSymbolCode(order.getSymbolCode());
        pos.setQuantity(BigDecimal.ZERO);
        pos.setOpenedAt(Instant.now());
      }
      BigDecimal prevQty = pos.getQuantity() == null ? BigDecimal.ZERO : pos.getQuantity();
      BigDecimal prevAvg = pos.getAvgPrice() == null ? BigDecimal.ZERO : pos.getAvgPrice();
      BigDecimal newQty = prevQty.add(qty);
      BigDecimal newAvg = prevQty.compareTo(BigDecimal.ZERO) == 0 ? price :
          prevAvg.multiply(prevQty).add(price.multiply(qty)).divide(newQty, 8, RoundingMode.HALF_UP);
      pos.setQuantity(newQty);
      pos.setAvgPrice(newAvg);
      pos.setUnrealizedPnl(price.subtract(newAvg).multiply(newQty));
      positionRepo.save(pos);
    } else { // SELL
      BigDecimal prevQty = pos == null || pos.getQuantity() == null ? BigDecimal.ZERO : pos.getQuantity();
      if (prevQty.compareTo(qty) < 0) {
        order.setStatus("REJECTED");
        orderRepo.save(order);
        return;
      }
      BigDecimal avg = pos.getAvgPrice() == null ? BigDecimal.ZERO : pos.getAvgPrice();
      BigDecimal realizedDelta = price.subtract(avg).multiply(qty);
      BigDecimal realized = pos.getRealizedPnl() == null ? BigDecimal.ZERO : pos.getRealizedPnl();
      pos.setRealizedPnl(realized.add(realizedDelta));
      BigDecimal newQty = prevQty.subtract(qty);
      pos.setQuantity(newQty);
      if (newQty.compareTo(BigDecimal.ZERO) == 0) pos.setAvgPrice(null);
      positionRepo.save(pos);
      orderEntryPrice = avg;
      orderRealizedPnl = realizedDelta;
      // Credit proceeds to balance
      ta.setBalance(ta.getBalance().add(notional));
    }

    ta.setEquity(ta.getBalance());
    ta.setFreeMargin(ta.getBalance().subtract(ta.getMarginUsed() == null ? BigDecimal.ZERO : ta.getMarginUsed()));
    accountRepo.save(ta);

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
}
