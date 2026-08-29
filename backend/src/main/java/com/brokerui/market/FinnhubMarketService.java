package com.brokerui.market;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * Service to retrieve market data, quotes, and klines/candles from the Finnhub REST API.
 * Primarily handles US stock, forex, and precious metals via OANDA integration.
 */
@Service
public class FinnhubMarketService {
  private static final String BASE = "https://finnhub.io/api/v1";

  private final RestClient http;
  private final ObjectMapper objectMapper;
  private final String apiKey;

  /**
   * Constructs the FinnhubMarketService with ObjectMapper and configured API key.
   *
   * @param objectMapper Jackson JSON object mapper
   * @param apiKey the Finnhub API token
   */
  public FinnhubMarketService(
      ObjectMapper objectMapper,
      @Value("${broker.market.finnhub-api-key:}") String apiKey) {
    this.objectMapper = objectMapper;
    this.apiKey = apiKey == null ? "" : apiKey.trim();
    this.http = RestClient.builder().baseUrl(BASE).build();
  }

  /**
   * Checks if the Finnhub API integration is active and has a configured API key.
   *
   * @return true if an API key is configured, false otherwise
   */
  public boolean isConfigured() {
    return !apiKey.isEmpty();
  }

  /**
   * Retrieves historical stock candle bars for a US Stock.
   * The goal of this method is to return a list of stock CandleBars.
   *
   * @param symbol US stock symbol (e.g. AAPL)
   * @param intervalKey chart interval code (e.g. 1m, 1h, 1d)
   * @return a list of historical CandleBars
   * @throws JsonProcessingException if json string parsing fails
   */
  public List<CandleBar> usStockCandles(String symbol, String intervalKey)
      throws JsonProcessingException {
    if (!isConfigured()) {
      throw new IllegalStateException("finnhub_not_configured");
    }
    String sym = symbol == null ? "" : symbol.trim().toUpperCase();
    if (sym.isEmpty()) {
      throw new IllegalArgumentException("symbol");
    }

    return finnhubCandles("/stock/candle", sym, intervalKey);
  }

  /**
   * Forex candles via Finnhub (OANDA symbols, e.g. OANDA:EUR_USD).
   * The goal of this method is to fetch and return forex CandleBars.
   *
   * @param symbol internal system forex symbol code (e.g. EURUSD)
   * @param intervalKey chart interval code (e.g. 1h, 1d)
   * @return a list of historical CandleBars
   * @throws JsonProcessingException if response json processing fails
   */
  public List<CandleBar> forexCandles(String symbol, String intervalKey)
      throws JsonProcessingException {
    if (symbol == null || symbol.isBlank()) {
      throw new IllegalArgumentException("symbol");
    }
    String mapped = mapForexSymbol(symbol);
    return finnhubCandles("/forex/candle", mapped, intervalKey);
  }

  /**
   * Metals candles via Finnhub (OANDA symbols, e.g. OANDA:XAU_USD).
   * The goal of this method is to fetch and return precious metals CandleBars.
   *
   * @param symbol internal system precious metals symbol code (e.g. XAUUSD)
   * @param intervalKey chart interval code (e.g. 1h, 1d)
   * @return a list of historical CandleBars
   * @throws JsonProcessingException if response json processing fails
   */
  public List<CandleBar> metalsCandles(String symbol, String intervalKey)
      throws JsonProcessingException {
    if (symbol == null || symbol.isBlank()) {
      throw new IllegalArgumentException("symbol");
    }
    String mapped = mapMetalsSymbol(symbol);
    return finnhubCandles("/forex/candle", mapped, intervalKey);
  }

  /**
   * Quote (last price) for Forex/Metals via Finnhub using OANDA symbols.
   * The goal of this method is to retrieve and return the latest market bid-ask price.
   *
   * @param uiSymbol the symbol code (e.g. EURUSD, XAUUSD)
   * @return the last price as a double
   * @throws JsonProcessingException if response json processing fails
   */
  public double oandaQuote(String uiSymbol) throws JsonProcessingException {
    if (!isConfigured()) {
      throw new IllegalStateException("finnhub_not_configured");
    }
    if (uiSymbol == null || uiSymbol.isBlank()) {
      throw new IllegalArgumentException("symbol");
    }
    String s = uiSymbol.trim().toUpperCase();
    String mapped;
    if (s.startsWith("XAU") || s.startsWith("XAG") || s.startsWith("XPT")) {
      mapped = mapMetalsSymbol(s);
    } else {
      mapped = mapForexSymbol(s);
    }

    String path =
        "/quote?symbol="
            + URLEncoder.encode(mapped, StandardCharsets.UTF_8)
            + "&token="
            + URLEncoder.encode(apiKey, StandardCharsets.UTF_8);
    String json = http.get().uri(path).retrieve().body(String.class);
    JsonNode root = objectMapper.readTree(json == null ? "{}" : json);
    // Finnhub: {"c": current, ...}
    return root.path("c").asDouble(0.0);
  }

  private List<CandleBar> finnhubCandles(String endpoint, String finnhubSymbol, String intervalKey)
      throws JsonProcessingException {
    if (!isConfigured()) {
      throw new IllegalStateException("finnhub_not_configured");
    }
    String sym = finnhubSymbol == null ? "" : finnhubSymbol.trim();
    if (sym.isEmpty()) {
      throw new IllegalArgumentException("symbol");
    }

    String resolution = mapResolution(intervalKey);
    long to = Instant.now().getEpochSecond();
    long from = to - lookbackSeconds(resolution);

    String path =
        endpoint
            + "?symbol="
            + URLEncoder.encode(sym, StandardCharsets.UTF_8)
            + "&resolution="
            + resolution
            + "&from="
            + from
            + "&to="
            + to
            + "&token="
            + URLEncoder.encode(apiKey, StandardCharsets.UTF_8);

    String json = http.get().uri(path).retrieve().body(String.class);
    JsonNode root = objectMapper.readTree(json);
    if (!root.has("s") || !"ok".equalsIgnoreCase(root.get("s").asText())) {
      return List.of();
    }
    JsonNode ta = root.get("t");
    if (ta == null || !ta.isArray() || ta.isEmpty()) {
      return List.of();
    }
    JsonNode o = root.get("o");
    JsonNode h = root.get("h");
    JsonNode l = root.get("l");
    JsonNode c = root.get("c");
    List<CandleBar> out = new ArrayList<>(ta.size());
    for (int i = 0; i < ta.size(); i++) {
      out.add(
          new CandleBar(
              ta.get(i).asLong(),
              o.get(i).asDouble(),
              h.get(i).asDouble(),
              l.get(i).asDouble(),
              c.get(i).asDouble()));
    }
    return out;
  }

  private static String mapForexSymbol(String uiSymbol) {
    String s = uiSymbol.trim().toUpperCase();
    return switch (s) {
      case "EURUSD" -> "OANDA:EUR_USD";
      case "GBPUSD" -> "OANDA:GBP_USD";
      case "USDJPY" -> "OANDA:USD_JPY";
      case "USDCAD" -> "OANDA:USD_CAD";
      case "NZDUSD" -> "OANDA:NZD_USD";
      case "EURNOK" -> "OANDA:EUR_NOK";
      case "GBPJPY" -> "OANDA:GBP_JPY";
      case "CADJPY" -> "OANDA:CAD_JPY";
      default -> throw new IllegalArgumentException("unsupported_symbol");
    };
  }

  private static String mapMetalsSymbol(String uiSymbol) {
    String s = uiSymbol.trim().toUpperCase();
    return switch (s) {
      case "XAUUSD" -> "OANDA:XAU_USD";
      case "XAGUSD" -> "OANDA:XAG_USD";
      default -> throw new IllegalArgumentException("unsupported_symbol");
    };
  }

  private static String mapResolution(String intervalKey) {
    if (intervalKey == null) {
      return "60";
    }
    return switch (intervalKey) {
      case "1m" -> "1";
      case "5m" -> "5";
      case "1h" -> "60";
      case "4h" -> "60";
      case "1d" -> "D";
      case "1w" -> "W";
      case "1M" -> "M";
      default -> "60";
    };
  }

  private static long lookbackSeconds(String resolution) {
    int bars = 500;
    return switch (resolution) {
      case "1" -> bars * 60L;
      case "5" -> bars * 300L;
      case "60" -> bars * 3600L;
      case "D" -> bars * 86400L;
      case "W" -> bars * 7L * 86400L;
      case "M" -> bars * 30L * 86400L;
      default -> bars * 3600L;
    };
  }
}
