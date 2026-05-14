package com.brokerui.market;

import com.brokerui.broker.MT5IntegrationService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MarketController {

    private final MT5IntegrationService mt5;
    private final YahooFinanceService yahoo;

    public MarketController(MT5IntegrationService mt5, YahooFinanceService yahoo) {
        this.mt5 = mt5;
        this.yahoo = yahoo;
    }

    /** Live price: MT5 → Yahoo Finance → synthetic fallback */
    @GetMapping("/api/market/price/{symbol}")
    public ResponseEntity<?> livePrice(@PathVariable String symbol) {
        String sym = symbol == null ? "" : symbol.trim().toUpperCase();

        // 1. Try MT5 if configured
        if (mt5.isConfigured()) {
            try {
                double p = mt5.getPrice(sym);
                if (Double.isFinite(p) && p > 0) {
                    return ResponseEntity.ok(Map.of("symbol", sym, "price", BigDecimal.valueOf(p), "source", "mt5"));
                }
            } catch (Exception ignored) {}
        }

        // 2. Try Yahoo Finance (RapidAPI) if configured
        if (yahoo.isConfigured()) {
            try {
                double p = yahoo.getLivePrice(sym);
                if (p > 0) {
                    return ResponseEntity.ok(Map.of("symbol", sym, "price", round(p, sym), "source", "yahoo"));
                }
            } catch (Exception ignored) {}
        }

        // 3. Synthetic fallback
        return ResponseEntity.ok(Map.of("symbol", sym, "price", syntheticDemoPrice(sym), "source", "synthetic"));
    }

    /** Candles for forex: MT5 → Yahoo Finance → synthetic fallback */
    @GetMapping("/api/market/forex/candles")
    public ResponseEntity<?> forexCandles(
            @RequestParam String symbol,
            @RequestParam(defaultValue = "1h") String interval) {
        return candlesResponse(symbol, interval);
    }

    /** Candles for metals: same pipeline */
    @GetMapping("/api/market/metals/candles")
    public ResponseEntity<?> metalsCandles(
            @RequestParam String symbol,
            @RequestParam(defaultValue = "1h") String interval) {
        return candlesResponse(symbol, interval);
    }

    /** Candles for legacy stock endpoint */
    @GetMapping("/api/market/stock/candles")
    public ResponseEntity<?> stockCandles(
            @RequestParam String symbol,
            @RequestParam(defaultValue = "1h") String interval) {
        return candlesResponse(symbol, interval);
    }

    private ResponseEntity<?> candlesResponse(String symbol, String interval) {
        // 1. Try MT5
        if (mt5.isConfigured()) {
            try {
                List<CandleBar> data = mt5.getCandlesForUi(symbol, 100, interval);
                if (data != null && !data.isEmpty()) return ResponseEntity.ok(data);
            } catch (Exception ignored) {}
        }

        // 2. Try Yahoo Finance
        if (yahoo.isConfigured()) {
            try {
                List<CandleBar> data = yahoo.getCandles(symbol, interval);
                if (data != null && !data.isEmpty()) return ResponseEntity.ok(data);
            } catch (Exception ignored) {}
        }

        // 3. Return empty — frontend will use synthetic candles
        return ResponseEntity.ok(List.of());
    }

    private BigDecimal round(double price, String sym) {
        int scale = sym.endsWith("JPY") ? 3 : sym.startsWith("XA") ? 2 : 5;
        return BigDecimal.valueOf(price).setScale(scale, RoundingMode.HALF_UP);
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
        if (s.endsWith("JPY"))      { base = new BigDecimal("158.000"); scale = 3; }
        else if (s.startsWith("XAU")) { base = new BigDecimal("4660.00"); scale = 2; }
        else if (s.startsWith("XAG")) { base = new BigDecimal("83.00");   scale = 2; }
        else if (s.startsWith("BTC")) { base = new BigDecimal("103000.00"); scale = 2; }
        else if (s.startsWith("ETH")) { base = new BigDecimal("2400.00"); scale = 2; }
        else if (s.startsWith("SOL")) { base = new BigDecimal("170.00");  scale = 2; }
        else if (s.startsWith("XRP")) { base = new BigDecimal("2.40");    scale = 5; }
        else                          { base = new BigDecimal("1.17000"); scale = 5; }

        return base.multiply(BigDecimal.valueOf(0.99 + (u * 0.02)))
                   .setScale(scale, RoundingMode.HALF_UP);
    }
}
