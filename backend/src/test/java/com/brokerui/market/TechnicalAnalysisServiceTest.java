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
    assertTrue(r.containsKey("votes"));
    int confidence = ((Number) r.get("confidence")).intValue();
    assertTrue(confidence >= 0 && confidence <= 100);
  }

  @Test
  void risingClosesGetMoreBuyVotes() {
    List<CandleBar> bars = new java.util.ArrayList<>();
    for (int i = 0; i < 120; i++) {
      double close = 100 + i * 0.4;
      bars.add(new CandleBar(i, close - 0.1, close + 0.2, close - 0.2, close));
    }
    Map<String, Object> r = svc.analyze(bars, "TEST");
    @SuppressWarnings("unchecked")
    Map<String, Object> votes = (Map<String, Object>) r.get("votes");
    int buy = ((Number) votes.get("buy")).intValue();
    int sell = ((Number) votes.get("sell")).intValue();
    assertTrue(buy > sell, "buy=" + buy + " sell=" + sell);
    assertTrue(String.valueOf(r.get("recommendation")).contains("BUY"));
  }

  @Test
  void fallingClosesGetMoreSellVotes() {
    List<CandleBar> bars = new java.util.ArrayList<>();
    for (int i = 0; i < 120; i++) {
      double close = 200 - i * 0.4;
      bars.add(new CandleBar(i, close + 0.1, close + 0.2, close - 0.2, close));
    }
    Map<String, Object> r = svc.analyze(bars, "TEST");
    @SuppressWarnings("unchecked")
    Map<String, Object> votes = (Map<String, Object>) r.get("votes");
    int buy = ((Number) votes.get("buy")).intValue();
    int sell = ((Number) votes.get("sell")).intValue();
    assertTrue(sell > buy, "buy=" + buy + " sell=" + sell);
    assertTrue(String.valueOf(r.get("recommendation")).contains("SELL"));
  }

  @Test
  void nearestTurnSitsOnEitherSideOfTheLastPrice() {
    List<CandleBar> bars = new java.util.ArrayList<>();
    for (int i = 0; i < 60; i++) {
      double high = 101;
      double low = 99;
      double close = 100;
      if (i == 20) high = 130;
      if (i == 40) low = 70;
      bars.add(new CandleBar(i, close, high, low, close));
    }
    Map<String, Object> r = svc.analyze(bars, "TEST");
    @SuppressWarnings("unchecked")
    Map<String, Object> levels = (Map<String, Object>) r.get("levels");
    assertTrue(((Number) levels.get("support")).doubleValue() < 100);
    assertTrue(((Number) levels.get("resistance")).doubleValue() > 100);
  }

  @Test
  void replayOnARisingPriceEndsAboveTheStake() {
    List<CandleBar> bars = new java.util.ArrayList<>();
    for (int i = 0; i < 160; i++) {
      double close = 100 + i * 0.4;
      bars.add(new CandleBar(i, close - 0.1, close + 0.2, close - 0.2, close));
    }
    String badge = String.valueOf(svc.analyze(bars, "EURUSD").get("recommendation"));
    assertEquals(badge, svc.verdict(bars));
    Map<String, Object> replay = svc.replay(bars, "EURUSD");
    assertEquals(true, replay.get("available"));
    assertTrue(((Number) replay.get("entries")).intValue() >= 1);
    assertTrue(((Number) replay.get("endValue")).doubleValue() > 10_000);
    assertTrue(((Number) replay.get("fees")).doubleValue() > 0);
  }

  @Test
  void replayNeedsALongEnoughHistory() {
    List<CandleBar> bars = List.of(new CandleBar(1, 1, 1, 1, 1));
    Map<String, Object> replay = svc.replay(bars, "EURUSD");
    assertEquals(false, replay.get("available"));
  }

  @Test
  void tooFewBarsIsHold() {
    List<CandleBar> bars = List.of(new CandleBar(1, 1, 1, 1, 1));
    Map<String, Object> r = svc.analyze(bars, "EURUSD");
    assertEquals("HOLD", r.get("recommendation"));
  }
}
