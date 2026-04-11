package com.brokerui.broker;

import com.brokerui.market.BinancePriceService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
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
  private final BinancePriceService prices;
  private final SymbolRepository symbolRepo;
  private final MT5ConnectionManager mt5ConnectionManager;

  public OrderExecutionService(
      TradingAccountRepository accountRepo,
      PositionRepository positionRepo,
      BrokerOrderRepository orderRepo,
      TradeFillRepository fillRepo,
      NotificationRepository notificationRepo,
      SymbolRepository symbolRepo,
      BinancePriceService prices,
      MT5ConnectionManager mt5ConnectionManager) {
    this.accountRepo = accountRepo;
    this.positionRepo = positionRepo;
    this.orderRepo = orderRepo;
    this.fillRepo = fillRepo;
    this.notificationRepo = notificationRepo;
    this.symbolRepo = symbolRepo;
    this.prices = prices;
    this.mt5ConnectionManager = mt5ConnectionManager;
  }


  @Scheduled(fixedDelay = 2000)
  public void tick() {
    // Keep it small and simple for demo; run transactional per order.
    List<BrokerOrder> open = orderRepo.findTop50ByStatusOrderByCreatedAtAsc("NEW");
    for (BrokerOrder o : open) {
      tryExecute(o.getId());
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
      last = prices.getLastPrice(symbolCode);
    } catch (Exception e) {
      return; // keep NEW; try later
    }

    String side = order.getSide() == null ? "" : order.getSide().trim().toUpperCase();
    String type = order.getOrderType() == null ? "" : order.getOrderType().trim().toUpperCase();

    boolean shouldFill =
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
    BigDecimal notional = price.multiply(qty);
    BigDecimal balance = ta.getBalance() == null ? BigDecimal.ZERO : ta.getBalance();

    Position pos =
        positionRepo.findByTradingAccountIdAndSymbolCode(ta.getId(), order.getSymbolCode()).orElse(null);

    if ("BUY".equalsIgnoreCase(order.getSide())) {
      if (balance.compareTo(notional) < 0) {
        order.setStatus("REJECTED");
        orderRepo.save(order);
        return;
      }
      ta.setBalance(balance.subtract(notional));

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
      BigDecimal newAvg =
          prevQty.compareTo(BigDecimal.ZERO) == 0
              ? price
              : prevAvg.multiply(prevQty).add(price.multiply(qty)).divide(newQty, 8, RoundingMode.HALF_UP);
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
      ta.setBalance(balance.add(notional));

      BigDecimal avg = pos.getAvgPrice() == null ? BigDecimal.ZERO : pos.getAvgPrice();
      BigDecimal realizedDelta = price.subtract(avg).multiply(qty);
      BigDecimal realized = pos.getRealizedPnl() == null ? BigDecimal.ZERO : pos.getRealizedPnl();
      pos.setRealizedPnl(realized.add(realizedDelta));
      BigDecimal newQty = prevQty.subtract(qty);
      pos.setQuantity(newQty);
      if (newQty.compareTo(BigDecimal.ZERO) == 0) {
        pos.setAvgPrice(null);
      }
      positionRepo.save(pos);
    }

    ta.setEquity(ta.getBalance());
    ta.setMarginUsed(BigDecimal.ZERO);
    ta.setFreeMargin(ta.getBalance());
    accountRepo.save(ta);

    order.setStatus("FILLED");
    order.setFilledAt(Instant.now());
    orderRepo.save(order);

    TradeFill fill = new TradeFill();
    fill.setOrder(order);
    fill.setPrice(price);
    fill.setQuantity(qty);
    fill.setLiquidity("TAKER");
    fillRepo.save(fill);

    Notification n = new Notification();
    n.setUser(ta.getUser());
    n.setNotifType("TRADE");
    n.setTitle("Trade filled");
    n.setBody(order.getSide() + " " + qty.stripTrailingZeros().toPlainString() + " " + order.getSymbolCode());
    notificationRepo.save(n);

    // Forward the trade to MT5 if the admin has enabled the MT5 Connection
    if (mt5ConnectionManager.isConnected()) {
        try {
            double reqPrice = price.doubleValue();
            double tp = order.getTakeProfit() != null ? order.getTakeProfit().doubleValue() : 0.0;
            double sl = order.getStopLoss() != null ? order.getStopLoss().doubleValue() : 0.0;
            double lotSize = qty.doubleValue(); 

            MT5JavaTradeWriter.sendTradeToMT5(
                order.getSymbolCode(), 
                order.getSide(), 
                reqPrice, 
                tp, 
                sl, 
                lotSize
            );
        } catch (Exception ex) {
            System.err.println("Failed to forward trade to MT5: " + ex.getMessage());
            ex.printStackTrace();
        }
    }
  }
}


