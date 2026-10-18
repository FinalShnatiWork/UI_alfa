package com.brokerui.market;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Technical-analysis API used by the React analyzer page.
 * React talks to Spring on 8080; candles are the same series the charts already use.
 */
@RestController
public class MarketAnalysisController {

  private static final List<Asset> SUPPORTED = List.of(
      new Asset("BTCUSD", "crypto"),
      new Asset("ETHUSD", "crypto"),
      new Asset("SOLUSD", "crypto"),
      new Asset("XRPUSD", "crypto"),
      new Asset("EURUSD", "forex"),
      new Asset("GBPUSD", "forex"),
      new Asset("USDJPY", "forex"),
      new Asset("GBPJPY", "forex"),
      new Asset("USDCAD", "forex"),
      new Asset("NZDUSD", "forex"),
      new Asset("XAUUSD", "metals"),
      new Asset("XAGUSD", "metals"));

  private final MarketController market;
  private final TechnicalAnalysisService analysis;

  public MarketAnalysisController(MarketController market, TechnicalAnalysisService analysis) {
    this.market = market;
    this.analysis = analysis;
  }

  @GetMapping("/api/market/analysis")
  public ResponseEntity<?> one(
      @RequestParam(defaultValue = "BTCUSD") String symbol,
      @RequestParam(defaultValue = "crypto") String category,
      @RequestParam(defaultValue = "1h") String interval) {
    String clean = symbol.trim().toUpperCase();
    return ResponseEntity.ok(analyzeSymbol(clean, interval, true));
  }

  @GetMapping("/api/market/analysis/all")
  public ResponseEntity<?> all(@RequestParam(defaultValue = "1h") String interval) {
    String iv = candleInterval(interval);
    List<Map<String, Object>> results = new ArrayList<>();
    for (Asset asset : SUPPORTED) {
      Map<String, Object> full = analyzeSymbol(asset.id, iv, false);
      results.add(analysis.overviewRow(full, asset.category));
    }
    return ResponseEntity.ok(results);
  }

  private Map<String, Object> analyzeSymbol(String symbol, String interval, boolean withReplay) {
    String iv = candleInterval(interval);
    List<CandleBar> candles = market.listCandles(symbol, iv);
    List<CandleBar> bars = candles == null ? List.of() : candles;
    Map<String, Object> full = analysis.analyze(bars, symbol, iv);
    if (withReplay) full.put("replay", analysis.replay(bars, symbol));
    return full;
  }

  /** The page offers the two windows Yahoo and Bybit both fill reliably. */
  private static String candleInterval(String interval) {
    return "1d".equals(interval) ? "1d" : "1h";
  }

  private record Asset(String id, String category) {}
}
