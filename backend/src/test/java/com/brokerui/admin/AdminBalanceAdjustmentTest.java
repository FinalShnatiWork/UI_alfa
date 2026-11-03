package com.brokerui.admin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.brokerui.broker.AccountTransaction;
import com.brokerui.broker.AccountTransactionRepository;
import com.brokerui.broker.AuditLogRepository;
import com.brokerui.broker.AuditLogService;
import com.brokerui.broker.BrokerOrderRepository;
import com.brokerui.broker.MT5ConnectionManager;
import com.brokerui.broker.MarginLoanLedgerRepository;
import com.brokerui.broker.MarginLoanService;
import com.brokerui.broker.PositionRepository;
import com.brokerui.broker.TradingAccount;
import com.brokerui.broker.TradingAccountRepository;
import com.brokerui.market.MarketPriceService;
import com.brokerui.user.AppUserRepository;
import java.math.BigDecimal;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** Setting a balance in the admin panel leaves a row in the account history. */
class AdminBalanceAdjustmentTest {

  private AccountTransactionRepository txRepo;
  private AdminTradeController controller;
  private TradingAccount ta;

  @BeforeEach
  void setUp() {
    TradingAccountRepository accountRepo = mock(TradingAccountRepository.class);
    txRepo = mock(AccountTransactionRepository.class);
    controller = new AdminTradeController(mock(BrokerOrderRepository.class), mock(PositionRepository.class),
        accountRepo, txRepo, mock(AuditLogRepository.class), mock(MT5ConnectionManager.class),
        mock(MarginLoanLedgerRepository.class), mock(MarginLoanService.class), mock(AuditLogService.class),
        mock(AppUserRepository.class), mock(MarketPriceService.class));
    ta = new TradingAccount();
    ta.setId(5L);
    ta.setBalance(new BigDecimal("1000.00"));
    ta.setCurrency("USD");
    when(accountRepo.findByIdForUpdate(5L)).thenReturn(Optional.of(ta));
  }

  @Test
  void changedBalanceWritesAnAdjustmentRow() {
    controller.updateBalance(5L, new AdminTradeController.UpdateBalanceRequest(new BigDecimal("750.00")), null, null);

    ArgumentCaptor<AccountTransaction> row = ArgumentCaptor.forClass(AccountTransaction.class);
    verify(txRepo).save(row.capture());
    assertEquals("ADJUSTMENT", row.getValue().getTxType());
    assertEquals("APPROVED", row.getValue().getStatus());
    assertEquals(0, row.getValue().getAmount().compareTo(new BigDecimal("-250.00")));
    assertEquals(0, ta.getBalance().compareTo(new BigDecimal("750.00")));
  }

  @Test
  void sameBalanceWritesNothing() {
    controller.updateBalance(5L, new AdminTradeController.UpdateBalanceRequest(new BigDecimal("1000")), null, null);
    verify(txRepo, never()).save(any());
  }
}
