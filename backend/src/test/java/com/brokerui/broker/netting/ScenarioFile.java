package com.brokerui.broker.netting;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** Loads buysellmodel/tests/netting_scenarios.json — the file shared with the JS engine and model_check.js. */
final class ScenarioFile {
  private ScenarioFile() {}

  static JSONArray scenarios() throws Exception {
    Path[] candidates = {
        Paths.get("../buysellmodel/tests/netting_scenarios.json"),
        Paths.get("buysellmodel/tests/netting_scenarios.json"),
    };
    for (Path p : candidates) {
      if (Files.exists(p)) return new JSONObject(Files.readString(p)).getJSONArray("scenarios");
    }
    throw new IllegalStateException("netting_scenarios.json not found (run tests from the backend folder)");
  }

  static BigDecimal dec(JSONObject o, String key) throws Exception {
    return o.isNull(key) ? null : new BigDecimal(o.get(key).toString());
  }

  static Quote quote(JSONObject s) throws Exception {
    JSONObject q = s.getJSONObject("quote");
    return new Quote(dec(q, "bid"), dec(q, "mid"), dec(q, "ask"), 0L);
  }

  static NettingTypes.IncomingOrder incoming(JSONObject s) throws Exception {
    JSONObject o = s.getJSONObject("incoming");
    return new NettingTypes.IncomingOrder(o.getLong("orderId"), o.getLong("accountId"), o.getBoolean("simulated"),
        o.getString("side"), dec(o, "qty"), dec(o, "limit"));
  }

  static List<NettingTypes.RestingOrder> resting(JSONObject s) throws Exception {
    List<NettingTypes.RestingOrder> out = new ArrayList<>();
    JSONArray arr = s.getJSONArray("resting");
    for (int i = 0; i < arr.length(); i++) {
      JSONObject r = arr.getJSONObject(i);
      out.add(new NettingTypes.RestingOrder(r.getLong("orderId"), r.getLong("accountId"), r.getBoolean("simulated"),
          r.getString("side"), dec(r, "qty"), dec(r, "limit"), r.getLong("createdAtMs")));
    }
    return out;
  }
}
