package com.brokerui.market;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.net.CookieManager;
import java.net.CookiePolicy;
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
import java.util.stream.Collectors;

/**
 * Fetches Forex/Metals live prices and OHLCV candles.
 *
 * Price priority:   Frankfurter (Forex) → synthetic fallback
 * Candles priority: Yahoo Finance (crumb-auth) → synthetic fallback on frontend
 */
@Service
public class YahooFinanceService {

    // Yahoo Finance chart (crumb-authenticated)
    private static final String YAHOO_CRUMB_INIT = "https://finance.yahoo.com/";
    private static final String YAHOO_CRUMB_URL  = "https://query1.finance.yahoo.com/v1/test/getcrumb";
    private static final String YAHOO_CHART      =
            "https://query1.finance.yahoo.com/v8/finance/chart/%s?interval=%s&range=%s&crumb=%s";

    private static final String UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

    // 1-minute price cache
    private final Map<String, double[]> priceCache = new ConcurrentHashMap<>();
    private static final long CACHE_TTL_MS = 60_000;

    @Value("${broker.market.rapidapi-key:}")
    private String rapidApiKey;   // kept for future use, not currently used

    private final HttpClient httpClient;
    private final ObjectMapper om;

    // Yahoo crumb state
    private volatile String yahoocrumb = null;
    private volatile String yahooCookies = null;
    private volatile long crumbFetchedAt = 0;
    private static final long CRUMB_TTL_MS = 30 * 60_000; // 30 minutes

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
                    .cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL))
                    .followRedirects(HttpClient.Redirect.ALWAYS)
                    .build();
        } catch (Exception e) {
            System.err.println("[Market] SSL setup error: " + e.getMessage());
            return HttpClient.newBuilder()
                    .cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL))
                    .followRedirects(HttpClient.Redirect.ALWAYS)
                    .build();
        }
    }

    public boolean isConfigured() {
        return true;
    }

    // ─────────────────────────────────────────────────────────────
    //  LIVE PRICE  — uses Yahoo Finance meta regularMarketPrice
    // ─────────────────────────────────────────────────────────────

    public double getLivePrice(String uiSymbol) throws Exception {
        String key = uiSymbol.trim().toUpperCase();
        double[] cached = priceCache.get(key);
        if (cached != null && (System.currentTimeMillis() - cached[1]) < CACHE_TTL_MS) {
            return cached[0];
        }

        double price = 0;
        String ticker = mapSymbol(key);
        String crumb = getYahooCrumb();
        if (crumb != null) {
            try {
                String url = String.format(YAHOO_CHART,
                        URLEncoder.encode(ticker, StandardCharsets.UTF_8),
                        "1m", "1d",
                        URLEncoder.encode(crumb, StandardCharsets.UTF_8));
                HttpRequest.Builder req = HttpRequest.newBuilder().uri(URI.create(url)).header("User-Agent", UA).header("Accept", "application/json").GET();
                if (yahooCookies != null) {
                    req.header("Cookie", yahooCookies);
                }
                HttpResponse<String> r = httpClient.send(req.build(), HttpResponse.BodyHandlers.ofString());
                if (r.statusCode() == 200 && r.body() != null) {
                    JsonNode root = om.readTree(r.body());
                    JsonNode result = root.path("chart").path("result");
                    if (result.isArray() && !result.isEmpty()) {
                        price = result.get(0).path("meta").path("regularMarketPrice").asDouble(0);
                    }
                } else if (r.statusCode() == 401) {
                    yahoocrumb = null;
                }
            } catch (Exception e) {
                System.err.println("[Yahoo] Live price error for " + uiSymbol + ": " + e.getMessage());
            }
        }

        if (price > 0) {
            priceCache.put(key, new double[]{price, System.currentTimeMillis()});
        }
        return price;
    }

    // ─────────────────────────────────────────────────────────────
    //  CANDLES  — tries Yahoo Finance with crumb, returns empty on failure
    // ─────────────────────────────────────────────────────────────

    public List<CandleBar> getCandles(String uiSymbol, String intervalKey) throws Exception {
        String ticker = mapSymbol(uiSymbol.trim().toUpperCase());
        String interval = mapInterval(intervalKey);
        String range = mapRange(intervalKey);

        // Try to get/refresh Yahoo crumb
        String crumb = getYahooCrumb();
        if (crumb != null) {
            try {
                String url = String.format(YAHOO_CHART,
                        URLEncoder.encode(ticker, StandardCharsets.UTF_8),
                        interval, range,
                        URLEncoder.encode(crumb, StandardCharsets.UTF_8));

                HttpRequest.Builder req = HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .header("User-Agent", UA)
                        .header("Accept", "application/json")
                        .GET();
                if (yahooCookies != null) {
                    req.header("Cookie", yahooCookies);
                }

                HttpResponse<String> r = httpClient.send(req.build(),
                        HttpResponse.BodyHandlers.ofString());

                if (r.statusCode() == 200 && r.body() != null) {
                    List<CandleBar> bars = parseYahooChart(r.body());
                    if (!bars.isEmpty()) {
                        System.out.println("[Yahoo] Got " + bars.size() + " candles for " + uiSymbol);
                        return bars;
                    }
                    System.err.println("[Yahoo] Empty candles for " + uiSymbol);
                } else if (r.statusCode() == 401) {
                    yahoocrumb = null;
                    System.err.println("[Yahoo] 401 candles for " + uiSymbol + " — crumb reset");
                } else {
                    System.err.println("[Yahoo] Candles status " + r.statusCode() + " for " + uiSymbol);
                }
            } catch (Exception e) {
                System.err.println("[Yahoo] Candles error for " + uiSymbol + ": " + e.getMessage());
            }
        }

        return List.of(); // frontend will use synthetic candles
    }

    /** Gets (or refreshes) the Yahoo Finance crumb with explicit cookie forwarding. */
    private String getYahooCrumb() {
        long now = System.currentTimeMillis();
        if (yahoocrumb != null && (now - crumbFetchedAt) < CRUMB_TTL_MS) return yahoocrumb;
        try {
            // Step 1: visit Yahoo Finance to bootstrap cookies
            HttpResponse<String> r1 = httpClient.send(
                HttpRequest.newBuilder()
                    .uri(URI.create(YAHOO_CRUMB_INIT))
                    .header("User-Agent", UA)
                    .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                    .header("Accept-Language", "en-US,en;q=0.9")
                    .GET().build(),
                HttpResponse.BodyHandlers.ofString()
            );
            // Extract cookies to forward explicitly
            String cookies = r1.headers().allValues("set-cookie").stream()
                    .map(h -> h.split(";")[0])
                    .collect(Collectors.joining("; "));
            yahooCookies = cookies.isBlank() ? null : cookies;

            // Step 2: fetch crumb, forwarding cookies explicitly
            HttpRequest.Builder crumbReq = HttpRequest.newBuilder()
                    .uri(URI.create(YAHOO_CRUMB_URL))
                    .header("User-Agent", UA)
                    .header("Accept", "*/*")
                    .header("Referer", "https://finance.yahoo.com/")
                    .GET();
            if (yahooCookies != null) crumbReq.header("Cookie", yahooCookies);

            HttpResponse<String> r2 = httpClient.send(crumbReq.build(),
                    HttpResponse.BodyHandlers.ofString());

            if (r2.statusCode() == 200 && r2.body() != null && !r2.body().isBlank()
                    && !r2.body().contains("Unauthorized")) {
                yahoocrumb = r2.body().trim();
                crumbFetchedAt = System.currentTimeMillis();
                System.out.println("[Yahoo] Crumb obtained: " + yahoocrumb);
                return yahoocrumb;
            }
            System.err.println("[Yahoo] Crumb failed: HTTP " + r2.statusCode() + " — " + r2.body());
        } catch (Exception e) {
            System.err.println("[Yahoo] Crumb error: " + e.getMessage());
        }
        return null;
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
