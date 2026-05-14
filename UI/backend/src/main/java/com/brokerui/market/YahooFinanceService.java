package com.brokerui.market;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class YahooFinanceService {

    private static final String RAPIDAPI_HOST = "yahoo-finance15.p.rapidapi.com";
    private static final String QUOTE_URL =
            "https://yahoo-finance15.p.rapidapi.com/api/v1/markets/quote?ticker=%s&type=CURRENCY";
    private static final String CHART_URL =
            "https://yahoo-finance15.p.rapidapi.com/api/v1/markets/stock/history?symbol=%s&interval=%s&diffandsplits=false";

    // 1-minute price cache: symbol → [price, fetchedAtMs]
    private final Map<String, double[]> priceCache = new ConcurrentHashMap<>();
    private static final long CACHE_TTL_MS = 60_000;

    @Value("${broker.market.rapidapi-key:}")
    private String rapidApiKey;

    private final RestClient http;
    private final ObjectMapper objectMapper;

    public YahooFinanceService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.http = RestClient.builder().build();
    }

    public boolean isConfigured() {
        return rapidApiKey != null && !rapidApiKey.isBlank();
    }

    /** Returns live price, cached for 60 seconds to stay within API limits. */
    public double getLivePrice(String uiSymbol) throws Exception {
        String key = uiSymbol.trim().toUpperCase();

        double[] cached = priceCache.get(key);
        if (cached != null && (System.currentTimeMillis() - cached[1]) < CACHE_TTL_MS) {
            return cached[0];
        }

        String yahooTicker = mapSymbol(key);
        String url = String.format(QUOTE_URL, URLEncoder.encode(yahooTicker, StandardCharsets.UTF_8));

        String json = http.get()
                .uri(url)
                .header("x-rapidapi-key", rapidApiKey)
                .header("x-rapidapi-host", RAPIDAPI_HOST)
                .retrieve()
                .onStatus(status -> !status.is2xxSuccessful(),
                        (req, res) -> { throw new RuntimeException("RapidAPI price error: " + res.getStatusCode()); })
                .body(String.class);

        if (json == null || json.isBlank()) return 0.0;
        JsonNode root = objectMapper.readTree(json);
        // Response: { "body": { "regularMarketPrice": 1.0875, ... } }
        double price = root.path("body").path("regularMarketPrice").asDouble(0.0);

        if (price > 0) {
            priceCache.put(key, new double[]{price, System.currentTimeMillis()});
        }
        return price;
    }

    /** Fetches OHLCV candles from RapidAPI Yahoo Finance. */
    public List<CandleBar> getCandles(String uiSymbol, String intervalKey) throws Exception {
        String yahooTicker = mapSymbol(uiSymbol.trim().toUpperCase());
        String interval = mapInterval(intervalKey);

        String url = String.format(CHART_URL,
                URLEncoder.encode(yahooTicker, StandardCharsets.UTF_8), interval);

        String json = http.get()
                .uri(url)
                .header("x-rapidapi-key", rapidApiKey)
                .header("x-rapidapi-host", RAPIDAPI_HOST)
                .retrieve()
                .onStatus(status -> !status.is2xxSuccessful(),
                        (req, res) -> { throw new RuntimeException("RapidAPI candles error: " + res.getStatusCode()); })
                .body(String.class);

        if (json == null || json.isBlank()) return List.of();
        JsonNode root = objectMapper.readTree(json);
        // Response is an array of { date, open, high, low, close, ... }
        if (!root.isArray()) return List.of();

        List<CandleBar> candles = new ArrayList<>();
        for (JsonNode bar : root) {
            long ts = bar.path("date").asLong(0);
            double o = bar.path("open").asDouble(0);
            double h = bar.path("high").asDouble(0);
            double l = bar.path("low").asDouble(0);
            double c = bar.path("close").asDouble(0);
            if (ts > 0 && c > 0) {
                candles.add(new CandleBar(ts, o, h, l, c));
            }
        }
        return candles;
    }

    private String mapSymbol(String s) {
        return switch (s) {
            case "EURUSD" -> "EURUSD=X";
            case "GBPUSD" -> "GBPUSD=X";
            case "USDJPY" -> "USDJPY=X";
            case "USDCAD" -> "USDCAD=X";
            case "NZDUSD" -> "NZDUSD=X";
            case "AUDUSD" -> "AUDUSD=X";
            case "EURNOK" -> "EURNOK=X";
            case "GBPJPY" -> "GBPJPY=X";
            case "CADJPY" -> "CADJPY=X";
            case "XAUUSD" -> "GC=F";
            case "XAGUSD" -> "SI=F";
            default -> s.contains("=") || s.contains("-") ? s : s + "=X";
        };
    }

    private String mapInterval(String intervalKey) {
        return switch (intervalKey) {
            case "1m"  -> "1m";
            case "5m"  -> "5m";
            case "15m" -> "15m";
            case "1h"  -> "1h";
            case "4h"  -> "1h";
            case "1d"  -> "1d";
            case "1w"  -> "1wk";
            case "1M"  -> "1mo";
            default    -> "1h";
        };
    }
}
