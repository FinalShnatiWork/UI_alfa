package com.brokerui.broker;

import com.brokerui.market.MarketPriceService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * The single definition of floating P/L, equity and collateral. Every service that needs one
 * of these numbers calls here, so the overview, bookkeeping and margin checks cannot drift apart.
 */
public final class AccountEquity {
  private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(AccountEquity.class);

  private AccountEquity() {}

  /** Floating P/L at the live mid; the last stored value when no quote is available. */
  public static BigDecimal floatingPnl(Position p, MarketPriceService prices) {
    try {
      double live = prices.getLivePrice(p.getSymbolCode());
      if (live > 0) {
        return BrokerApiController.liveUnrealizedPnl(p, BigDecimal.valueOf(live));
      }
    } catch (Exception e) {
      log.debug("No live quote for {} — using last stored floating P/L: {}", p.getSymbolCode(), e.getMessage());
    }
    return p.getUnrealizedPnl() == null ? BigDecimal.ZERO : p.getUnrealizedPnl();
  }

  /**
   * Cash balance + floating P/L. Margin was already taken out of the balance when each position
   * opened (prepaid-margin model), so it is not added back. This is the equity clients see.
   */
  public static BigDecimal equity(TradingAccount ta, List<Position> positions, MarketPriceService prices) {
    BigDecimal total = ta.getBalance();
    for (Position p : positions) {
      total = total.add(floatingPnl(p, prices));
    }
    return total;
  }

  /**
   * What the account would be worth if every position closed now: balance + the margin each
   * position would release + its floating P/L. The basis for the margin level against debt;
   * plain {@link #equity} would understate collateral by the whole locked margin.
   */
  public static BigDecimal collateral(TradingAccount ta, List<Position> positions, MarketPriceService prices) {
    BigDecimal leverage = BigDecimal.valueOf(ta.getLeverage() > 0 ? ta.getLeverage() : 100);
    BigDecimal total = ta.getBalance();
    for (Position p : positions) {
      BigDecimal contractSize = BrokerApiController.getContractSize(p.getSymbolCode());
      BigDecimal avg = p.getAvgPrice() == null ? BigDecimal.ZERO : p.getAvgPrice();
      BigDecimal qty = p.getQuantity() == null ? BigDecimal.ZERO : p.getQuantity();
      BigDecimal marginLocked = avg.multiply(qty).multiply(contractSize).divide(leverage, 4, RoundingMode.HALF_UP);
      total = total.add(marginLocked).add(floatingPnl(p, prices));
    }
    return total;
  }

  /**
   * Account value without floating P/L: cash + margin locked in positions + cash reserved for
   * waiting orders + open commissions already paid − debt. Open commissions are added back
   * because a trade's realized P/L deducts them again at close; with that, the value changes
   * only by deposits, approved withdrawals, realized P/L, credit interest and debt write-offs,
   * which lets the client rebuild a daily history backwards from this number.
   */
  public static BigDecimal settledValue(TradingAccount ta, List<Position> positions, List<BrokerOrder> openOrders) {
    BigDecimal leverage = BigDecimal.valueOf(ta.getLeverage() > 0 ? ta.getLeverage() : 100);
    BigDecimal total = ta.getBalance();
    for (Position p : positions) {
      BigDecimal contractSize = BrokerApiController.getContractSize(p.getSymbolCode());
      BigDecimal avg = p.getAvgPrice() == null ? BigDecimal.ZERO : p.getAvgPrice();
      BigDecimal qty = p.getQuantity() == null ? BigDecimal.ZERO : p.getQuantity();
      total = total.add(avg.multiply(qty).multiply(contractSize).divide(leverage, 4, RoundingMode.HALF_UP))
          .add(TradingFees.calculateCommission(p.getSymbolCode(), qty, avg));
    }
    for (BrokerOrder o : openOrders) {
      if (o.getClosesPositionId() != null) continue;
      total = total.add(com.brokerui.broker.netting.FillBooking.outstandingReserve(o, ta));
    }
    BigDecimal debt = ta.getBorrowedBalance() == null ? BigDecimal.ZERO : ta.getBorrowedBalance();
    return total.subtract(debt);
  }
}
