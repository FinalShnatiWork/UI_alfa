package com.brokerui.broker;

import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Front-end talks to Spring, not to port 3005. If the optional Node trainer is up,
 * {@link NNPredictorClient} forwards the feature vector; otherwise the UI gets a clean 503.
 */
@RestController
public class NnAdvisorController {

  private final NNPredictorClient nn;

  public NnAdvisorController(NNPredictorClient nn) {
    this.nn = nn;
  }

  @PostMapping("/api/nn/predict")
  public ResponseEntity<?> predict(@RequestBody Map<String, Object> body) {
    Object raw = body.get("features");
    if (!(raw instanceof List<?> list) || list.isEmpty()) {
      return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "features required"));
    }
    double[] features = new double[list.size()];
    for (int i = 0; i < list.size(); i++) {
      Object v = list.get(i);
      features[i] = v instanceof Number n ? n.doubleValue() : 0;
    }
    Map<String, Object> pred = nn.getPrediction(features);
    if (pred == null) {
      return ResponseEntity.status(503).body(Map.of("ok", false, "error", "nn_offline"));
    }
    return ResponseEntity.ok(Map.of(
        "prediction", List.of(
            pred.getOrDefault("matchProb", 0),
            pred.getOrDefault("expectedSavings", 0),
            pred.getOrDefault("routeRecommendation", 0))));
  }
}
