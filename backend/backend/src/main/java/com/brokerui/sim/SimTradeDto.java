package com.brokerui.sim;

import java.time.Instant;

public record SimTradeDto(Long id, String symbol, int quantity, String buyerLabel, Instant createdAt) {
  public static SimTradeDto from(SimTrade t) {
    return new SimTradeDto(
        t.getId(), t.getSymbol(), t.getQuantity(), t.getBuyerLabel(), t.getCreatedAt());
  }
}
