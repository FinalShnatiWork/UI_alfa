package com.brokerui.broker;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

class TradingFeesProfitGuardTest {

  @Test
  void doesNotReduceCloseFeeOnLoss() {
    BigDecimal close = TradingFees.applyProfitSafetyGuard(
        new BigDecimal("1.00"), new BigDecimal("1.00"), new BigDecimal("-5.00"));
    assertEquals(0, close.compareTo(new BigDecimal("1.00")));
  }

  @Test
  void capsTotalFeesToTwentyPercentOfGrossProfit() {
    // open 2 + close 2 = 4, max = 20% of 10 = 2 → close reduced to 0
    BigDecimal close = TradingFees.applyProfitSafetyGuard(
        new BigDecimal("2.00"), new BigDecimal("2.00"), new BigDecimal("10.00"));
    assertEquals(0, close.compareTo(BigDecimal.ZERO));
  }

  @Test
  void reducesCloseOnlyWhenOpenAlreadyNearCap() {
    // open 1.50 + close 1.00 = 2.50, max = 20% of 10 = 2 → close = 0.50
    BigDecimal close = TradingFees.applyProfitSafetyGuard(
        new BigDecimal("1.50"), new BigDecimal("1.00"), new BigDecimal("10.00"));
    assertEquals(0, close.compareTo(new BigDecimal("0.50")));
  }

  @Test
  void doesNotCutCloseBelowVenueFee() {
    // open 2 + close 2, profit 10, the 20% cap would zero the close; the venue still costs 1
    BigDecimal close = TradingFees.applyProfitSafetyGuard(
        new BigDecimal("2.00"), new BigDecimal("2.00"), new BigDecimal("10.00"),
        new BigDecimal("1.00"));
    assertEquals(0, close.compareTo(new BigDecimal("1.00")));
  }

  @Test
  void venueFloorCannotExceedTheTariff() {
    BigDecimal close = TradingFees.applyProfitSafetyGuard(
        new BigDecimal("2.00"), new BigDecimal("2.00"), new BigDecimal("10.00"),
        new BigDecimal("9.00"));
    assertEquals(0, close.compareTo(new BigDecimal("2.00")));
  }

  @Test
  void leavesCloseUnchangedWhenUnderCap() {
    BigDecimal close = TradingFees.applyProfitSafetyGuard(
        new BigDecimal("0.50"), new BigDecimal("0.50"), new BigDecimal("10.00"));
    assertEquals(0, close.compareTo(new BigDecimal("0.50")));
  }
}
