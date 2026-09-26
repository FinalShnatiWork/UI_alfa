package com.brokerui.broker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.brokerui.market.MarketPriceService;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/**
 * Regression tests for the liquidation debt write-off fix in {@link MarginLoanService}.
 * <p>
 * Bug: before the fix, {@code liquidateAccount()} wrote off ANY remaining debt to zero once
 * the loop finished, even when the loop stopped early because the margin level had already
 * recovered above {@link MarginLoanService#MARGIN_CALL_LEVEL} (meaning the client still had
 * enough collateral to cover the remaining debt normally). The fix only forgives debt when
 * every position has actually been liquidated and it is genuinely unpayable.
 */
class MarginLoanServiceLiquidationTest {

  private TradingAccountRepository accountRepo;
  private PositionRepository positionRepo;
  private BrokerOrderRepository orderRepo;
  private MarginLoanLedgerRepository ledgerRepo;
  private NotificationRepository notificationRepo;
  private MarketPriceService priceService;
  private AuditLogService auditLogService;
  private MarginLoanService service;

  private Map<String, Double> livePrices;
  private List<Position> livePositions;

  private void setUp(TradingAccount ta, List<Position> initialPositions) {
    accountRepo = mock(TradingAccountRepository.class);
    positionRepo = mock(PositionRepository.class);
    orderRepo = mock(BrokerOrderRepository.class);
    ledgerRepo = mock(MarginLoanLedgerRepository.class);
    notificationRepo = mock(NotificationRepository.class);
    priceService = mock(MarketPriceService.class);
    auditLogService = mock(AuditLogService.class);
    AccountTransactionRepository txRepo = mock(AccountTransactionRepository.class);
    service = new MarginLoanService(accountRepo, positionRepo, orderRepo, ledgerRepo,
        notificationRepo, txRepo, priceService, auditLogService);

    livePositions = new ArrayList<>(initialPositions);
    livePrices = new HashMap<>();

    when(accountRepo.findByIdForUpdate(anyLong())).thenReturn(Optional.of(ta));
    when(positionRepo.findByTradingAccountIdOrderByUpdatedAtDesc(anyLong()))
        .thenAnswer(inv -> new ArrayList<>(livePositions));
    doAnswer(inv -> {
      livePositions.remove((Position) inv.getArgument(0));
      return null;
    }).when(positionRepo).delete(any(Position.class));
    when(priceService.getLivePrice(anyString())).thenAnswer(inv -> {
      Double p = livePrices.get((String) inv.getArgument(0));
      return p == null ? 0.0 : p;
    });
  }

  private static Position position(String symbol, String side, BigDecimal qty, BigDecimal avg) {
    Position p = new Position();
    p.setSymbolCode(symbol);
    p.setSide(side);
    p.setQuantity(qty);
    p.setAvgPrice(avg);
    p.setOpenedAt(Instant.now());
    return p;
  }

  /** Mirrors {@link MarginLoanService#repaySettlementOrBorrow} for a single settlement. */
  private static BigDecimal debtAfterSettle(BigDecimal startDebt, BigDecimal startBal, BigDecimal amount) {
    if (amount.compareTo(BigDecimal.ZERO) > 0) {
      return startDebt.subtract(amount.min(startDebt));
    }
    BigDecimal loss = amount.abs();
    if (startBal.compareTo(loss) >= 0) return startDebt;
    return startDebt.add(loss.subtract(startBal));
  }

  private static TradingAccount account(BigDecimal balance, BigDecimal debt, int leverage) {
    TradingAccount ta = new TradingAccount();
    ta.setId(1L);
    ta.setLeverage(leverage);
    ta.setBalance(balance);
    ta.setBorrowedBalance(debt);
    return ta;
  }

  @Test
  void doesNotWriteOffDebt_whenMarginLevelRecoversBeforeAllPositionsClosed() {
    // Position A: worst (biggest loss) -> closed first.
    Position posA = position("BTCUSD", "LONG", BigDecimal.ONE, new BigDecimal("100"));
    // Position B: stays open once margin recovers.
    Position posB = position("ETHUSD", "LONG", BigDecimal.ONE, new BigDecimal("100"));

    TradingAccount ta = account(BigDecimal.ZERO, new BigDecimal("10"), 100);
    setUp(ta, List.of(posA, posB));

    // A is deep underwater (live 50 vs avg 100); B is flat for now.
    livePrices.put("BTCUSD", 50.0);
    livePrices.put("ETHUSD", 100.0);

    // The instant A is liquidated, simulate the market for B moving sharply in the
    // client's favor in the time it took to process A's closure — the realistic trigger
    // for a margin level recovering mid-liquidation.
    doAnswer(inv -> {
      livePositions.remove((Position) inv.getArgument(0));
      livePrices.put("ETHUSD", 300.0);
      return null;
    }).when(positionRepo).delete(any(Position.class));

    PositionCloseMath.Snapshot firstClose = PositionCloseMath.compute(posA, ta, new BigDecimal("50"));
    BigDecimal expectedDebt = debtAfterSettle(new BigDecimal("10"), BigDecimal.ZERO, firstClose.settlement());

    service.liquidateAccount(1L);

    assertFalse(livePositions.contains(posA), "the worst position should have been closed");
    assertTrue(livePositions.contains(posB), "recovery should stop the liquidation before touching the 2nd position");
    assertEquals(0, ta.getBorrowedBalance().compareTo(expectedDebt),
        "remaining debt must NOT be forgiven once margin level recovers — got " + ta.getBorrowedBalance());
  }

  @Test
  void writesOffDebt_whenAllPositionsExhaustedAndDebtStillUnpayable() {
    // Single, catastrophically-losing position with nothing left to liquidate after it.
    Position posA = position("BTCUSD", "LONG", BigDecimal.ONE, new BigDecimal("100"));
    TradingAccount ta = account(BigDecimal.ZERO, new BigDecimal("5"), 100);
    setUp(ta, List.of(posA));

    livePrices.put("BTCUSD", 10.0); // huge loss, nowhere near covering the debt

    service.liquidateAccount(1L);

    assertTrue(livePositions.isEmpty(), "the only position should have been liquidated");
    assertEquals(0, ta.getBorrowedBalance().compareTo(BigDecimal.ZERO),
        "genuinely unpayable debt (no positions left) must still be written off as before");
  }

  @Test
  void doesNotWriteOffDebt_whenPricesUnavailableAndPositionsRemain() {
    // Both positions stay open because live prices never arrive (0 / missing).
    // Before the fix this still wrote off the debt because recovered stayed false.
    Position posA = position("BTCUSD", "LONG", BigDecimal.ONE, new BigDecimal("100"));
    Position posB = position("ETHUSD", "LONG", BigDecimal.ONE, new BigDecimal("100"));
    TradingAccount ta = account(BigDecimal.ZERO, new BigDecimal("50"), 100);
    setUp(ta, List.of(posA, posB));
    // no livePrices entries → getLivePrice returns 0.0 → continue

    service.liquidateAccount(1L);

    assertEquals(2, livePositions.size(), "positions must stay open when prices are unavailable");
    assertEquals(0, ta.getBorrowedBalance().compareTo(new BigDecimal("50")),
        "debt must NOT be forgiven while positions remain due to missing prices — got " + ta.getBorrowedBalance());
  }

  @Test
  void doesNotWriteOffDebt_whenOnePositionClosedButAnotherHasNoPrice() {
    Position posA = position("BTCUSD", "LONG", BigDecimal.ONE, new BigDecimal("100"));
    Position posB = position("ETHUSD", "LONG", BigDecimal.ONE, new BigDecimal("100"));
    TradingAccount ta = account(BigDecimal.ZERO, new BigDecimal("80"), 100);
    setUp(ta, List.of(posA, posB));

    livePrices.put("BTCUSD", 10.0); // closable at a loss
    // ETHUSD has no price → skipped, remains open

    service.liquidateAccount(1L);

    assertFalse(livePositions.contains(posA), "priced position should have been closed");
    assertTrue(livePositions.contains(posB), "unpriced position must remain");
    assertTrue(ta.getBorrowedBalance().compareTo(BigDecimal.ZERO) > 0,
        "debt must remain while any position is still open — got " + ta.getBorrowedBalance());
  }
}
