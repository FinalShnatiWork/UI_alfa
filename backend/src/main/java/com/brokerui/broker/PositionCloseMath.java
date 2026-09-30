package com.brokerui.broker;

import java.math.BigDecimal;
import java.math.RoundingMode;

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
    if (pos == null || ta == null || rawMidPrice == null) {
      throw new IllegalArgumentException("position, account and mid-price are required");
    }
    boolean isShort = "SHORT".equals(pos.getSide());
    BigDecimal closePrice = TradingFees.applySpread(rawMidPrice, isShort);
    BigDecimal qty = pos.getQuantity() == null ? BigDecimal.ZERO : pos.getQuantity();
    BigDecimal avg = pos.getAvgPrice() == null ? BigDecimal.ZERO : pos.getAvgPrice();
    BigDecimal contractSize = BrokerApiController.getContractSize(pos.getSymbolCode());
    BigDecimal leverage = BigDecimal.valueOf(ta.getLeverage() > 0 ? ta.getLeverage() : 100);
    BigDecimal marginReturned = avg.multiply(qty).multiply(contractSize).divide(leverage, 4, RoundingMode.HALF_UP);
    BigDecimal grossPnl = isShort
        ? avg.subtract(closePrice).multiply(qty).multiply(contractSize)
        : closePrice.subtract(avg).multiply(qty).multiply(contractSize);
    BigDecimal openCommission = TradingFees.calculateCommission(pos.getSymbolCode(), qty, avg);
    BigDecimal closeCommission = TradingFees.calculateCommission(pos.getSymbolCode(), qty, closePrice);
    BigDecimal venueFloor = TradingFees.exchangeFee(pos.getSymbolCode(), qty, closePrice);
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
