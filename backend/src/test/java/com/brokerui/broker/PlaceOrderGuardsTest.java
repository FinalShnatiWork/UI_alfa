package com.brokerui.broker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.brokerui.market.MarketPriceService;
import com.brokerui.user.AppUser;
import com.brokerui.user.AppUserRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;

/** Checks that run before any money is reserved for a new order. */
class PlaceOrderGuardsTest {

  private TradingAccountRepository accountRepo;
  private BrokerOrderRepository orderRepo;
  private SymbolRepository symbolRepo;
  private AccountTransactionRepository txRepo;
  private MarginLoanService marginLoanService;
  private MarketPriceService priceService;
  private BrokerApiController controller;
  private TradingAccount ta;
  private Authentication auth;

  @BeforeEach
  void setUp() {
    AppUserRepository userRepo = mock(AppUserRepository.class);
    accountRepo = mock(TradingAccountRepository.class);
    orderRepo = mock(BrokerOrderRepository.class);
    symbolRepo = mock(SymbolRepository.class);
    txRepo = mock(AccountTransactionRepository.class);
    marginLoanService = mock(MarginLoanService.class);
    priceService = mock(MarketPriceService.class);
    controller = new BrokerApiController(
        userRepo, accountRepo, symbolRepo, mock(PositionRepository.class), orderRepo, txRepo,
        mock(NotificationRepository.class), mock(UserPreferenceRepository.class),
        mock(MT5IntegrationService.class), priceService, mock(AuditLogService.class),
        mock(NNPredictorClient.class), marginLoanService, mock(MarginLoanLedgerRepository.class),
        new CommissionLedger(txRepo));

    AppUser user = new AppUser();
    user.setId(1L);
    user.setEmail("guards@test.com");
    ta = new TradingAccount();
    ta.setId(7L);
    ta.setUser(user);
    ta.setBalance(new BigDecimal("1000"));
    ta.setLeverage(100);
    ta.setBorrowedBalance(BigDecimal.ZERO);
    ta.setCreditLimit(new BigDecimal("10000"));

    when(userRepo.findByEmailIgnoreCase("guards@test.com")).thenReturn(Optional.of(user));
    when(accountRepo.findFirstByUserIdOrderByIdAsc(1L)).thenReturn(Optional.of(ta));
    when(accountRepo.findByIdForUpdate(7L)).thenReturn(Optional.of(ta));
    when(symbolRepo.findByCode(anyString())).thenReturn(Optional.of(symbol(true)));
    when(priceService.getLivePrice(anyString())).thenReturn(90_000.0);
    when(orderRepo.save(any(BrokerOrder.class))).thenAnswer(i -> {
      BrokerOrder o = i.getArgument(0);
      o.setId(100L);
      return o;
    });
    auth = new UsernamePasswordAuthenticationToken("guards@test.com", "x");
  }

  private static Symbol symbol(boolean enabled) {
    Symbol s = new Symbol();
    s.setEnabled(enabled);
    return s;
  }

  private ResponseEntity<?> place(String symbol, String qty, String type, String limit) {
    return controller.placeOrder(auth, new BrokerApiController.PlaceOrderRequest(
        symbol, "BUY", type, new BigDecimal(qty), limit == null ? null : new BigDecimal(limit),
        null, null, null, null, null), null);
  }

  private static Object error(ResponseEntity<?> r) {
    return ((Map<?, ?>) r.getBody()).get("error");
  }

  @Test
  void unknownSymbolIsRefusedBeforeAnyReservation() {
    ResponseEntity<?> r = place("FOOBAR", "0.01", "MARKET", null);
    assertEquals(400, r.getStatusCode().value());
    assertEquals("symbol_not_tradable", error(r));
    verify(marginLoanService, never()).tryCoverShortfall(any(), any(), any(), any());
  }

  @Test
  void disabledSymbolIsRefused() {
    when(symbolRepo.findByCode("BTCUSD")).thenReturn(Optional.of(symbol(false)));
    assertEquals("symbol_not_tradable", error(place("BTCUSD", "0.01", "MARKET", null)));
  }

  @Test
  void legacySeededCodeIsNotTradable() {
    assertEquals("symbol_not_tradable", error(place("AAPL", "0.01", "MARKET", null)));
  }

  @Test
  void volumeBelowMinimumAboveMaximumOrOffStepIsRefused() {
    assertEquals("volume_out_of_range", error(place("BTCUSD", "0.001", "MARKET", null)));
    assertEquals("volume_out_of_range", error(place("BTCUSD", "100.01", "MARKET", null)));
    assertEquals("volume_step", error(place("BTCUSD", "0.015", "MARKET", null)));
    verify(marginLoanService, never()).tryCoverShortfall(any(), any(), any(), any());
  }

  @Test
  void pendingOrderReservesMarginAndCommission() {
    when(marginLoanService.tryCoverShortfall(eq(ta), any(), any(), any())).thenReturn(true);

    ResponseEntity<?> r = place("BTCUSD", "0.01", "LIMIT", "80000");

    assertEquals(200, r.getStatusCode().value());
    // margin 80000 × 0.01 / 100 = 8, commission 0.2% of 800 = 1.60
    ArgumentCaptor<BigDecimal> reserved = ArgumentCaptor.forClass(BigDecimal.class);
    verify(marginLoanService).tryCoverShortfall(eq(ta), reserved.capture(), any(), any());
    assertEquals(0, reserved.getValue().compareTo(new BigDecimal("9.60")), "reserved=" + reserved.getValue());
    ArgumentCaptor<BrokerOrder> saved = ArgumentCaptor.forClass(BrokerOrder.class);
    verify(orderRepo).save(saved.capture());
    assertEquals(0, saved.getValue().getReserveRemaining().compareTo(new BigDecimal("9.60")));
  }

  @Test
  void cashWaitingForWithdrawalCannotBeTraded() {
    AccountTransaction w = new AccountTransaction();
    w.setTxType("WITHDRAWAL");
    w.setStatus("PENDING");
    w.setAmount(new BigDecimal("995"));
    when(txRepo.findByTradingAccountIdOrderByCreatedAtDesc(7L)).thenReturn(List.of(w));

    // needs ≈ 9 margin + 1.8 commission, only 5 is free of the withdrawal
    ResponseEntity<?> r = place("BTCUSD", "0.01", "MARKET", null);

    assertEquals("funds_pending_withdrawal", error(r));
    verify(marginLoanService, never()).tryCoverShortfall(any(), any(), any(), any());
    assertEquals(0, ta.getBalance().compareTo(new BigDecimal("1000")));
  }

  @Test
  void pendingWithdrawalLeavingEnoughCashDoesNotBlock() {
    AccountTransaction w = new AccountTransaction();
    w.setTxType("WITHDRAWAL");
    w.setStatus("PENDING");
    w.setAmount(new BigDecimal("100"));
    when(txRepo.findByTradingAccountIdOrderByCreatedAtDesc(7L)).thenReturn(List.of(w));
    when(marginLoanService.tryCoverShortfall(eq(ta), any(), any(), any())).thenReturn(true);

    assertEquals(200, place("BTCUSD", "0.01", "LIMIT", "80000").getStatusCode().value());
  }
}
