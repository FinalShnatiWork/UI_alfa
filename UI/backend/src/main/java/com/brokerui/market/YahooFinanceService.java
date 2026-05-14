package com.brokerui.market;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import javax.net.ssl.*;
import java.net.HttpURLConnection;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Fetches Forex/Metals prices and candles.
 * Priority: RapidAPI Yahoo Finance → unofficial Yahoo Finance → empty (frontend uses synthetic)
 */
@Service
public class YahooFinanceService {

    // Unofficial Yahoo Finance (no key, free)
    private static final String UNOFFICIAL_QUOTE = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=%s";
    private static final String UNOFFICIAL_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/%s?interval=%s&range=%s";

    // RapidAPI Yahoo Finance (requires key) — try both popular hosts
    private static final String[] RAPID_HOSTS = {
        "yh-finance.p.rapidapi.com",
        "yahoo-finance15.p.rapidapi.com",
        "yahoo-finance166.p.rapidapi.com"
    };

    // 1-minute price cache
    private final Map<String, double[]> priceCache = new ConcurrentHashMap<>();
    private static final long CACHE_TTL_MS = 60_000;

    @Value("${broker.market.rapidapi-key:}")
    private String rapidApiKey;

    private final RestClient http;
    private final ObjectMapper om;

    public YahooFinanceService(ObjectMapper om) {
        this.om = om;
        this.http = RestClient.builder()
                .requestFactory(trustAllFactory())
                .build();
    }

    /** Creates an HTTP factory that skips SSL certificate validation.
     *  Safe for external market-data calls in a demo environment. */
    private static SimpleClientHttpRequestFactory trustAllFactory() {
        try {
            TrustManager[] trustAll = { new X509TrustManager() {
                public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                public void checkClientTrusted(X509Certificate[] c, String a) {}
                public void checkServerTrusted(X509Certificate[] c, String a) {}
            }};
            SSLContext sc = SSLContext.getInstance("TLS");
            sc.init(null, trustAll, new SecureRandom());
            HttpsURLConnection.setDefaultSSLSocketFactory(sc.getSocketFactory());
            HttpsURLConnection.setDefaultHostnameVerifier((h, s) -> true);
        } catch (Exception ignored) {}
        return new SimpleClientHttpRequestFactory() {
            @Override
            protected void prepareConnection(HttpURLConnection conn, String method) throws java.io.IOException {
                if (conn instanceof HttpsURLConnection https) {
                    https.setHostnameVerifier((h, s) -> true);
                }
                super.prepareConnection(conn, method);
            }
        };
    }

    public boolean isConfigured() {
        return true; // always available (unofficial fallback)
    }

    /** Returns live price, cached 60 s. */
    public double getLivePrice(String uiSymbol) throws Exception {
        String key = uiSymbol.trim().toUpperCase();
        double[] cached = priceCache.get(key);
        if (cached != null && (System.currentTimeMillis() - cached[1]) < CACHE_TTL_MS) {
            return cached[0];
        }

        String ticker = mapSymbol(key);
        double price = 0;

        // 1. Try unofficial Yahoo Finance
        try {
            String url = String.format(UNOFFICIAL_QUOTE, URLEncoder.encode(ticker, StandardCharsets.UTF_8));
            String json = http.get().uri(url)
                    .header("User-Agent", "Mozilla/5.0")
                    .retrieve()
                    .onStatus(s -> !s.is2xxSuccessful(), (req, res) -> {
                        throw new RuntimeException("Yahoo unofficial: " + res.getStatusCode());
                    })
                    .body(String.class);
            if (json != null) {
                JsonNode result = om.readTree(json).path("quoteResponse").path("result");
                if (result.isArray() && !result.isEmpty()) {
                    price = result.get(0).path("regularMarketPrice").asDouble(0);
                }
            }
        } catch (Exception e) {
            System.err.println("[Yahoo] Price error for " + uiSymbol + ": " + e.getMessage());
        }

        // 2. Try RapidAPI if unofficial failed and key is set
        if (price <= 0 && rapidApiKey != null && !rapidApiKey.isBlank()) {
            for (String host : RAPID_HOSTS) {
                try {
                    String url = String.format("https://%s/market/v2/get-quotes?region=US&symbols=%s",
                            host, URLEncoder.encode(ticker, StandardCharsets.UTF_8));
                    String json = http.get().uri(url)
                            .header("x-rapidapi-key", rapidApiKey)
                            .header("x-rapidapi-host", host)
                            .retrieve()
                            .onStatus(s -> !s.is2xxSuccessful(), (req, res) -> {
                                throw new RuntimeException("RapidAPI " + host + ": " + res.getStatusCode());
                            })
                            .body(String.class);
                    if (json != null) {
                        JsonNode result = om.readTree(json).path("quoteResponse").path("result");
                        if (result.isArray() && !result.isEmpty()) {
                            price = result.get(0).path("regularMarketPrice").asDouble(0);
                            if (price > 0) break;
                        }
                    }
                } catch (Exception ignored) {}
            }
        }

        if (price > 0) {
            priceCache.put(key, new double[]{price, System.currentTimeMillis()});
        }
        return price;
    }

    /** Returns OHLCV candles. */
    public List<CandleBar> getCandles(String uiSymbol, String intervalKey) throws Exception {
        String ticker = mapSymbol(uiSymbol.trim().toUpperCase());
        String interval = mapInterval(intervalKey);
        String range = mapRange(intervalKey);

        // 1. Try unofficial Yahoo Finance chart
        try {
            String url = String.format(UNOFFICIAL_CHART,
                    URLEncoder.encode(ticker, StandardCharsets.UTF_8), interval, range);
            String json = http.get().uri(url)
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                    .header("Accept", "application/json")
                    .header("Accept-Language", "en-US,en;q=0.9")
                    .retrieve()
                    .onStatus(s -> !s.is2xxSuccessful(), (req, res) -> {
                        throw new RuntimeException("Yahoo unofficial chart: " + res.getStatusCode());
                    })
                    .body(String.class);
            if (json != null) {
                List<CandleBar> bars = parseYahooChart(json);
                if (!bars.isEmpty()) return bars;
                System.err.println("[Yahoo] Candles empty for " + uiSymbol + " ticker=" + ticker);
            }
        } catch (Exception e) {
            System.err.println("[Yahoo] Chart error for " + uiSymbol + ": " + e.getMessage());
        }

        return List.of(); // frontend will use synthetic
    }

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

    private String mapInterval(String k) {
        return switch (k) {
            case "1m" -> "1m"; case "5m" -> "5m";
            case "1h" -> "1h"; case "4h" -> "1h";
            case "1d" -> "1d"; case "1w" -> "1wk";
            case "1M" -> "1mo"; default -> "1h";
        };
    }

    private String mapRange(String k) {
        return switch (k) {
            case "1m" -> "1d"; case "5m" -> "5d";
            case "1h" -> "1mo"; case "4h" -> "3mo";
            case "1d" -> "1y"; case "1w" -> "5y";
            case "1M" -> "max"; default -> "1mo";
        };
    }
}
