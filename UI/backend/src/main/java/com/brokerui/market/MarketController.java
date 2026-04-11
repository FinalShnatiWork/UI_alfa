package com.brokerui.market;

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
    try {
      var price = binancePrices.getLastPrice(symbol.toUpperCase());
      return ResponseEntity.ok(Map.of("symbol", symbol.toUpperCase(), "price", price));
    } catch (Exception e) {
      return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
          .body(Map.of("ok", false, "error", "price_unavailable", "message", e.getMessage()));
    }
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
