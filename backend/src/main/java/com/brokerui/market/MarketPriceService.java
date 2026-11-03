package com.brokerui.market;

import com.brokerui.broker.MT5IntegrationService;
import java.math.BigDecimal;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

/**
 * Aggregator service that coordinates fetching live prices from multiple adapters
 * (Binance for crypto, MT5 for FX/metals, Yahoo Finance as secondary).
 * When every feed is silent there is no price: callers get 0 or null and must not trade.
 */
@Service
public class MarketPriceService {
    private static final long CACHE_TTL_MS = 1500;

    private final MT5IntegrationService mt5;
    private final YahooFinanceService yahoo;
    private final BinanceService binance;
    private final ConcurrentHashMap<String, CachedQuote> cache = new ConcurrentHashMap<>();

    private record CachedQuote(double price, long fetchedAtMs) {}

    /**
     * Constructs the MarketPriceService with required data adapters.
     *
     * @param mt5 MetaTrader 5 service integration
     * @param yahoo Yahoo Finance service integration
     * @param binance Binance crypto price service integration
     */
    public MarketPriceService(MT5IntegrationService mt5, YahooFinanceService yahoo, BinanceService binance) {
        this.mt5 = mt5;
        this.yahoo = yahoo;
        this.binance = binance;
    }

    /**
     * Live quote from the first feed that answers, or a test override.
     * A quote younger than {@link #CACHE_TTL_MS} is reused; an older one is never.
     *
     * @param symbol symbol code (e.g. BTCUSD, EURUSD)
     * @return live quote, or 0 when every feed is silent
     */
    public double getLivePrice(String symbol) {
        String sym = symbol == null ? "" : symbol.trim().toUpperCase();
        if (sym.isEmpty()) return 0.0;

        TestOverride override = getTestOverride(sym);
        if (override != null) return override.mid();

        long now = System.currentTimeMillis();
        CachedQuote cached = cache.get(sym);
        if (cached != null && now - cached.fetchedAtMs() < CACHE_TTL_MS) {
            return cached.price();
        }

        double real = fetchRealPrice(sym);
        if (!(real > 0)) return 0.0;
        cache.put(sym, new CachedQuote(real, now));
        return real;
    }

    /**
     * The same live quote as a BigDecimal, or null when every feed is silent.
     * Used to convert yen and kroner into dollars.
     */
    public BigDecimal marketPrice(String symbol) {
        double p = getLivePrice(symbol);
        return p > 0 ? BigDecimal.valueOf(p) : null;
    }

    private double fetchRealPrice(String sym) {
        // 0. Try Binance for crypto
        if (isCrypto(sym)) {
            try {
                double p = binance.getLivePrice(sym);
                if (p > 0) return p;
            } catch (Exception ignored) {}
        }

        // 1. Try MT5 if configured
        if (mt5.isConfigured()) {
            try {
                double p = mt5.getPrice(sym);
                if (Double.isFinite(p) && p > 0) return p;
            } catch (Exception ignored) {}
        }

        // 2. Try Yahoo Finance
        if (yahoo.isConfigured()) {
            try {
                double p = yahoo.getLivePrice(sym);
                if (p > 0) return p;
            } catch (Exception ignored) {}
        }

        return 0;
    }

    /**
     * Checks if the symbol represents a cryptocurrency.
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

    // ─── Test-only price overrides (netting scenarios, admin test endpoints) ─────
    // Localhost-only admin endpoints freeze a symbol's price so "1bp below mid" scenarios are
    // exact. Every consumer (fills, equity, SL/TP, UI) goes through getLivePrice, so they all see
    // the same frozen price. Overrides expire on their own so a crashed test never leaves them on.

    /** A frozen mid, optionally flagged as a crossed (broken) market. */
    public record TestOverride(double mid, boolean crossed, long expiresAtMs) {}

    private final ConcurrentHashMap<String, TestOverride> testOverrides = new ConcurrentHashMap<>();

    public void setTestOverride(String symbol, double mid, boolean crossed, long ttlMs) {
        if (symbol == null || !(mid > 0)) throw new IllegalArgumentException("symbol and positive mid required");
        testOverrides.put(symbol.trim().toUpperCase(), new TestOverride(mid, crossed, System.currentTimeMillis() + Math.max(1000, ttlMs)));
    }

    public void clearTestOverride(String symbol) {
        if (symbol == null) return;
        testOverrides.remove(symbol.trim().toUpperCase());
    }

    public void clearAllTestOverrides() {
        testOverrides.clear();
    }

    /** @return the active override for this symbol, or null (expired ones are removed). */
    public TestOverride getTestOverride(String symbol) {
        if (symbol == null) return null;
        String sym = symbol.trim().toUpperCase();
        TestOverride o = testOverrides.get(sym);
        if (o == null) return null;
        if (System.currentTimeMillis() > o.expiresAtMs()) {
            testOverrides.remove(sym, o);
            return null;
        }
        return o;
    }

    public java.util.Map<String, TestOverride> activeTestOverrides() {
        java.util.Map<String, TestOverride> out = new java.util.TreeMap<>();
        for (String k : testOverrides.keySet()) {
            TestOverride o = getTestOverride(k);
            if (o != null) out.put(k, o);
        }
        return out;
    }
}
