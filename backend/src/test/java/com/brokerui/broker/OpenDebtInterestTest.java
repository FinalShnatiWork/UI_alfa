package com.brokerui.broker;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class OpenDebtInterestTest {

  @Test
  void closedEpisodeDoesNotKeepItsInterest() {
    List<MarginLoanLedger> rows = List.of(
        row("BORROW", "1000", "1000"),
        row("INTEREST", "5", "1005"),
        row("REPAY", "1005", "0"),
        row("BORROW", "200", "200"));
    assertEquals(0, MarginLoanService.interestSinceDebtOpened(rows).compareTo(BigDecimal.ZERO));
  }

  @Test
  void countsOnlyInterestAfterTheDebtReopened() {
    List<MarginLoanLedger> rows = List.of(
        row("BORROW", "1000", "1000"),
        row("INTEREST", "5", "1005"),
        row("REPAY", "1005", "0"),
        row("BORROW", "200", "200"),
        row("INTEREST", "1", "201"),
        row("INTEREST", "1.01", "202.01"));
    assertEquals(0, MarginLoanService.interestSinceDebtOpened(rows).compareTo(new BigDecimal("2.01")));
  }

  private static MarginLoanLedger row(String type, String amount, String after) {
    MarginLoanLedger entry = new MarginLoanLedger();
    entry.setEntryType(type);
    entry.setAmount(new BigDecimal(amount));
    entry.setBorrowedAfter(new BigDecimal(after));
    return entry;
  }
}
