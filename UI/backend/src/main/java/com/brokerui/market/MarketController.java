package com.brokerui.market;

import com.brokerui.broker.MT5IntegrationService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MarketController {
  private final MT5IntegrationService mt5;

  public MarketController(MT5IntegrationService mt5) {
    this.mt5 = mt5;
  }

  @GetMapping("/api/market/price/{symbol}")
  public ResponseEntity<?> livePrice(@PathVariable String symbol) {
    String sym = symbol == null ? "" : symbol.trim().toUpperCase();
    try {
      double p = mt5.getPrice(sym);
      if (Double.isFinite(p) && p > 0) {
        return ResponseEntity.ok(
            Map.of("symbol", sym, "price", BigDecimal.valueOf(p), "source", "mt5"));
      }
    } catch (Exception e) {
      // Fallback to demo if MT5 is not reachable or symbol is missing
      BigDecimal demo = syntheticDemoPrice(sym);
      return ResponseEntity.ok(Map.of("symbol", sym, "price", demo, "source", "synthetic"));
    }
    return ResponseEntity.ok(Map.of("symbol", sym, "price", syntheticDemoPrice(sym), "source", "synthetic"));
  }

  private static BigDecimal syntheticDemoPrice(String symbol) {
    String s = symbol == null ? "" : symbol.trim().toUpperCase();
    if (s.isEmpty()) return BigDecimal.ZERO;
    long nowSec = System.currentTimeMillis() / 1000L;
    long bucket = nowSec / 3L;
    long h = 1125899906842597L;
    for (int i = 0; i < s.length(); i++) h = 31L * h + s.charAt(i);
    long mix = h ^ (bucket * 0x9e3779b97f4a7c15L);
    double u = ((mix >>> 11) & ((1L << 53) - 1)) / (double) (1L << 53);

    BigDecimal base;
    int scale;
    if (s.endsWith("JPY")) { base = new BigDecimal("150.000"); scale = 3; }
    else if (s.startsWith("XAU")) { base = new BigDecimal("2350.00"); scale = 2; }
    else if (s.startsWith("XAG")) { base = new BigDecimal("30.00"); scale = 2; }
    else if (s.startsWith("BTC")) { base = new BigDecimal("65000.00"); scale = 2; }
    else { base = new BigDecimal("1.10000"); scale = 5; }

    BigDecimal factor = BigDecimal.valueOf(0.99 + (u * 0.02));
    return base.multiply(factor).setScale(scale, RoundingMode.HALF_UP);
  }

  @GetMapping("/api/market/stock/candles")
  public ResponseEntity<?> stockCandles(@RequestParam String symbol, @RequestParam(defaultValue = "1h") String interval) {
    return forexCandles(symbol, interval);
  }

  @GetMapping("/api/market/forex/candles")
  public ResponseEntity<?> forexCandles(@RequestParam String symbol, @RequestParam(defaultValue = "1h") String interval) {
    try {
      List<CandleBar> data = mt5.getCandlesForUi(symbol, 100, interval);
      return ResponseEntity.ok(data);
    } catch (Exception e) {
      return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
          .body(Map.of("ok", false, "error", "mt5_failed", "message", e.getMessage()));
    }
  }

  @GetMapping("/api/market/metals/candles")
  public ResponseEntity<?> metalsCandles(@RequestParam String symbol, @RequestParam(defaultValue = "1h") String interval) {
    return forexCandles(symbol, interval);
  }
}
