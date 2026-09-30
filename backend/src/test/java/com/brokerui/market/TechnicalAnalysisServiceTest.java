package com.brokerui.market;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class TechnicalAnalysisServiceTest {

  private final TechnicalAnalysisService svc = new TechnicalAnalysisService();

  @Test
  void smaOfOnesIsOne() {
    double[] data = {1, 1, 1, 1, 1};
    double[] sma = TechnicalAnalysisService.calculateSma(data, 3);
    assertEquals(3, sma.length);
    assertEquals(1.0, sma[0], 1e-9);
  }

  @Test
  void analyzeReturnsStructuredPayload() {
    List<CandleBar> bars = TechnicalAnalysisService.syntheticCandles("BTCUSD");
    Map<String, Object> r = svc.analyze(bars, "BTCUSD");
    assertEquals("BTCUSD", r.get("symbol"));
    assertTrue(r.containsKey("recommendation"));
    assertTrue(r.containsKey("indicators"));
    assertTrue(((Number) r.get("confidence")).intValue() >= 30);
  }

  @Test
  void tooFewBarsIsHold() {
    List<CandleBar> bars = List.of(new CandleBar(1, 1, 1, 1, 1));
    Map<String, Object> r = svc.analyze(bars, "EURUSD");
    assertEquals("HOLD", r.get("recommendation"));
  }
}
