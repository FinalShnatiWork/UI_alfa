package com.brokerui.market;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Fetches Forex/Metals live prices and OHLCV candles from Yahoo Finance public v7 API.
 */
@Service
public class YahooFinanceService {

    private static final String YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v7/finance/chart/%s?interval=%s&range=%s";
    private static final String UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

    private final Map<String, double[]> priceCache = new ConcurrentHashMap<>();
    private static final long CACHE_TTL_MS = 5_000; // 5-second TTL price cache

    private final HttpClient httpClient;
    private final ObjectMapper om;

    /**
     * Constructs the YahooFinanceService.
     *
     * @param om Jackson JSON object mapper
     */
    public YahooFinanceService(ObjectMapper om) {
        this.om = om;
        this.httpClient = buildHttpClient();
    }

    private static HttpClient buildHttpClient() {
        try {
            TrustManager[] trustAll = { new X509TrustManager() {
                public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                public void checkClientTrusted(X509Certificate[] c, String a) {}
                public void checkServerTrusted(X509Certificate[] c, String a) {}
            }};
            SSLContext sc = SSLContext.getInstance("TLS");
            sc.init(null, trustAll, new SecureRandom());
            return HttpClient.newBuilder()
                    .sslContext(sc)
                    .followRedirects(HttpClient.Redirect.ALWAYS)
                    .build();
        } catch (Exception e) {
            return HttpClient.newBuilder()
                    .followRedirects(HttpClient.Redirect.ALWAYS)
                    .build();
        }
    }

    public boolean isConfigured() {
        return true;
    }

    /**
     * Fetches live market price by querying Yahoo Chart v7 API.
     *
     * @param uiSymbol user interface symbol (e.g. EURUSD)
     * @return current double price quote
     */
    public double getLivePrice(String uiSymbol) throws Exception {
        String key = uiSymbol.trim().toUpperCase();
        double[] cached = priceCache.get(key);
        if (cached != null && (System.currentTimeMillis() - cached[1]) < CACHE_TTL_MS) {
            return cached[0];
        }

        double price = 0;
        String ticker = mapSymbol(key);
        try {
            String url = String.format(YAHOO_CHART_URL, URLEncoder.encode(ticker, StandardCharsets.UTF_8), "1m", "1d");
            HttpRequest req = HttpRequest.newBuilder().uri(URI.create(url)).header("User-Agent", UA).header("Accept", "application/json").GET().build();
            HttpResponse<String> r = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (r.statusCode() == 200 && r.body() != null) {
                JsonNode root = om.readTree(r.body());
                JsonNode result = root.path("chart").path("result");
                if (result.isArray() && !result.isEmpty()) {
                    price = result.get(0).path("meta").path("regularMarketPrice").asDouble(0);
                }
            }
        } catch (Exception e) {
            System.err.println("[Yahoo] Live price error for " + uiSymbol + ": " + e.getMessage());
        }

        if (price > 0) {
            priceCache.put(key, new double[]{price, System.currentTimeMillis()});
        }
        return price;
    }

    /**
     * Retrieves historical candlestick series for charting from Yahoo.
     *
     * @param uiSymbol user interface symbol code (e.g. EURUSD)
     * @param intervalKey chart interval code (e.g. 1h, 1d)
     * @return list of CandleBars
     */
    public List<CandleBar> getCandles(String uiSymbol, String intervalKey) throws Exception {
        String ticker = mapSymbol(uiSymbol.trim().toUpperCase());
        String interval = mapInterval(intervalKey);
        String range = mapRange(intervalKey);

        try {
            String url = String.format(YAHOO_CHART_URL, URLEncoder.encode(ticker, StandardCharsets.UTF_8), interval, range);
            HttpRequest req = HttpRequest.newBuilder().uri(URI.create(url)).header("User-Agent", UA).header("Accept", "application/json").GET().build();
            HttpResponse<String> r = httpClient.send(req, HttpResponse.BodyHandlers.ofString());

            if (r.statusCode() == 200 && r.body() != null) {
                List<CandleBar> bars = parseYahooChart(r.body());
                if (!bars.isEmpty()) {
                    return bars;
                }
            }
        } catch (Exception e) {
            System.err.println("[Yahoo] Candles error for " + uiSymbol + ": " + e.getMessage());
        }

        return List.of();
    }

    /**
     * Parses historical candles from the Yahoo Chart REST response JSON.
     * The goal is to return mapped CandleBars list.
     *
     * @param json response payload
     * @return parsed historical CandleBars list
     * @throws Exception if json structure is invalid
     */
    private List<CandleBar> parseYahooChart(String json) throws Exception {
        JsonNode root = om.readTree(json);
        JsonNode result = root.path("chart").path("result");
        if (!result.isArray() || result.isEmpty()) return List.of();
        JsonNode data = result.get(0);
        JsonNode ts = data.path("timestamp");
        JsonNode q = data.path("indicators").path("quote").get(0);
        if (ts.isMissingNode() || q == null) return List.of();

        JsonNode opens = q.path("open"), highs = q.path("high"),
                 lows  = q.path("low"),  closes = q.path("close");
        List<CandleBar> out = new ArrayList<>(ts.size());
        for (int i = 0; i < ts.size(); i++) {
            if (opens.get(i).isNull() || closes.get(i).isNull()) continue;
            out.add(new CandleBar(ts.get(i).asLong(),
                    opens.get(i).asDouble(), highs.get(i).asDouble(),
                    lows.get(i).asDouble(),  closes.get(i).asDouble()));
        }
        return out;
    }

    /**
     * Maps user-facing symbol codes to Yahoo Finance ticker suffixes (e.g. EURUSD -> EURUSD=X).
     *
     * @param s UI symbol
     * @return mapped Yahoo ticker
     */
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

    /**
     * Maps chart interval codes to Yahoo chart query intervals.
     *
     * @param k UI interval key
     * @return Yahoo query interval
     */
    private String mapInterval(String k) {
        return switch (k) {
            case "1m" -> "1m"; case "5m" -> "5m";
            case "1h" -> "1h"; case "4h" -> "1h";
            case "1d" -> "1d"; case "1w" -> "1wk";
            case "1M" -> "1mo"; default -> "1h";
        };
    }

    /**
     * Maps chart interval codes to Yahoo chart query range window size.
     *
     * @param k UI interval key
     * @return Yahoo query range window
     */
    private String mapRange(String k) {
        return switch (k) {
            case "1m" -> "1d"; case "5m" -> "5d";
            case "1h" -> "1mo"; case "4h" -> "3mo";
            case "1d" -> "1y"; case "1w" -> "5y";
            case "1M" -> "max"; default -> "1mo";
        };
    }
}
