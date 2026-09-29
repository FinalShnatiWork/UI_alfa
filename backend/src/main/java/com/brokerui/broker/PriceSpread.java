package com.brokerui.broker;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * The platform's bid/ask spread around the live mid price. Pure (no Spring / JPA) so the netting
 * core can use it; {@link TradingFees#applySpread} delegates here, so behaviour is unchanged.
 */
public final class PriceSpread {
  private PriceSpread() {}

  /** 0.015% markup per side (1.5 basis points). */
  public static final BigDecimal SPREAD_RATE = new BigDecimal("0.00015");

  public static BigDecimal apply(BigDecimal rawPrice, boolean isBuy) {
    if (rawPrice == null || rawPrice.compareTo(BigDecimal.ZERO) <= 0) return rawPrice;
    if (isBuy) {
      return rawPrice.multiply(BigDecimal.ONE.add(SPREAD_RATE)).setScale(5, RoundingMode.HALF_UP);
    }
    return rawPrice.multiply(BigDecimal.ONE.subtract(SPREAD_RATE)).setScale(5, RoundingMode.HALF_UP);
  }
}
