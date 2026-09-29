package com.brokerui.broker.netting;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.jupiter.api.Test;

/**
 * Java FeatureBuilder must produce exactly the vectors buysellmodel/nn_core.js extractFeatures
 * produced for the same inputs (golden values written by model_check.js --write-golden).
 */
class FeatureBuilderParityTest {

  @Test
  void javaFeaturesEqualTheJsGoldenVectors() throws Exception {
    JSONArray all = ScenarioFile.scenarios();
    int checked = 0;
    for (int i = 0; i < all.length(); i++) {
      JSONObject s = all.getJSONObject(i);
      JSONObject f = s.getJSONObject("features");
      assertTrue(s.has("expectedFeatures"), s.getString("id") + " has no golden vector — run model_check.js --write-golden");
      JSONArray g = s.getJSONArray("expectedFeatures");
      double[] mine = FeatureBuilder.extract(f.getDouble("ownQty"), f.getDouble("oppositeQty"), f.getDouble("bid"),
          f.getDouble("ask"), f.getDouble("ownDepth"), f.getDouble("oppositeDepth"), f.getDouble("historicalMatchRate"));
      assertEquals(8, g.length());
      for (int k = 0; k < 8; k++) {
        assertEquals(g.getDouble(k), mine[k], 1e-9, s.getString("id") + " feature " + k);
      }
      checked++;
    }
    assertTrue(checked >= 15);
  }

  @Test
  void noOppositeLiquidityNeverLooksLikeASeller() {
    double[] x = FeatureBuilder.extract(10, 0, 99.95, 100.05, 2, 0, 0);
    assertEquals(0.0, x[1], 0.0, "opposite quantity must be 0 when there is none (old code sent 0.45)");
    assertEquals(1.0, x[3], 1e-12, "imbalance is shifted to 0..1; all-own-side = 1.0");
    assertEquals(0.0, x[6], 0.0);
  }
}
