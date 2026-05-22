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

@Service
public class BinanceService {

    private static final String BINANCE_PRICE_URL = "https://api.binance.com/api/v3/ticker/price?symbol=%s";
    private static final String BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines?symbol=%s&interval=%s&limit=100";

    private final HttpClient httpClient;
    private final ObjectMapper om;

    private final Map<String, double[]> priceCache = new ConcurrentHashMap<>();
    private static final long CACHE_TTL_MS = 2000; // 2 seconds for live price

    public BinanceService(ObjectMapper om) {
        this.om = om;
        this.httpClient = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.ALWAYS)
                .build();
    }

    public boolean isConfigured() {
        return true;
    }

    public double getLivePrice(String uiSymbol) throws Exception {
        String symbol = mapSymbol(uiSymbol);
        
        double[] cached = priceCache.get(symbol);
        if (cached != null && (System.currentTimeMillis() - cached[1]) < CACHE_TTL_MS) {
            return cached[0];
        }

        String url = String.format(BINANCE_PRICE_URL, symbol);
        HttpRequest req = HttpRequest.newBuilder().uri(URI.create(url)).GET().build();
        HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());

        if (res.statusCode() == 200 && res.body() != null) {
            JsonNode node = om.readTree(res.body());
            double price = node.path("price").asDouble(0);
            if (price > 0) {
                priceCache.put(symbol, new double[]{price, System.currentTimeMillis()});
                return price;
            }
        }
        return 0;
    }

    public List<CandleBar> getCandles(String uiSymbol, String intervalKey) throws Exception {
        String symbol = mapSymbol(uiSymbol);
        String interval = mapInterval(intervalKey);

        String url = String.format(BINANCE_KLINES_URL, symbol, interval);
        HttpRequest req = HttpRequest.newBuilder().uri(URI.create(url)).GET().build();
        HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());

        if (res.statusCode() == 200 && res.body() != null) {
            JsonNode arr = om.readTree(res.body());
            if (arr.isArray()) {
                List<CandleBar> bars = new ArrayList<>();
                for (JsonNode kline : arr) {
                    long openTime = kline.get(0).asLong() / 1000L; // convert ms to seconds
                    double open = kline.get(1).asDouble();
                    double high = kline.get(2).asDouble();
                    double low = kline.get(3).asDouble();
                    double close = kline.get(4).asDouble();
                    bars.add(new CandleBar(openTime, open, high, low, close));
                }
                return bars;
            }
        }
        return List.of();
    }

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

    private String mapInterval(String k) {
        return switch (k) {
            case "1m" -> "1m"; case "5m" -> "5m";
            case "15m" -> "15m"; case "30m" -> "30m";
            case "1h" -> "1h"; case "4h" -> "4h";
            case "1d" -> "1d"; case "1w" -> "1w";
            case "1M" -> "1M"; default -> "1h";
        };
    }
}
