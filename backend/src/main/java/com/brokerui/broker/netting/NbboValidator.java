package com.brokerui.broker.netting;

import static com.brokerui.broker.netting.NettingTypes.*;

import java.math.BigDecimal;

/**
 * Java port of {@code validateAndCross()} from buysellmodel/README_EN.md. A cross at the mid is
 * fair only when the market is sane, the buyer accepts paying at least the mid and the seller
 * accepts receiving at most the mid.
 */
public final class NbboValidator {
  private NbboValidator() {}

  /** @return null when the cross is allowed, otherwise the reason code. */
  public static String check(Quote q, BigDecimal buyLimit, BigDecimal sellLimit) {
    if (q == null || !q.valid()) return CROSSED_MARKET;
    if (buyLimit == null || buyLimit.compareTo(q.mid()) < 0) return BUY_LIMIT_BELOW_MID;
    if (sellLimit == null || sellLimit.compareTo(q.mid()) > 0) return SELL_LIMIT_ABOVE_MID;
    return null;
  }

  /** Implicit limit of a MARKET order: a buyer would pay the ask, a seller would take the bid. */
  public static BigDecimal effectiveLimit(Quote q, boolean isBuy, BigDecimal limit) {
    if (limit != null) return limit;
    return isBuy ? q.ask() : q.bid();
  }
}
