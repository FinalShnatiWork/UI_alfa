package com.brokerui.market;

import com.brokerui.broker.MT5IntegrationService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import org.springframework.stereotype.Service;

@Service
public class MarketPriceService {
    private final MT5IntegrationService mt5;
    private final YahooFinanceService yahoo;
    private final BinanceService binance;

    public MarketPriceService(MT5IntegrationService mt5, YahooFinanceService yahoo, BinanceService binance) {
        this.mt5 = mt5;
        this.yahoo = yahoo;
        this.binance = binance;
    }

    public double getLivePrice(String symbol) {
        String sym = symbol == null ? "" : symbol.trim().toUpperCase();

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

        // 2. Try Yahoo Finance (RapidAPI) if configured
        if (yahoo.isConfigured()) {
            try {
                double p = yahoo.getLivePrice(sym);
                if (p > 0) return p;
            } catch (Exception ignored) {}
        }

        // 3. Synthetic fallback
        return syntheticDemoPrice(sym).doubleValue();
    }

    private boolean isCrypto(String symbol) {
        return symbol != null && (symbol.startsWith("BTC") || symbol.startsWith("ETH") || 
               symbol.startsWith("SOL") || symbol.startsWith("XRP") || 
               symbol.startsWith("DOGE") || symbol.startsWith("LTC") || 
               symbol.startsWith("ADA") || symbol.startsWith("BNB"));
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
