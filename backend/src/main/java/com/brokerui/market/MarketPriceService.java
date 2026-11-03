package com.brokerui.market;

import com.brokerui.broker.MT5IntegrationService;
import java.math.BigDecimal;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

/**
 * Aggregator service that coordinates fetching live prices from multiple adapters
 * (Binance for crypto, MT5 for FX/metals, Yahoo Finance as secondary).
 * When every feed is silent, callers can use the last real price of this server run.
 */
@Service
public class MarketPriceService {
    private static final long CACHE_TTL_MS = 1500;

    private final MT5IntegrationService mt5;
    private final YahooFinanceService yahoo;
    private final BinanceService binance;
    private final ConcurrentHashMap<String, CachedQuote> cache = new ConcurrentHashMap<>();
    /** Last price a real feed actually returned. Kept for this server run, not only for 1.5 seconds. */
    private final ConcurrentHashMap<String, Double> lastReal = new ConcurrentHashMap<>();

    private record CachedQuote(double price, long fetchedAtMs) {}

    /** A price for an order. {@code live} is false when the feeds are silent and this is the last real price. */
    public record ExecutionQuote(double price, boolean live) {}

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
     * Attempts to query live price quote from all configured feeds in sequence.
     * The goal is to return a valid non-zero quote.
     *
     * @param symbol symbol code (e.g. BTCUSD, EURUSD)
     * @return live quote as double
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

        ExecutionQuote quote = executionQuote(sym);
        if (quote == null) return 0.0;
        cache.put(sym, new CachedQuote(quote.price(), now));
        return quote.price();
    }

    /**
     * Price for a user order. A live feed wins. If every feed is silent, the last real
     * price from this server run is returned with {@code live=false}. A made-up demo
     * price is never returned.
     */
    public ExecutionQuote executionQuote(String symbol) {
        String sym = symbol == null ? "" : symbol.trim().toUpperCase();
        if (sym.isEmpty()) return null;

        TestOverride override = getTestOverride(sym);
        if (override != null) return new ExecutionQuote(override.mid(), true);

        double real = fetchRealPrice(sym);
        if (real > 0) {
            lastReal.put(sym, real);
            return new ExecutionQuote(real, true);
        }
        Double last = lastReal.get(sym);
        if (last != null && last > 0) return new ExecutionQuote(last, false);
        return null;
    }

    /**
     * A quote from a real feed, the last real quote of this server run, or a test override.
     * Null when this server has never seen a real price for the symbol.
     * Used to convert yen and kroner into dollars.
     */
    public BigDecimal marketPrice(String symbol) {
        String sym = symbol == null ? "" : symbol.trim().toUpperCase();
        if (sym.isEmpty()) return null;
        TestOverride override = getTestOverride(sym);
        if (override != null) return BigDecimal.valueOf(override.mid());

        ExecutionQuote quote = executionQuote(sym);
        return quote == null ? null : BigDecimal.valueOf(quote.price());
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
