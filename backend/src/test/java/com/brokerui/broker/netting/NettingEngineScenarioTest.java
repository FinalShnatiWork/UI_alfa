package com.brokerui.broker.netting;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.jupiter.api.Test;

/**
 * Runs every scenario in buysellmodel/tests/netting_scenarios.json through the pure Java engine.
 * The JS port is checked against the same file by buysellmodel/tests/model_check.js, so both
 * engines are proven to make the same decisions.
 */
class NettingEngineScenarioTest {

  @Test
  void everySharedScenarioProducesTheExpectedPlan() throws Exception {
    JSONArray all = ScenarioFile.scenarios();
    List<String> failures = new ArrayList<>();
    for (int i = 0; i < all.length(); i++) {
      JSONObject s = all.getJSONObject(i);
      String id = s.getString("id");
      NettingTypes.MatchPlan p = NettingEngine.plan(ScenarioFile.incoming(s), ScenarioFile.resting(s), ScenarioFile.quote(s));
      JSONObject x = s.getJSONObject("expected");
      JSONArray xf = x.getJSONArray("fills");
      boolean ok = p.fills().size() == xf.length();
      for (int f = 0; ok && f < xf.length(); f++) {
        JSONObject e = xf.getJSONObject(f);
        NettingTypes.Fill got = p.fills().get(f);
        ok = got.restingOrderId() == e.getLong("restingOrderId")
            && got.qty().compareTo(new BigDecimal(e.getString("qty"))) == 0
            && got.price().compareTo(new BigDecimal(e.getString("price"))) == 0;
      }
      ok = ok && p.remainderQty().compareTo(new BigDecimal(x.getString("remainder"))) == 0;
      String expReject = x.isNull("rejectReason") ? null : x.getString("rejectReason");
      ok = ok && java.util.Objects.equals(expReject, p.rejectReason());
      List<String> codes = new ArrayList<>();
      p.decisions().forEach(d -> codes.add(d.code()));
      List<String> expCodes = new ArrayList<>();
      JSONArray dc = x.getJSONArray("decisionCodes");
      for (int c = 0; c < dc.length(); c++) expCodes.add(dc.getString(c));
      ok = ok && codes.equals(expCodes);
      if (!ok) failures.add(id + " got fills=" + p.fills() + " remainder=" + p.remainderQty() + " reject=" + p.rejectReason() + " codes=" + codes);
    }
    assertTrue(failures.isEmpty(), "Scenario failures:\n" + String.join("\n", failures));
    assertTrue(all.length() >= 15, "expected the full shared scenario set");
  }

  @Test
  void matchedPlusRemainderAlwaysEqualsIncomingQty() throws Exception {
    JSONArray all = ScenarioFile.scenarios();
    for (int i = 0; i < all.length(); i++) {
      JSONObject s = all.getJSONObject(i);
      NettingTypes.IncomingOrder in = ScenarioFile.incoming(s);
      NettingTypes.MatchPlan p = NettingEngine.plan(in, ScenarioFile.resting(s), ScenarioFile.quote(s));
      assertEquals(0, p.matchedQty().add(p.remainderQty()).compareTo(in.qty()), s.getString("id"));
      for (NettingTypes.Fill f : p.fills()) {
        assertTrue(f.qty().signum() > 0, "fill qty must be positive in " + s.getString("id"));
        assertEquals(0, f.price().compareTo(ScenarioFile.quote(s).mid()), "fills happen at mid in " + s.getString("id"));
      }
    }
  }

  @Test
  void crossableQtyCountsOnlyLiquidityThatCouldReallyCross() throws Exception {
    JSONArray all = ScenarioFile.scenarios();
    for (int i = 0; i < all.length(); i++) {
      JSONObject s = all.getJSONObject(i);
      BigDecimal crossable = NettingEngine.crossableQty(ScenarioFile.incoming(s), ScenarioFile.resting(s), ScenarioFile.quote(s));
      double expected = s.getJSONObject("features").getDouble("oppositeQty");
      String reject = s.getJSONObject("expected").isNull("rejectReason") ? null : s.getJSONObject("expected").getString("rejectReason");
      if (reject == null) {
        assertEquals(0, crossable.compareTo(BigDecimal.valueOf(expected)), "crossable qty in " + s.getString("id"));
      }
    }
  }
}
