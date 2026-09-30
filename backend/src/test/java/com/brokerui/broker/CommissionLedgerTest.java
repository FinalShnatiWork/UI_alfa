package com.brokerui.broker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class CommissionLedgerTest {

  @Test
  void writesTheSameAmountOnTheOrderTheAccountAndThePosting() {
    AccountTransactionRepository repo = mock(AccountTransactionRepository.class);
    CommissionLedger ledger = new CommissionLedger(repo);

    TradingAccount ta = new TradingAccount();
    ta.setCommissionPaidTotal(new BigDecimal("3.00"));
    ta.setBalance(new BigDecimal("100"));
    ta.setCurrency("USD");

    BrokerOrder order = new BrokerOrder();
    order.setSymbolCode("EURUSD");
    order.setSide("BUY");
    order.setCommission(new BigDecimal("7.00"));

    ledger.record(ta, order, new BigDecimal("7.00"), true);

    assertEquals(0, order.getCommission().compareTo(new BigDecimal("14.00")));
    assertEquals(0, ta.getCommissionPaidTotal().compareTo(new BigDecimal("10.00")));

    ArgumentCaptor<AccountTransaction> saved = ArgumentCaptor.forClass(AccountTransaction.class);
    verify(repo).save(saved.capture());
    assertEquals("COMMISSION", saved.getValue().getTxType());
    assertEquals(0, saved.getValue().getAmount().compareTo(new BigDecimal("7.00")));
    assertEquals("APPROVED", saved.getValue().getStatus());
  }

  @Test
  void zeroChargeDoesNotPostOrMoveTheCounter() {
    AccountTransactionRepository repo = mock(AccountTransactionRepository.class);
    CommissionLedger ledger = new CommissionLedger(repo);

    TradingAccount ta = new TradingAccount();
    ta.setCommissionPaidTotal(new BigDecimal("3.00"));
    BrokerOrder order = new BrokerOrder();
    order.setSymbolCode("EURUSD");
    order.setSide("SELL");

    ledger.record(ta, order, BigDecimal.ZERO);

    assertEquals(0, order.getCommission().compareTo(BigDecimal.ZERO));
    assertEquals(0, ta.getCommissionPaidTotal().compareTo(new BigDecimal("3.00")));
    verify(repo, org.mockito.Mockito.never()).save(org.mockito.ArgumentMatchers.any());
  }
}
