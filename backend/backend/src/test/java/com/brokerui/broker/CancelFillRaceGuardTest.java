package com.brokerui.broker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.argThat;

import com.brokerui.market.MarketPriceService;
import com.brokerui.user.AppUser;
import com.brokerui.user.AppUserRepository;
import java.math.BigDecimal;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;

/**
 * Guards against the cancel↔fill race: once an order is no longer NEW (already filled
 * or cancelled), cancel must not refund the reservation, and fill must not open a
 * second position / settle reserved margin again.
 */
class CancelFillRaceGuardTest {

  private AppUserRepository userRepo;
  private TradingAccountRepository accountRepo;
  private BrokerOrderRepository orderRepo;
  private PositionRepository positionRepo;
  private SymbolRepository symbolRepo;
  private MarginLoanService marginLoanService;
  private MarketPriceService priceService;
  private BrokerApiController controller;
  private OrderExecutionService executionService;

  private AppUser user;
  private TradingAccount ta;
  private Authentication auth;

  @BeforeEach
  void setUp() {
    userRepo = mock(AppUserRepository.class);
    accountRepo = mock(TradingAccountRepository.class);
    orderRepo = mock(BrokerOrderRepository.class);
    positionRepo = mock(PositionRepository.class);
    symbolRepo = mock(SymbolRepository.class);
    marginLoanService = mock(MarginLoanService.class);
    priceService = mock(MarketPriceService.class);
    TradeFillRepository fillRepo = mock(TradeFillRepository.class);
    NotificationRepository notificationRepo = mock(NotificationRepository.class);
    AccountTransactionRepository txRepo = mock(AccountTransactionRepository.class);
    KycCaseRepository kycRepo = mock(KycCaseRepository.class);
    UserPreferenceRepository preferenceRepo = mock(UserPreferenceRepository.class);
    MT5IntegrationService mt5Service = mock(MT5IntegrationService.class);
    AuditLogService auditLogService = mock(AuditLogService.class);
    NNPredictorClient nnPredictorClient = mock(NNPredictorClient.class);

    controller = new BrokerApiController(
        userRepo, accountRepo, symbolRepo, positionRepo, orderRepo, fillRepo, txRepo,
        notificationRepo, kycRepo, preferenceRepo, mt5Service, priceService,
        auditLogService, nnPredictorClient, marginLoanService);

    executionService = new OrderExecutionService(
        accountRepo, positionRepo, orderRepo, fillRepo, notificationRepo, symbolRepo,
        mt5Service, priceService, nnPredictorClient, marginLoanService);

    user = new AppUser();
    user.setId(1L);
    user.setEmail("race@test.com");
    ta = new TradingAccount();
    ta.setId(7L);
    ta.setUser(user);
    ta.setBalance(new BigDecimal("1000"));
    ta.setLeverage(100);
    ta.setBorrowedBalance(BigDecimal.ZERO);

    when(userRepo.findByEmailIgnoreCase("race@test.com")).thenReturn(Optional.of(user));
    when(accountRepo.findFirstByUserIdOrderByIdAsc(1L)).thenReturn(Optional.of(ta));
    when(accountRepo.findByIdForUpdate(7L)).thenReturn(Optional.of(ta));
    auth = new UsernamePasswordAuthenticationToken("race@test.com", "x");
  }

  private BrokerOrder pendingBuy(Long id) {
    BrokerOrder o = new BrokerOrder();
    o.setId(id);
    o.setTradingAccount(ta);
    o.setSymbolCode("BTCUSD");
    o.setSide("BUY");
    o.setOrderType("LIMIT");
    o.setStatus("NEW");
    o.setQuantity(new BigDecimal("0.01"));
    o.setLimitPrice(new BigDecimal("100000"));
    return o;
  }

  @Test
  void cancel_doesNotRefund_whenOrderAlreadyFilled() {
    BrokerOrder order = pendingBuy(42L);
    order.setStatus("FILLED"); // fill won the race and flipped status under the row lock
    when(orderRepo.findByIdForUpdate(42L)).thenReturn(Optional.of(order));

    BigDecimal balanceBefore = ta.getBalance();
    ResponseEntity<?> resp = controller.cancelOrder(auth, 42L);

    assertEquals(400, resp.getStatusCode().value());
    assertEquals(0, ta.getBalance().compareTo(balanceBefore), "balance must stay unchanged");
    verify(marginLoanService, never()).repaySettlementOrBorrow(any(), any());
  }

  @Test
  void cancel_refundsOnce_whenOrderStillNew() {
    BrokerOrder order = pendingBuy(43L);
    when(orderRepo.findByIdForUpdate(43L)).thenReturn(Optional.of(order));

    ResponseEntity<?> resp = controller.cancelOrder(auth, 43L);

    assertEquals(200, resp.getStatusCode().value());
    assertEquals("CANCELLED", order.getStatus());
    // reserved = 100000 * 0.01 * 1 / 100 = 10
    verify(marginLoanService).repaySettlementOrBorrow(eq(ta),
        argThat(a -> a != null && a.compareTo(new BigDecimal("10")) == 0));
  }

  @Test
  void tryExecute_doesNotFill_whenOrderAlreadyCancelled() {
    BrokerOrder order = pendingBuy(44L);
    order.setStatus("CANCELLED");
    when(orderRepo.findByIdForUpdate(44L)).thenReturn(Optional.of(order));

    Symbol sym = new Symbol();
    // symbol lookup shouldn't even matter — we bail on status first
    when(symbolRepo.findByCode(anyString())).thenReturn(Optional.of(sym));
    when(priceService.getLivePrice(anyString())).thenReturn(90_000.0);

    executionService.tryExecute(44L);

    verify(positionRepo, never()).save(any());
    verify(accountRepo, never()).findByIdForUpdate(anyLong());
    verify(marginLoanService, never()).repaySettlementOrBorrow(any(), any());
    assertNotEquals("FILLED", order.getStatus());
  }
}
