package com.brokerui.broker.netting;

/**
 * The ONLY place that builds the NN advisor's 8 inputs. Must stay numerically identical to
 * {@code extractFeatures()} in buysellmodel/nn_core.js — checked by FeatureBuilderParityTest and
 * buysellmodel/tests/model_check.js against the golden vectors in netting_scenarios.json.
 *
 * Side-aware: "buy" slots describe the incoming order's own side, "sell" slots the opposite side
 * that could actually cross with it (the model was trained from the buyer's point of view).
 */
public final class FeatureBuilder {
  private FeatureBuilder() {}

  /**
   * @param ownQty            incoming order quantity
   * @param oppositeQty       quantity on the opposite side that could cross now (0 when none)
   * @param bid               market bid
   * @param ask               market ask
   * @param ownDepth          resting orders on the incoming order's side
   * @param oppositeDepth     resting orders on the opposite side
   * @param historicalMatchRate share of recently filled quantity that netted internally (0..1)
   */
  public static double[] extract(double ownQty, double oppositeQty, double bid, double ask,
      double ownDepth, double oppositeDepth, double historicalMatchRate) {
    double mid = (bid + ask) / 2;
    double spread = ask - bid;
    double sumQty = ownQty + oppositeQty;
    double imbalance = sumQty > 0 ? (ownQty - oppositeQty) / sumQty : 0;
    return new double[] {
        Math.min(ownQty / 100, 1),
        Math.min(oppositeQty / 100, 1),
        Math.min(spread / 1, 1),
        (imbalance + 1) / 2,
        Math.min(mid / 200, 1),
        Math.min(ownDepth / 10, 1),
        Math.min(oppositeDepth / 10, 1),
        Math.min(Math.max(historicalMatchRate, 0), 1),
    };
  }
}
