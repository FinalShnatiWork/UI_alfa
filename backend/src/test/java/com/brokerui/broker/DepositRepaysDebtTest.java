package com.brokerui.broker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.brokerui.market.MarketPriceService;
import java.math.BigDecimal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class DepositRepaysDebtTest {

  private MarginLoanLedgerRepository ledgerRepo;
  private MarginLoanService service;

  @BeforeEach
  void setUp() {
    ledgerRepo = mock(MarginLoanLedgerRepository.class);
    service = new MarginLoanService(
        mock(TradingAccountRepository.class),
        mock(PositionRepository.class),
        mock(BrokerOrderRepository.class),
        ledgerRepo,
        mock(NotificationRepository.class),
        new CommissionLedger(mock(AccountTransactionRepository.class)),
        mock(MarketPriceService.class),
        mock(AuditLogService.class));
  }

  @Test
  void depositPaysDebtFirstAndLeavesTheRemainderAsCash() {
    TradingAccount ta = account(new BigDecimal("100.00"), new BigDecimal("1500.00"));

    service.repaySettlementOrBorrow(ta, new BigDecimal("2000.00"), "Repaid from deposit");

    assertEquals(0, ta.getBorrowedBalance().compareTo(BigDecimal.ZERO));
    assertEquals(0, ta.getBalance().compareTo(new BigDecimal("600.00")));
    ArgumentCaptor<MarginLoanLedger> saved = ArgumentCaptor.forClass(MarginLoanLedger.class);
    verify(ledgerRepo).save(saved.capture());
    assertEquals("REPAY", saved.getValue().getEntryType());
    assertEquals(0, saved.getValue().getAmount().compareTo(new BigDecimal("1500.00")));
    assertEquals(0, saved.getValue().getBorrowedAfter().compareTo(BigDecimal.ZERO));
    assertEquals("Repaid from deposit", saved.getValue().getNote());
  }

  @Test
  void depositSmallerThanDebtDoesNotIncreaseCash() {
    TradingAccount ta = account(new BigDecimal("100.00"), new BigDecimal("1500.00"));

    service.repaySettlementOrBorrow(ta, new BigDecimal("400.00"), "Repaid from deposit");

    assertEquals(0, ta.getBorrowedBalance().compareTo(new BigDecimal("1100.00")));
    assertEquals(0, ta.getBalance().compareTo(new BigDecimal("100.00")));
  }

  @Test
  void depositWithNoDebtBecomesCash() {
    TradingAccount ta = account(new BigDecimal("100.00"), BigDecimal.ZERO);

    service.repaySettlementOrBorrow(ta, new BigDecimal("2000.00"), "Repaid from deposit");

    assertEquals(0, ta.getBorrowedBalance().compareTo(BigDecimal.ZERO));
    assertEquals(0, ta.getBalance().compareTo(new BigDecimal("2100.00")));
  }

  private static TradingAccount account(BigDecimal balance, BigDecimal debt) {
    TradingAccount ta = new TradingAccount();
    ta.setBalance(balance);
    ta.setBorrowedBalance(debt);
    return ta;
  }
}
