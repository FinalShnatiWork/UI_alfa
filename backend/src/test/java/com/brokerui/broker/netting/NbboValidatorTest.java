package com.brokerui.broker.netting;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class NbboValidatorTest {
  private static final BigDecimal MID = new BigDecimal("100");
  private final Quote q = new Quote(new BigDecimal("99.985"), MID, new BigDecimal("100.015"), 0L);

  @Test
  void limitsExactlyAtMidAreAccepted() {
    assertNull(NbboValidator.check(q, MID, MID));
  }

  @Test
  void buyerBelowMidIsRejected() {
    assertEquals(NettingTypes.BUY_LIMIT_BELOW_MID, NbboValidator.check(q, new BigDecimal("99.99"), new BigDecimal("99")));
  }

  @Test
  void sellerAboveMidIsRejected() {
    assertEquals(NettingTypes.SELL_LIMIT_ABOVE_MID, NbboValidator.check(q, new BigDecimal("101"), new BigDecimal("100.01")));
  }

  @Test
  void crossedOrFlatMarketIsRejected() {
    Quote crossed = new Quote(new BigDecimal("100.015"), MID, new BigDecimal("99.985"), 0L);
    Quote flat = new Quote(MID, MID, MID, 0L);
    assertEquals(NettingTypes.CROSSED_MARKET, NbboValidator.check(crossed, new BigDecimal("101"), new BigDecimal("99")));
    assertEquals(NettingTypes.CROSSED_MARKET, NbboValidator.check(flat, new BigDecimal("101"), new BigDecimal("99")));
    assertFalse(crossed.valid());
    assertFalse(flat.valid());
  }

  @Test
  void marketOrdersUseAskForBuyersAndBidForSellers() {
    assertEquals(0, NbboValidator.effectiveLimit(q, true, null).compareTo(q.ask()));
    assertEquals(0, NbboValidator.effectiveLimit(q, false, null).compareTo(q.bid()));
    assertEquals(0, NbboValidator.effectiveLimit(q, true, new BigDecimal("100.5")).compareTo(new BigDecimal("100.5")));
  }

  @Test
  void quoteOfUsesThePlatformSpreadOnBothSides() {
    Quote real = Quote.of(new BigDecimal("65000"));
    assertTrue(real.valid());
    assertEquals(0, real.bid().compareTo(new BigDecimal("64990.25000")));
    assertEquals(0, real.ask().compareTo(new BigDecimal("65009.75000")));
    assertFalse(Quote.crossed(new BigDecimal("65000")).valid());
  }
}
