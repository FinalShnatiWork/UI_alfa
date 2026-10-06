package com.brokerui.broker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.brokerui.broker.netting.FillBooking;
import com.brokerui.market.MarketPriceService;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Credit-line bookkeeping, volume rules, close reasons and the per-fill reserve share. */
class MoneyHelpersTest {

  private MarginLoanLedgerRepository ledgerRepo;
  private MarginLoanService loans;

  @BeforeEach
  void setUp() {
    ledgerRepo = mock(MarginLoanLedgerRepository.class);
    loans = new MarginLoanService(
        mock(TradingAccountRepository.class), mock(PositionRepository.class), mock(BrokerOrderRepository.class),
        ledgerRepo, mock(NotificationRepository.class),
        new CommissionLedger(mock(AccountTransactionRepository.class)),
        mock(MarketPriceService.class), mock(AuditLogService.class));
  }

  private static TradingAccount indebted(String balance, String debt) {
    TradingAccount ta = new TradingAccount();
    ta.setBalance(new BigDecimal(balance));
    ta.setBorrowedBalance(new BigDecimal(debt));
    ta.setCreditLimit(new BigDecimal("10000"));
    ta.setLastInterestAt(Instant.now().minus(7, ChronoUnit.DAYS));
    return ta;
  }

  @Test
  void fullRepaymentStopsTheInterestClock() {
    TradingAccount ta = indebted("0", "500");
    loans.repaySettlementOrBorrow(ta, new BigDecimal("600"));
    assertEquals(0, ta.getBorrowedBalance().signum());
    assertNull(ta.getLastInterestAt());
  }

  @Test
  void partialRepaymentKeepsTheInterestClock() {
    TradingAccount ta = indebted("0", "500");
    Instant before = ta.getLastInterestAt();
    loans.repaySettlementOrBorrow(ta, new BigDecimal("100"));
    assertEquals(before, ta.getLastInterestAt());
  }

  @Test
  void newDebtAfterRepaymentStartsAFreshClock() {
    TradingAccount ta = indebted("0", "500");
    loans.repaySettlementOrBorrow(ta, new BigDecimal("500"));
    assertTrue(loans.tryCoverShortfall(ta, new BigDecimal("50"), null, null));
    assertNotNull(ta.getLastInterestAt());
    assertTrue(ta.getLastInterestAt().isAfter(Instant.now().minus(1, ChronoUnit.MINUTES)),
        "a week-old timestamp would charge interest on the new debt immediately");
  }

  @Test
  void failedLedgerWriteFailsTheWholeOperation() {
    when(ledgerRepo.save(any())).thenThrow(new RuntimeException("db down"));
    TradingAccount ta = indebted("0", "500");
    assertThrows(RuntimeException.class, () -> loans.repaySettlementOrBorrow(ta, new BigDecimal("100")));
  }

  @Test
  void volumeRules() {
    assertNull(ContractSpecs.volumeError(new BigDecimal("0.01")));
    assertNull(ContractSpecs.volumeError(new BigDecimal("100")));
    assertNull(ContractSpecs.volumeError(new BigDecimal("1.50")));
    assertEquals("volume_out_of_range", ContractSpecs.volumeError(new BigDecimal("0.009")));
    assertEquals("volume_out_of_range", ContractSpecs.volumeError(new BigDecimal("1000000")));
    assertEquals("volume_step", ContractSpecs.volumeError(new BigDecimal("0.123")));
    assertEquals("invalid_quantity", ContractSpecs.volumeError(BigDecimal.ZERO));
  }

  @Test
  void onlyTheFourteenListedInstrumentsAreTradable() {
    assertEquals(14, ContractSpecs.TRADABLE.size());
    assertTrue(ContractSpecs.isTradable("btcusd"));
    assertFalse(ContractSpecs.isTradable("BTCUSDT"));
    assertFalse(ContractSpecs.isTradable("AAPL"));
    assertFalse(ContractSpecs.isTradable(null));
  }

  @Test
  void closeReasonPicksTheNotification() {
    assertEquals("notification.tradeClosed.slTriggered", FillBooking.closeNotificationTitle("STOP_LOSS"));
    assertEquals("notification.tradeClosed.tpTriggered", FillBooking.closeNotificationTitle("TAKE_PROFIT"));
    assertEquals("notification.liquidation.title", FillBooking.closeNotificationTitle("LIQUIDATION"));
    assertEquals("notification.tradeClosed.title", FillBooking.closeNotificationTitle(null));
    assertEquals("notification.tradeClosed.title", FillBooking.closeNotificationTitle("SIM_TTL"));
  }

  @Test
  void partialFillTakesItsShareOfTheReserveAndTheLastFillTakesTheRest() {
    TradingAccount ta = new TradingAccount();
    ta.setLeverage(100);
    BrokerOrder o = new BrokerOrder();
    o.setSymbolCode("BTCUSD");
    o.setQuantity(new BigDecimal("1.00"));
    o.setFilledQty(BigDecimal.ZERO);
    o.setReserveRemaining(new BigDecimal("1200"));

    assertEquals(0, FillBooking.reservePortion(o, ta, new BigDecimal("0.40")).compareTo(new BigDecimal("480")));
    o.setFilledQty(new BigDecimal("0.40"));
    o.setReserveRemaining(new BigDecimal("720"));
    assertEquals(0, FillBooking.reservePortion(o, ta, new BigDecimal("0.60")).compareTo(new BigDecimal("720")));
  }
}
