package com.brokerui.broker.netting;

import java.math.BigDecimal;
import java.util.List;

/** Plain data carried in and out of {@link NettingEngine}. No Spring, no JPA. */
public final class NettingTypes {
  private NettingTypes() {}

  public static final String BUY = "BUY";
  public static final String SELL = "SELL";

  /** Decision / reason codes. The JS port (scripts/lib/netting_engine.js) uses the same strings. */
  public static final String CROSSED_MARKET = "CROSSED_MARKET";
  public static final String BUY_LIMIT_BELOW_MID = "BUY_LIMIT_BELOW_MID";
  public static final String SELL_LIMIT_ABOVE_MID = "SELL_LIMIT_ABOVE_MID";
  public static final String SELF_MATCH_SKIP = "SELF_MATCH_SKIP";
  public static final String SIM_SIM_SKIP = "SIM_SIM_SKIP";
  public static final String NBBO_OK = "NBBO_OK";
  public static final String FILL = "FILL";
  public static final String REMAINDER = "REMAINDER";

  /** The order being executed now. {@code limit == null} means MARKET. */
  public record IncomingOrder(long orderId, long accountId, boolean simulated, String side,
      BigDecimal qty, BigDecimal limit) {
    public boolean isBuy() { return BUY.equals(side); }
  }

  /** An order waiting in the internal book. Always has a limit price. */
  public record RestingOrder(long orderId, long accountId, boolean simulated, String side,
      BigDecimal qty, BigDecimal limit, long createdAtMs) {}

  /** One internal cross: {@code qty} of the incoming order against one resting order, at {@code price} (the mid). */
  public record Fill(long restingOrderId, long restingAccountId, boolean restingSimulated,
      BigDecimal qty, BigDecimal price) {}

  /** Why the engine did (or did not) use a resting order. {@code restingOrderId} may be null. */
  public record Decision(String code, Long restingOrderId, String detail) {}

  public record MatchPlan(List<Fill> fills, BigDecimal remainderQty, List<Decision> decisions,
      String rejectReason) {
    public BigDecimal matchedQty() {
      BigDecimal s = BigDecimal.ZERO;
      for (Fill f : fills) s = s.add(f.qty());
      return s;
    }
  }
}
