package com.brokerui.broker.netting;

import static com.brokerui.broker.netting.NettingTypes.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Pure matching engine: decides which resting orders an incoming order crosses with, how much,
 * and why others were skipped. No Spring, no database, no clock — the same inputs always give
 * the same plan. {@code scripts/lib/netting_engine.js} is a line-by-line port kept in parity by
 * the shared {@code netting_scenarios.json}.
 *
 * Rules:
 * 1. Market must be sane (bid &lt; mid &lt; ask), else nothing crosses.
 * 2. The incoming order must accept the mid (MARKET orders always do).
 * 3. Resting orders are visited best price first (lowest ask-side limit for a buyer, highest
 *    bid-side limit for a seller), then oldest, then lowest id.
 * 4. Never cross an account with itself; never cross two simulated accounts.
 * 5. Each resting order must itself accept the mid (NBBO).
 * 6. Fills happen at the mid; partial fills allowed; whatever is left is the remainder.
 */
public final class NettingEngine {
  private NettingEngine() {}

  public static MatchPlan plan(IncomingOrder in, List<RestingOrder> resting, Quote q) {
    List<Fill> fills = new ArrayList<>();
    List<Decision> decisions = new ArrayList<>();
    BigDecimal left = in.qty() == null ? BigDecimal.ZERO : in.qty();

    if (q == null || !q.valid()) {
      decisions.add(new Decision(CROSSED_MARKET, null, "bid must be < mid < ask"));
      return new MatchPlan(fills, left, decisions, CROSSED_MARKET);
    }
    boolean isBuy = in.isBuy();
    BigDecimal inLimit = NbboValidator.effectiveLimit(q, isBuy, in.limit());
    if (isBuy && inLimit.compareTo(q.mid()) < 0) {
      decisions.add(new Decision(BUY_LIMIT_BELOW_MID, null, "incoming buy limit " + inLimit.toPlainString() + " < mid " + q.mid().toPlainString()));
      return new MatchPlan(fills, left, decisions, BUY_LIMIT_BELOW_MID);
    }
    if (!isBuy && inLimit.compareTo(q.mid()) > 0) {
      decisions.add(new Decision(SELL_LIMIT_ABOVE_MID, null, "incoming sell limit " + inLimit.toPlainString() + " > mid " + q.mid().toPlainString()));
      return new MatchPlan(fills, left, decisions, SELL_LIMIT_ABOVE_MID);
    }

    String opposite = isBuy ? SELL : BUY;
    List<RestingOrder> book = new ArrayList<>();
    for (RestingOrder r : resting) {
      if (r != null && opposite.equals(r.side()) && r.orderId() != in.orderId()
          && r.qty() != null && r.qty().signum() > 0 && r.limit() != null) {
        book.add(r);
      }
    }
    Comparator<RestingOrder> byPrice = Comparator.comparing(RestingOrder::limit);
    if (!isBuy) byPrice = byPrice.reversed();
    book.sort(byPrice.thenComparingLong(RestingOrder::createdAtMs).thenComparingLong(RestingOrder::orderId));

    for (RestingOrder r : book) {
      if (left.signum() <= 0) break;
      if (r.accountId() == in.accountId()) {
        decisions.add(new Decision(SELF_MATCH_SKIP, r.orderId(), "same account " + r.accountId()));
        continue;
      }
      if (r.simulated() && in.simulated()) {
        decisions.add(new Decision(SIM_SIM_SKIP, r.orderId(), "computer never trades with computer"));
        continue;
      }
      String reason = isBuy ? NbboValidator.check(q, inLimit, r.limit())
                            : NbboValidator.check(q, r.limit(), inLimit);
      if (reason != null) {
        decisions.add(new Decision(reason, r.orderId(), "resting limit " + r.limit().toPlainString() + " vs mid " + q.mid().toPlainString()));
        continue;
      }
      BigDecimal qty = left.min(r.qty());
      decisions.add(new Decision(NBBO_OK, r.orderId(), "resting limit " + r.limit().toPlainString() + " vs mid " + q.mid().toPlainString()));
      fills.add(new Fill(r.orderId(), r.accountId(), r.simulated(), qty, q.mid()));
      decisions.add(new Decision(FILL, r.orderId(), qty.stripTrailingZeros().toPlainString() + " @ " + q.mid().toPlainString()));
      left = left.subtract(qty);
    }
    if (left.signum() > 0) {
      decisions.add(new Decision(REMAINDER, null, left.stripTrailingZeros().toPlainString()));
    }
    return new MatchPlan(fills, left, decisions, null);
  }

  /**
   * Total resting quantity that could cross with {@code in} right now (not capped by the
   * incoming size). Used as the NN "opposite quantity" input — real liquidity, never invented.
   */
  public static BigDecimal crossableQty(IncomingOrder in, List<RestingOrder> resting, Quote q) {
    BigDecimal total = BigDecimal.ZERO;
    if (q == null || !q.valid()) return total;
    boolean isBuy = in.isBuy();
    BigDecimal inLimit = NbboValidator.effectiveLimit(q, isBuy, in.limit());
    String opposite = isBuy ? SELL : BUY;
    for (RestingOrder r : resting) {
      if (r == null || !opposite.equals(r.side()) || r.orderId() == in.orderId()) continue;
      if (r.qty() == null || r.qty().signum() <= 0 || r.limit() == null) continue;
      if (r.accountId() == in.accountId() || (r.simulated() && in.simulated())) continue;
      String reason = isBuy ? NbboValidator.check(q, inLimit, r.limit()) : NbboValidator.check(q, r.limit(), inLimit);
      if (reason == null) total = total.add(r.qty());
    }
    return total;
  }
}
