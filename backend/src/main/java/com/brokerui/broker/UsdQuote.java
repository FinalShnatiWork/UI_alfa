package com.brokerui.broker;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.function.Function;

/**
 * Turns a sum priced in the pair's quote currency into account dollars.
 * Euro, gold and crypto are already in dollars. Yen, Canadian dollars and
 * kroner are divided by a live quote the caller already has.
 */
public final class UsdQuote {
  private UsdQuote() {}

  public static BigDecimal toUsd(String symbol, BigDecimal quoteAmount, Function<String, BigDecimal> rate) {
    if (quoteAmount == null) return null;
    String s = symbol == null ? "" : symbol.trim().toUpperCase();
    if (s.endsWith("USD")) return quoteAmount;
    if (s.endsWith("JPY")) return divide(quoteAmount, rate == null ? null : rate.apply("USDJPY"));
    if ("USDCAD".equals(s)) return divide(quoteAmount, rate == null ? null : rate.apply("USDCAD"));
    if ("EURNOK".equals(s)) {
      if (rate == null) return null;
      BigDecimal eurUsd = rate.apply("EURUSD");
      BigDecimal eurNok = rate.apply("EURNOK");
      if (eurUsd == null || eurUsd.signum() <= 0 || eurNok == null || eurNok.signum() <= 0) return null;
      return quoteAmount.multiply(eurUsd).divide(eurNok, 8, RoundingMode.HALF_UP);
    }
    return quoteAmount;
  }

  private static BigDecimal divide(BigDecimal amount, BigDecimal rate) {
    if (rate == null || rate.signum() <= 0) return null;
    return amount.divide(rate, 8, RoundingMode.HALF_UP);
  }
}
