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

/**
 * REST controller providing market data endpoints for the frontend.
 * Delivers real-time quotes and historical candlestick series for charting.
 */
@RestController
public class MarketController {

    private final MT5IntegrationService mt5;
    private final YahooFinanceService yahoo;
    private final BinanceService binance;
    private final MarketPriceService priceService;

    /**
     * Constructs the MarketController with integrated market services.
     *
     * @param mt5 MetaTrader 5 service integration
     * @param yahoo Yahoo Finance service integration
     * @param binance Binance crypto price service integration
     * @param priceService general market price aggregator
     */
    public MarketController(MT5IntegrationService mt5, YahooFinanceService yahoo, BinanceService binance, MarketPriceService priceService) {
        this.mt5 = mt5;
        this.yahoo = yahoo;
        this.binance = binance;
        this.priceService = priceService;
    }

    /**
     * Retrieves the current real-time live price quote for the symbol.
     *
     * @param symbol symbol code (e.g. EURUSD)
     * @return response containing current price, symbol, and source
     */
    @GetMapping("/api/market/price/{symbol}")
    public ResponseEntity<?> livePrice(@PathVariable String symbol) {
        String sym = symbol == null ? "" : symbol.trim().toUpperCase();
        double p = priceService.getLivePrice(sym);
        return ResponseEntity.ok(Map.of("symbol", sym, "price", round(p, sym), "source", "api_fallback"));
    }

    /**
     * Retrieves historical forex candlestick series for chart plotting.
     *
     * @param symbol currency pair code (e.g. EURUSD)
     * @param interval chart interval code (e.g. 1h, 1d)
     * @return list of CandleBars
     */
    @GetMapping("/api/market/forex/candles")
    public ResponseEntity<?> forexCandles(
            @RequestParam String symbol,
            @RequestParam(defaultValue = "1h") String interval) {
        return candlesResponse(symbol, interval);
    }

    /**
     * Retrieves historical precious metals candlestick series.
     *
     * @param symbol metal symbol (e.g. XAUUSD)
     * @param interval chart interval code (e.g. 1h, 1d)
     * @return list of CandleBars
     */
    @GetMapping("/api/market/metals/candles")
    public ResponseEntity<?> metalsCandles(
            @RequestParam String symbol,
            @RequestParam(defaultValue = "1h") String interval) {
        return candlesResponse(symbol, interval);
    }

    /**
     * Retrieves historical stock candlestick series.
     *
     * @param symbol stock ticker (e.g. AAPL)
     * @param interval chart interval code (e.g. 1h, 1d)
     * @return list of CandleBars
     */
    @GetMapping("/api/market/stock/candles")
    public ResponseEntity<?> stockCandles(
            @RequestParam String symbol,
            @RequestParam(defaultValue = "1h") String interval) {
        return candlesResponse(symbol, interval);
    }

    /**
     * Helper mapping method to check and query candle endpoints sequentially (Binance -> MT5 -> Yahoo -> fallback).
     *
     * @param symbol target market symbol
     * @param interval target chart resolution
     * @return HTTP entity containing bars list
     */
    private ResponseEntity<?> candlesResponse(String symbol, String interval) {
        // 0. Try Binance for crypto
        if (isCrypto(symbol)) {
            try {
                List<CandleBar> data = binance.getCandles(symbol, interval);
                if (data != null && !data.isEmpty()) return ResponseEntity.ok(data);
            } catch (Exception ignored) {}
        }

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

    /**
     * Helper to round prices based on instrument type.
     *
     * @param price raw double price value
     * @param sym symbol code
     * @return rounded BigDecimal value
     */
    private BigDecimal round(double price, String sym) {
        int scale = sym.endsWith("JPY") ? 3 : sym.startsWith("XA") ? 2 : 5;
        return BigDecimal.valueOf(price).setScale(scale, RoundingMode.HALF_UP);
    }

    /**
     * Determines if a symbol belongs to crypto category.
     *
     * @param symbol code to inspect
     * @return true if crypto, false otherwise
     */
    private boolean isCrypto(String symbol) {
        return symbol != null && (symbol.startsWith("BTC") || symbol.startsWith("ETH") || 
               symbol.startsWith("SOL") || symbol.startsWith("XRP") || 
               symbol.startsWith("DOGE") || symbol.startsWith("LTC") || 
               symbol.startsWith("ADA") || symbol.startsWith("BNB"));
    }

    /**
     * Generates a deterministic synthetic quote for demo trades when all api connections are offline.
     *
     * @param symbol instrument code
     * @return rounded base price
     */
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
