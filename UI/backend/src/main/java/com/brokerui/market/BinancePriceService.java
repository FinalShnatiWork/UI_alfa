package com.brokerui.market;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.http.client.SimpleClientHttpRequestFactory;

@Service
public class BinancePriceService {
  private static final String BASE = "https://api.binance.com";

  private final RestClient http;
  private final ObjectMapper objectMapper;

  public BinancePriceService(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
    SimpleClientHttpRequestFactory rf = new SimpleClientHttpRequestFactory();
    rf.setConnectTimeout(3000);
    rf.setReadTimeout(4000);
    this.http =
        RestClient.builder()
            .baseUrl(BASE)
            .requestFactory(rf)
            .build();
  }

  public BigDecimal getLastPrice(String symbolCode) {
    String rawSym = symbolCode == null ? "" : symbolCode.trim().toUpperCase();
    String sym = mapToBinanceSymbol(rawSym);
    if (sym.isEmpty()) {
      throw new IllegalArgumentException("symbol");
    }

    try {
      String raw =
          http.get()
              .uri("/api/v3/ticker/price?symbol={symbol}", sym)
              .retrieve()
              .body(String.class);
      JsonNode node = objectMapper.readTree(raw == null ? "{}" : raw);
      String p = node.path("price").asText("");
      if (p.isBlank()) {
        throw new IllegalStateException("price_unavailable");
      }
      return new BigDecimal(p);
    } catch (RestClientException e) {
      throw new IllegalStateException("price_unavailable", e);
    } catch (Exception e) {
      throw new IllegalStateException("price_unavailable", e);
    }
  }

  /**
   * UI/back-end use broker-style codes like BTCUSD, EURUSD.
   * Binance expects exchange symbols like BTCUSDT, EURUSDT, XAUTUSDT.
   * For some FX pairs, we use USDT proxies to keep demo realtime quotes.
   */
  private static String mapToBinanceSymbol(String symbol) {
    String s = symbol == null ? "" : symbol.trim().toUpperCase();
    if (s.isEmpty()) return "";

    // Crypto (USD -> USDT)
    if (s.equals("BTCUSD")) return "BTCUSDT";
    if (s.equals("ETHUSD")) return "ETHUSDT";
    if (s.equals("SOLUSD")) return "SOLUSDT";
    if (s.equals("XRPUSD")) return "XRPUSDT";

    // FX proxies
    if (s.equals("EURUSD")) return "EURUSDT";
    if (s.equals("GBPUSD")) return "GBPUSDT";
    if (s.equals("USDCAD")) return "USDCUSDT"; // proxy
    if (s.equals("NZDUSD")) return "NZDUSDT";
    if (s.equals("EURNOK")) return "EURNOK"; // no good proxy; let it fail if unavailable
    if (s.equals("USDJPY")) return "JPYUSDT"; // inverted proxy
    if (s.equals("GBPJPY")) return "GBPJPY"; // no proxy; let it fail if unavailable
    if (s.equals("CADJPY")) return "CADJPY"; // no proxy; let it fail if unavailable

    // Metals proxies
    if (s.equals("XAUUSD")) return "XAUTUSDT"; // Tether Gold proxy
    if (s.equals("XAGUSD")) return "XAGUSDT"; // try; may or may not exist

    // Heuristic: treat XXXUSD as XXXUSDT
    if (s.endsWith("USD") && s.length() >= 6) {
      return s.substring(0, s.length() - 3) + "USDT";
    }
    return s;
  }
}

