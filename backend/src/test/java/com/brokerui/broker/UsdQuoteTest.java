package com.brokerui.broker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import java.util.Map;
import org.junit.jupiter.api.Test;

class UsdQuoteTest {

  @Test
  void eurusdStaysInDollars() {
    BigDecimal pnl = UsdQuote.toUsd("EURUSD", new BigDecimal("1000"), code -> null);
    assertEquals(0, pnl.compareTo(new BigDecimal("1000")));
  }

  @Test
  void oneYenOnAFullLotIsAboutSixHundredSixtyDollars() {
    Position pos = new Position();
    pos.setSymbolCode("USDJPY");
    pos.setSide("LONG");
    pos.setQuantity(BigDecimal.ONE);
    pos.setAvgPrice(new BigDecimal("150"));
    TradingAccount ta = new TradingAccount();
    ta.setLeverage(100);

    PositionCloseMath.Snapshot s = PositionCloseMath.atFillPrice(
        pos, ta, new BigDecimal("151"), false, Map.of("USDJPY", new BigDecimal("151"))::get);

    // 100,000 yen / 151 ≈ 662.25 dollars, not 100,000 dollars.
    assertEquals(0, s.grossPnl().setScale(2, java.math.RoundingMode.HALF_UP).compareTo(new BigDecimal("662.25")));
    // Margin was reserved at the entry rate: 15,000,000 yen / 150 / 100 = 1,000 dollars.
    assertEquals(0, s.marginReturned().compareTo(new BigDecimal("1000.0000")));
  }

  @Test
  void kroneProfitUsesTheLiveEuroPrices() {
    BigDecimal nok = new BigDecimal("1000");
    BigDecimal usd = UsdQuote.toUsd("EURNOK", nok, Map.of(
        "EURUSD", new BigDecimal("1.10"),
        "EURNOK", new BigDecimal("11.00"))::get);
    assertEquals(0, usd.compareTo(new BigDecimal("100.00000000")));
  }

  @Test
  void missingYenRateDoesNotInventDollars() {
    assertNull(UsdQuote.toUsd("GBPJPY", new BigDecimal("100000"), code -> null));
    Position pos = new Position();
    pos.setSymbolCode("GBPJPY");
    pos.setSide("LONG");
    pos.setQuantity(BigDecimal.ONE);
    pos.setAvgPrice(new BigDecimal("190"));
    TradingAccount ta = new TradingAccount();
    ta.setLeverage(100);
    assertThrows(IllegalStateException.class,
        () -> PositionCloseMath.atFillPrice(pos, ta, new BigDecimal("191"), false, code -> null));
  }
}
