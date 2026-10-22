package com.brokerui.broker;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.function.Function;

/**
 * Single source of truth for closing a position: bid/ask spread, commissions,
 * profit-safety guard, and the cash settlement amount.
 * <p>
 * Manual close, SL/TP auto-close, and forced liquidation must all call this so a
 * client cannot get a better (or worse) price just by which button / scheduler
 * happened to close them.
 */
public final class PositionCloseMath {
  private PositionCloseMath() {}

  public record Snapshot(
      boolean shortPosition,
      String closeSide,
      BigDecimal closePrice,
      BigDecimal quantity,
      BigDecimal avgPrice,
      BigDecimal marginReturned,
      BigDecimal grossPnl,
      BigDecimal openCommission,
      BigDecimal closeCommission,
      BigDecimal totalFees,
      BigDecimal netPnl) {

    /** Cash applied to the account: margin released + gross P/L − close-leg commission. */
    public BigDecimal settlement() {
      return marginReturned.add(grossPnl).subtract(closeCommission);
    }
  }

  /**
   * Values a close at the executable price (Bid when the client sells a LONG, Ask when
   * they buy back a SHORT). {@code rawMidPrice} is the raw mid-market quote.
   */
  public static Snapshot compute(Position pos, TradingAccount ta, BigDecimal rawMidPrice) {
    return compute(pos, ta, rawMidPrice, null);
  }

  public static Snapshot compute(Position pos, TradingAccount ta, BigDecimal rawMidPrice, Function<String, BigDecimal> marketRate) {
    if (pos == null || ta == null || rawMidPrice == null) {
      throw new IllegalArgumentException("position, account and mid-price are required");
    }
    boolean isShort = "SHORT".equals(pos.getSide());
    BigDecimal closePrice = TradingFees.applySpread(rawMidPrice, isShort);
    return atFillPrice(pos, ta, closePrice, true, marketRate);
  }

  /**
   * Same cash result as {@link #compute}, but the fill price is already chosen.
   * An internal cross passes the mid and does not protect a venue fee, because the
   * venue is not paid. An external fill passes the bid or ask and keeps the venue floor.
   */
  public static Snapshot atFillPrice(Position pos, TradingAccount ta, BigDecimal closePrice, boolean protectVenueFee) {
    return atFillPrice(pos, ta, closePrice, protectVenueFee, null);
  }

  public static Snapshot atFillPrice(Position pos, TradingAccount ta, BigDecimal closePrice, boolean protectVenueFee, Function<String, BigDecimal> marketRate) {
    if (pos == null || ta == null || closePrice == null) {
      throw new IllegalArgumentException("position, account and fill price are required");
    }
    boolean isShort = "SHORT".equals(pos.getSide());
    String symbol = pos.getSymbolCode();
    BigDecimal qty = pos.getQuantity() == null ? BigDecimal.ZERO : pos.getQuantity();
    BigDecimal avg = pos.getAvgPrice() == null ? BigDecimal.ZERO : pos.getAvgPrice();
    BigDecimal contractSize = BrokerApiController.getContractSize(symbol);
    BigDecimal leverage = BigDecimal.valueOf(ta.getLeverage() > 0 ? ta.getLeverage() : 100);
    Function<String, BigDecimal> quoted = marketRate == null ? code -> null : marketRate;
    // Margin was reserved at the entry price. Profit is converted at the exit price.
    Function<String, BigDecimal> marginRate = code -> code.equalsIgnoreCase(symbol) ? avg : quoted.apply(code);
    Function<String, BigDecimal> pnlRate = code -> code.equalsIgnoreCase(symbol) ? closePrice : quoted.apply(code);
    BigDecimal quoteNotional = avg.multiply(qty).multiply(contractSize);
    BigDecimal usdNotional = UsdQuote.toUsd(symbol, quoteNotional, marginRate);
    BigDecimal quotePnl = isShort
        ? avg.subtract(closePrice).multiply(qty).multiply(contractSize)
        : closePrice.subtract(avg).multiply(qty).multiply(contractSize);
    BigDecimal grossPnl = UsdQuote.toUsd(symbol, quotePnl, pnlRate);
    if (usdNotional == null || grossPnl == null) {
      throw new IllegalStateException("fx_rate_unavailable");
    }
    BigDecimal marginReturned = usdNotional.divide(leverage, 4, RoundingMode.HALF_UP);
    BigDecimal openCommission = TradingFees.calculateCommission(pos.getSymbolCode(), qty, avg);
    BigDecimal closeCommission = TradingFees.calculateCommission(pos.getSymbolCode(), qty, closePrice);
    BigDecimal venueFloor = protectVenueFee
        ? TradingFees.exchangeFee(pos.getSymbolCode(), qty, closePrice)
        : BigDecimal.ZERO;
    closeCommission = TradingFees.applyProfitSafetyGuard(openCommission, closeCommission, grossPnl, venueFloor);
    BigDecimal totalFees = openCommission.add(closeCommission);
    BigDecimal netPnl = grossPnl.subtract(totalFees);
    return new Snapshot(
        isShort,
        isShort ? "BUY" : "SELL",
        closePrice,
        qty,
        avg,
        marginReturned,
        grossPnl,
        openCommission,
        closeCommission,
        totalFees,
        netPnl);
  }
}
