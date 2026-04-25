package com.brokerui.market;

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
  private final FinnhubMarketService finnhub;
  private final BinancePriceService binancePrices;

  public MarketController(FinnhubMarketService finnhub, BinancePriceService binancePrices) {
    this.finnhub = finnhub;
    this.binancePrices = binancePrices;
  }

  /** Live price endpoint used by the Positions page to show real-time PnL. */
  @GetMapping("/api/market/price/{symbol}")
  public ResponseEntity<?> livePrice(@PathVariable String symbol) {
    String sym = symbol == null ? "" : symbol.trim().toUpperCase();
    try {
      // Prefer Finnhub for FX + METALS (real broker-like quotes), if configured.
      if (finnhub.isConfigured() && (isForexSymbol(sym) || isMetalsSymbol(sym))) {
        double p = finnhub.oandaQuote(sym);
        if (Double.isFinite(p) && p > 0) {
          return ResponseEntity.ok(
              Map.of("symbol", sym, "price", BigDecimal.valueOf(p), "source", "finnhub"));
        }
      }

      // Crypto (and any others) via Binance.
      var price = binancePrices.getLastPrice(sym);
      return ResponseEntity.ok(Map.of("symbol", sym, "price", price, "source", "binance"));
    } catch (Exception e) {
      // Fallback: for symbols without a Binance mapping (e.g. EURNOK/GBPJPY/CADJPY),
      // return a deterministic demo price so Positions/Charts always show a value.
      BigDecimal demo = syntheticDemoPrice(sym);
      return ResponseEntity.ok(Map.of("symbol", sym, "price", demo, "source", "synthetic"));
    }
  }

  private static boolean isMetalsSymbol(String s) {
    return s != null && (s.startsWith("XAU") || s.startsWith("XAG") || s.startsWith("XPT"));
  }

  private static boolean isForexSymbol(String s) {
    if (s == null || s.length() != 6) return false;
    // We treat anything ending with USD/JPY/CAD/NOK as FX-like here (UI catalog).
    return s.endsWith("USD") || s.endsWith("JPY") || s.endsWith("CAD") || s.endsWith("NOK");
  }

  private static BigDecimal syntheticDemoPrice(String symbol) {
    String s = symbol == null ? "" : symbol.trim().toUpperCase();
    if (s.isEmpty()) return BigDecimal.ZERO;

    long nowSec = System.currentTimeMillis() / 1000L;
    long bucket = nowSec / 3L; // change roughly every 3s (matches UI polling)

    long h = 1125899906842597L; // prime seed
    for (int i = 0; i < s.length(); i++) {
      h = 31L * h + s.charAt(i);
    }
    long mix = h ^ (bucket * 0x9e3779b97f4a7c15L);
    double u = ((mix >>> 11) & ((1L << 53) - 1)) / (double) (1L << 53); // [0,1)

    BigDecimal base;
    int scale;
    if (s.endsWith("JPY")) {
      base = new BigDecimal("150.000");
      scale = 3;
    } else if (s.startsWith("XAU")) {
      base = new BigDecimal("2350.00");
      scale = 2;
    } else if (s.startsWith("XAG")) {
      base = new BigDecimal("30.00");
      scale = 2;
    } else if (s.startsWith("BTC")) {
      base = new BigDecimal("65000.00");
      scale = 2;
    } else if (s.startsWith("ETH")) {
      base = new BigDecimal("3200.00");
      scale = 2;
    } else if (s.startsWith("SOL")) {
      base = new BigDecimal("150.00");
      scale = 2;
    } else if (s.startsWith("XRP")) {
      base = new BigDecimal("0.60");
      scale = 4;
    } else {
      base = new BigDecimal("1.10000");
      scale = 5;
    }

    // +-1% drift around base
    BigDecimal factor = BigDecimal.valueOf(0.99 + (u * 0.02));
    return base.multiply(factor).setScale(scale, RoundingMode.HALF_UP);
  }

  @GetMapping("/api/market/stock/candles")
  public ResponseEntity<?> stockCandles(
      @RequestParam String symbol, @RequestParam(defaultValue = "1h") String interval) {
    if (!finnhub.isConfigured()) {
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
          .body(
              Map.of(
                  "ok",
                  false,
                  "error",
                  "finnhub_not_configured",
                  "message",
                  "Set FINNHUB_API_KEY (https://finnhub.io/register)"));
    }
    try {
      List<CandleBar> data = finnhub.usStockCandles(symbol, interval);
      return ResponseEntity.ok(data);
    } catch (Exception e) {
      return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
          .body(Map.of("ok", false, "error", "finnhub_failed", "message", e.getMessage()));
    }
  }

  @GetMapping("/api/market/forex/candles")
  public ResponseEntity<?> forexCandles(
      @RequestParam String symbol, @RequestParam(defaultValue = "1h") String interval) {
    if (!finnhub.isConfigured()) {
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
          .body(
              Map.of(
                  "ok",
                  false,
                  "error",
                  "finnhub_not_configured",
                  "message",
                  "Set FINNHUB_API_KEY (https://finnhub.io/register)"));
    }
    try {
      List<CandleBar> data = finnhub.forexCandles(symbol, interval);
      return ResponseEntity.ok(data);
    } catch (IllegalArgumentException e) {
      return ResponseEntity.status(HttpStatus.BAD_REQUEST)
          .body(Map.of("ok", false, "error", e.getMessage()));
    } catch (Exception e) {
      if (String.valueOf(e.getMessage()).contains("403")) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
            .body(Map.of("ok", false, "error", "finnhub_forbidden", "message", e.getMessage()));
      }
      return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
          .body(Map.of("ok", false, "error", "finnhub_failed", "message", e.getMessage()));
    }
  }

  @GetMapping("/api/market/metals/candles")
  public ResponseEntity<?> metalsCandles(
      @RequestParam String symbol, @RequestParam(defaultValue = "1h") String interval) {
    if (!finnhub.isConfigured()) {
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
          .body(
              Map.of(
                  "ok",
                  false,
                  "error",
                  "finnhub_not_configured",
                  "message",
                  "Set FINNHUB_API_KEY (https://finnhub.io/register)"));
    }
    try {
      List<CandleBar> data = finnhub.metalsCandles(symbol, interval);
      return ResponseEntity.ok(data);
    } catch (IllegalArgumentException e) {
      return ResponseEntity.status(HttpStatus.BAD_REQUEST)
          .body(Map.of("ok", false, "error", e.getMessage()));
    } catch (Exception e) {
      if (String.valueOf(e.getMessage()).contains("403")) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
            .body(Map.of("ok", false, "error", "finnhub_forbidden", "message", e.getMessage()));
      }
      return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
          .body(Map.of("ok", false, "error", "finnhub_failed", "message", e.getMessage()));
    }
  }
}
