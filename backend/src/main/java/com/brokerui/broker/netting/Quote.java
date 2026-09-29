package com.brokerui.broker.netting;

import com.brokerui.broker.PriceSpread;
import java.math.BigDecimal;

/**
 * Bid / mid / ask snapshot used for one netting decision. The mid is the live price the
 * platform already uses everywhere; bid and ask are the same spread the client would get
 * from {@link PriceSpread#apply} (what TradingFees.applySpread uses) when trading against the external market.
 */
public record Quote(BigDecimal bid, BigDecimal mid, BigDecimal ask, long takenAtMs) {

  public static Quote of(BigDecimal mid) {
    return new Quote(PriceSpread.apply(mid, false), mid, PriceSpread.apply(mid, true),
        System.currentTimeMillis());
  }

  /** Test-only broken market: bid above ask. Netting must refuse to cross on it. */
  public static Quote crossed(BigDecimal mid) {
    return new Quote(PriceSpread.apply(mid, true), mid, PriceSpread.apply(mid, false),
        System.currentTimeMillis());
  }

  /** bid &lt; mid &lt; ask. */
  public boolean valid() {
    return bid != null && mid != null && ask != null
        && bid.compareTo(mid) < 0 && mid.compareTo(ask) < 0;
  }
}
