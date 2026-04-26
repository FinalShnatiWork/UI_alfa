package com.brokerui.market;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class YahooFinanceService {
    private static final String QUOTE_BASE = "https://query1.finance.yahoo.com/v7/finance/quote";
    private static final String CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

    private final RestClient http;
    private final ObjectMapper objectMapper;

    public YahooFinanceService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.http = RestClient.builder().build();
    }

    public double getLivePrice(String uiSymbol) throws JsonProcessingException {
        String yahooSymbol = mapSymbol(uiSymbol);
        String url = QUOTE_BASE + "?symbols=" + URLEncoder.encode(yahooSymbol, StandardCharsets.UTF_8);

        String json = http.get().uri(url).retrieve().body(String.class);
        JsonNode root = objectMapper.readTree(json);
        JsonNode result = root.path("quoteResponse").path("result");
        if (result.isArray() && !result.isEmpty()) {
            return result.get(0).path("regularMarketPrice").asDouble(0.0);
        }
        return 0.0;
    }

    public List<CandleBar> getCandles(String uiSymbol, String intervalKey) throws JsonProcessingException {
        String yahooSymbol = mapSymbol(uiSymbol);
        String interval = mapInterval(intervalKey);
        String range = mapRangeForInterval(intervalKey);

        String url = CHART_BASE + "/" + URLEncoder.encode(yahooSymbol, StandardCharsets.UTF_8)
                + "?interval=" + interval + "&range=" + range;

        String json = http.get().uri(url).retrieve().body(String.class);
        JsonNode root = objectMapper.readTree(json);
        JsonNode result = root.path("chart").path("result");
        if (!result.isArray() || result.isEmpty()) {
            return List.of();
        }

        JsonNode data = result.get(0);
        JsonNode timestamps = data.path("timestamp");
        JsonNode indicators = data.path("indicators").path("quote").get(0);
        
        if (timestamps.isMissingNode() || indicators.isMissingNode()) {
            return List.of();
        }

        JsonNode opens = indicators.path("open");
        JsonNode highs = indicators.path("high");
        JsonNode lows = indicators.path("low");
        JsonNode closes = indicators.path("close");

        int size = timestamps.size();
        List<CandleBar> candles = new ArrayList<>(size);
        for (int i = 0; i < size; i++) {
            // Yahoo sometimes returns nulls in the middle of data
            if (opens.get(i).isNull() || highs.get(i).isNull() || lows.get(i).isNull() || closes.get(i).isNull()) {
                continue;
            }
            candles.add(new CandleBar(
                    timestamps.get(i).asLong(),
                    opens.get(i).asDouble(),
                    highs.get(i).asDouble(),
                    lows.get(i).asDouble(),
                    closes.get(i).asDouble()
            ));
        }
        return candles;
    }

    private String mapSymbol(String uiSymbol) {
        String s = uiSymbol.trim().toUpperCase();
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
            case "XPTUSD" -> "PL=F";
            default -> s.contains("=") ? s : s + "=X"; // Fallback for other FX
        };
    }

    private String mapInterval(String intervalKey) {
        return switch (intervalKey) {
            case "1m" -> "1m";
            case "5m" -> "5m";
            case "15m" -> "15m";
            case "30m" -> "30m";
            case "1h" -> "1h";
            case "4h" -> "1h"; // Yahoo doesn't have 4h in some regions, 1h is safer or we can try 1h and aggregate
            case "1d" -> "1d";
            case "1w" -> "1wk";
            case "1M" -> "1mo";
            default -> "1h";
        };
    }

    private String mapRangeForInterval(String intervalKey) {
        return switch (intervalKey) {
            case "1m" -> "1d";
            case "5m" -> "5d";
            case "15m" -> "5d";
            case "30m" -> "5d";
            case "1h" -> "1mo";
            case "4h" -> "3mo";
            case "1d" -> "1y";
            case "1w" -> "5y";
            case "1M" -> "max";
            default -> "1mo";
        };
    }
}
