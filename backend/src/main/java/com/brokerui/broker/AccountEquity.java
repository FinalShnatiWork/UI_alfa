package com.brokerui.broker;

import com.brokerui.market.MarketPriceService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.function.Function;

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
        return BrokerApiController.liveUnrealizedPnl(p, BigDecimal.valueOf(live), prices);
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
      BigDecimal marginLocked = lockedMargin(p, leverage, prices);
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
    return settledValue(ta, positions, openOrders, null);
  }

  public static BigDecimal settledValue(TradingAccount ta, List<Position> positions, List<BrokerOrder> openOrders, MarketPriceService prices) {
    BigDecimal leverage = BigDecimal.valueOf(ta.getLeverage() > 0 ? ta.getLeverage() : 100);
    BigDecimal total = ta.getBalance();
    for (Position p : positions) {
      BigDecimal avg = p.getAvgPrice() == null ? BigDecimal.ZERO : p.getAvgPrice();
      BigDecimal qty = p.getQuantity() == null ? BigDecimal.ZERO : p.getQuantity();
      total = total.add(lockedMargin(p, leverage, prices))
          .add(TradingFees.calculateCommission(p.getSymbolCode(), qty, avg));
    }
    for (BrokerOrder o : openOrders) {
      if (o.getClosesPositionId() != null) continue;
      total = total.add(com.brokerui.broker.netting.FillBooking.outstandingReserve(o, ta));
    }
    BigDecimal debt = ta.getBorrowedBalance() == null ? BigDecimal.ZERO : ta.getBorrowedBalance();
    return total.subtract(debt);
  }

  /** Dollars of margin locked at the entry price. Zero when the cross rate is not live. */
  private static BigDecimal lockedMargin(Position p, BigDecimal leverage, MarketPriceService prices) {
    BigDecimal avg = p.getAvgPrice() == null ? BigDecimal.ZERO : p.getAvgPrice();
    BigDecimal qty = p.getQuantity() == null ? BigDecimal.ZERO : p.getQuantity();
    BigDecimal quote = avg.multiply(qty).multiply(BrokerApiController.getContractSize(p.getSymbolCode()));
    Function<String, BigDecimal> rate = code -> code.equalsIgnoreCase(p.getSymbolCode())
        ? avg
        : (prices == null ? null : prices.marketPrice(code));
    BigDecimal usd = UsdQuote.toUsd(p.getSymbolCode(), quote, rate);
    if (usd == null) return BigDecimal.ZERO;
    return usd.divide(leverage, 4, RoundingMode.HALF_UP);
  }
}
