package com.brokerui.broker;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

class StopsValidationTest {
  private static final BigDecimal PRICE = new BigDecimal("1.10000");

  private static BigDecimal bd(String v) {
    return new BigDecimal(v);
  }

  @Test
  void emptyStopsAreAllowed() {
    assertTrue(BrokerApiController.stopsValid(true, PRICE, null, null));
    assertTrue(BrokerApiController.stopsValid(false, PRICE, null, null));
  }

  @Test
  void buyNeedsStopBelowAndTargetAbove() {
    assertTrue(BrokerApiController.stopsValid(true, PRICE, bd("1.09"), bd("1.11")));
    assertFalse(BrokerApiController.stopsValid(true, PRICE, bd("1.11"), null));
    assertFalse(BrokerApiController.stopsValid(true, PRICE, null, bd("1.09")));
    assertFalse(BrokerApiController.stopsValid(true, PRICE, PRICE, null));
  }

  @Test
  void sellNeedsStopAboveAndTargetBelow() {
    assertTrue(BrokerApiController.stopsValid(false, PRICE, bd("1.11"), bd("1.09")));
    assertFalse(BrokerApiController.stopsValid(false, PRICE, bd("1.09"), null));
    assertFalse(BrokerApiController.stopsValid(false, PRICE, null, bd("1.11")));
  }

  @Test
  void zeroOrNegativeIsRejected() {
    assertFalse(BrokerApiController.stopsValid(true, PRICE, BigDecimal.ZERO, null));
    assertFalse(BrokerApiController.stopsValid(false, PRICE, null, bd("-1")));
  }
}
