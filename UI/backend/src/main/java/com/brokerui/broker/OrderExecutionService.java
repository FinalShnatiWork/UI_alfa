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

  @Autowired @Lazy
  private OrderExecutionService self;

  public OrderExecutionService(
      TradingAccountRepository accountRepo,
      PositionRepository positionRepo,
      BrokerOrderRepository orderRepo,
      TradeFillRepository fillRepo,
      NotificationRepository notificationRepo,
      SymbolRepository symbolRepo,
      MT5IntegrationService mt5Service) {
    this.accountRepo = accountRepo;
    this.positionRepo = positionRepo;
    this.orderRepo = orderRepo;
    this.fillRepo = fillRepo;
    this.notificationRepo = notificationRepo;
    this.symbolRepo = symbolRepo;
    this.mt5Service = mt5Service;
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
      last = BigDecimal.valueOf(mt5Service.getPrice(symbolCode));
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
    ta = accountRepo.findById(ta.getId()).orElseThrow();

    BigDecimal qty = order.getQuantity();
    BigDecimal balance = ta.getBalance() == null ? BigDecimal.ZERO : ta.getBalance();

    // Local DB update logic
    Position pos = positionRepo.findByTradingAccountIdAndSymbolCode(ta.getId(), order.getSymbolCode()).orElse(null);
    BigDecimal orderEntryPrice = price;
    BigDecimal orderRealizedPnl = null;

    if ("BUY".equalsIgnoreCase(order.getSide())) {
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
    }

    order.setStatus("FILLED");
    order.setFilledAt(Instant.now());
    order.setEntryPrice(orderEntryPrice);
    order.setRealizedPnl(orderRealizedPnl);
    orderRepo.save(order);

    TradeFill fill = new TradeFill();
    fill.setOrder(order);
    fill.setPrice(price);
    fill.setQuantity(qty);
    fill.setLiquidity("TAKER");
    fillRepo.save(fill);

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
  }
}
