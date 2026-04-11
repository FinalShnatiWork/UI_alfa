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
    String sym = symbolCode == null ? "" : symbolCode.trim().toUpperCase();
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
}

