package com.brokerui.broker;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

class LiveUnrealizedPnlTest {

  @Test
  void longUsesCloseMinusEntry() {
    Position p = new Position();
    p.setSymbolCode("EURUSD");
    p.setSide("LONG");
    p.setQuantity(new BigDecimal("1.00"));
    p.setAvgPrice(new BigDecimal("1.1000"));

    BigDecimal pnl = BrokerApiController.liveUnrealizedPnl(p, new BigDecimal("1.1100"));
    // contract size for FX is typically 100000 → 0.01 * 1 * 100000 = 1000
    BigDecimal cs = BrokerApiController.getContractSize("EURUSD");
    BigDecimal expected = new BigDecimal("0.0100").multiply(new BigDecimal("1.00")).multiply(cs);
    assertEquals(0, pnl.compareTo(expected));
  }

  @Test
  void shortUsesEntryMinusClose() {
    Position p = new Position();
    p.setSymbolCode("EURUSD");
    p.setSide("SHORT");
    p.setQuantity(new BigDecimal("1.00"));
    p.setAvgPrice(new BigDecimal("1.1000"));

    BigDecimal pnl = BrokerApiController.liveUnrealizedPnl(p, new BigDecimal("1.0900"));
    BigDecimal cs = BrokerApiController.getContractSize("EURUSD");
    BigDecimal expected = new BigDecimal("0.0100").multiply(new BigDecimal("1.00")).multiply(cs);
    assertEquals(0, pnl.compareTo(expected));
  }
}
