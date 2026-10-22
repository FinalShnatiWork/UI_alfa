package com.brokerui.broker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * The website copies the client commission by hand. One forex order and one crypto
 * order must cost the same amount from both copies.
 */
class ClientCommissionParityTest {

  @Test
  void websiteScheduleMatchesTheServerOnOneOrderOfEachKind() throws Exception {
    String ts = Files.readString(Path.of("..", "UI-react", "src", "lib", "tradeUtils.ts"));
    BigDecimal perLot = number(ts, "COMMISSION_PER_LOT");
    BigDecimal cryptoRate = number(ts, "CRYPTO_COMMISSION_RATE");

    BigDecimal lots = BigDecimal.ONE;
    BigDecimal fxPrice = new BigDecimal("1.10");
    BigDecimal javaFx = TradingFees.calculateCommission("EURUSD", lots, fxPrice);
    assertEquals(0, javaFx.compareTo(lots.multiply(perLot).setScale(2, java.math.RoundingMode.HALF_UP)));

    BigDecimal btcLots = new BigDecimal("0.1");
    BigDecimal btcPrice = new BigDecimal("60000");
    BigDecimal notional = btcPrice.multiply(btcLots).multiply(ContractSpecs.getContractSize("BTCUSD"));
    BigDecimal javaBtc = TradingFees.calculateCommission("BTCUSD", btcLots, btcPrice);
    assertEquals(0, javaBtc.compareTo(notional.multiply(cryptoRate).setScale(2, java.math.RoundingMode.HALF_UP)));
    assertEquals(0, javaFx.compareTo(new BigDecimal("7.00")));
    assertEquals(0, javaBtc.compareTo(new BigDecimal("12.00")));
  }

  private static BigDecimal number(String source, String name) {
    Matcher m = Pattern.compile(name + " = ([0-9.]+)").matcher(source);
    assertTrue(m.find(), name);
    return new BigDecimal(m.group(1));
  }
}
