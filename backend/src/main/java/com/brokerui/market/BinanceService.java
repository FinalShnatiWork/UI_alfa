package com.brokerui.market;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Service to interact with the Bybit REST API for retrieving market tickers and historical klines/candles.
 */
@Service
public class BinanceService {

    private static final String BYBIT_PRICE_URL = "https://api.bybit.com/v5/market/tickers?category=linear&symbol=%s";
    private static final String BYBIT_KLINES_URL = "https://api.bybit.com/v5/market/kline?category=linear&symbol=%s&interval=%s&limit=100";

    private final HttpClient httpClient;
    private final ObjectMapper om;

    private final Map<String, double[]> priceCache = new ConcurrentHashMap<>();
    private static final long CACHE_TTL_MS = 2000; // 2 seconds for live price

    /**
     * Constructs the BinanceService with customized ObjectMapper.
     *
     * @param om Jackson JSON object mapper
     */
    public BinanceService(ObjectMapper om) {
        this.om = om;
        this.httpClient = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.ALWAYS)
                .build();
    }

    /**
     * Checks if this market service configuration is complete.
     *
     * @return true, as Bybit API endpoints require no custom API key configurations
     */
    public boolean isConfigured() {
        return true;
    }

    /**
     * Retrieves the current live ticker price for the symbol from Bybit.
     * Uses a short-duration concurrent cache.
     *
     * @param uiSymbol user interface symbol code (e.g. BTCUSD)
     * @return last traded price as double
     * @throws Exception if HTTP connection or parsing fails
     */
    public double getLivePrice(String uiSymbol) throws Exception {
        String symbol = mapSymbol(uiSymbol);
        
        double[] cached = priceCache.get(symbol);
        if (cached != null && (System.currentTimeMillis() - cached[1]) < CACHE_TTL_MS) {
            return cached[0];
        }

        String url = String.format(BYBIT_PRICE_URL, symbol);
        HttpRequest req = HttpRequest.newBuilder().uri(URI.create(url)).GET().build();
        HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());

        if (res.statusCode() == 200 && res.body() != null) {
            JsonNode node = om.readTree(res.body());
            JsonNode list = node.path("result").path("list");
            if (list.isArray() && !list.isEmpty()) {
                double price = list.get(0).path("lastPrice").asDouble(0);
                if (price > 0) {
                    priceCache.put(symbol, new double[]{price, System.currentTimeMillis()});
                    return price;
                }
            }
        }
        return 0;
    }

    /**
     * Fetches recent historical klines/candles for chart rendering from Bybit.
     *
     * @param uiSymbol user interface symbol code (e.g. BTCUSD)
     * @param intervalKey chart interval code (e.g. 1m, 1h, 1d)
     * @return a list of historical CandleBar objects
     * @throws Exception if connection or parsing fails
     */
    public List<CandleBar> getCandles(String uiSymbol, String intervalKey) throws Exception {
        String symbol = mapSymbol(uiSymbol);
        String interval = mapInterval(intervalKey);

        String url = String.format(BYBIT_KLINES_URL, symbol, interval);
        HttpRequest req = HttpRequest.newBuilder().uri(URI.create(url)).GET().build();
        HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());

        if (res.statusCode() == 200 && res.body() != null) {
            JsonNode root = om.readTree(res.body());
            JsonNode list = root.path("result").path("list");
            if (list.isArray()) {
                List<CandleBar> bars = new ArrayList<>();
                for (JsonNode kline : list) {
                    long openTime = kline.get(0).asLong() / 1000L; // convert ms to seconds
                    double open = kline.get(1).asDouble();
                    double high = kline.get(2).asDouble();
                    double low = kline.get(3).asDouble();
                    double close = kline.get(4).asDouble();
                    // Bybit returns newest first, so we'll add at index 0 to sort ascending
                    bars.add(0, new CandleBar(openTime, open, high, low, close));
                }
                return bars;
            }
        }
        return List.of();
    }

    /**
     * Map user-facing UI symbols (like BTCUSD) to Bybit exchange symbols (like BTCUSDT).
     *
     * @param s UI symbol
     * @return mapped Bybit exchange symbol
     */
    private String mapSymbol(String s) {
        String sym = s.trim().toUpperCase();
        if (sym.endsWith("USD")) {
            return sym + "T";
        }
        if (!sym.endsWith("USDT")) {
             return sym + "USDT";
        }
        return sym;
    }

    /**
     * Maps user-facing chart interval keys (like 1h) to Bybit interval query parameters.
     *
     * @param k UI interval key
     * @return mapped Bybit interval string
     */
    private String mapInterval(String k) {
        return switch (k) {
            case "1m" -> "1";
            case "5m" -> "5";
            case "15m" -> "15";
            case "30m" -> "30";
            case "1h" -> "60";
            case "4h" -> "240";
            case "1d" -> "D";
            case "1w" -> "W";
            case "1M" -> "M";
            default -> "60";
        };
    }
}
