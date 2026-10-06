package com.brokerui.broker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.brokerui.market.MarketPriceService;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class AccountEquityTest {

  private static Position longEurusd(String lots, String avg, String storedPnl) {
    Position p = new Position();
    p.setSymbolCode("EURUSD");
    p.setSide("LONG");
    p.setQuantity(new BigDecimal(lots));
    p.setAvgPrice(new BigDecimal(avg));
    if (storedPnl != null) p.setUnrealizedPnl(new BigDecimal(storedPnl));
    return p;
  }

  private static TradingAccount account(String balance) {
    TradingAccount ta = new TradingAccount();
    ta.setBalance(new BigDecimal(balance));
    ta.setLeverage(100);
    return ta;
  }

  @Test
  void equityIsBalancePlusFloatingPnl_withoutMarginAddedBack() {
    MarketPriceService prices = mock(MarketPriceService.class);
    when(prices.getLivePrice(anyString())).thenReturn(1.1010);
    Position p = longEurusd("1", "1.1000", null);

    BigDecimal equity = AccountEquity.equity(account("1000"), List.of(p), prices);

    // 0.0010 * 100 000 = +100
    assertEquals(0, equity.compareTo(new BigDecimal("1100")), "got " + equity);
  }

  @Test
  void collateralAddsBackTheMarginEachPositionReleases() {
    MarketPriceService prices = mock(MarketPriceService.class);
    when(prices.getLivePrice(anyString())).thenReturn(1.1010);
    Position p = longEurusd("1", "1.1000", null);

    BigDecimal collateral = AccountEquity.collateral(account("1000"), List.of(p), prices);

    // balance 1000 + margin 1.1 * 100 000 / 100 = 1100 + P/L 100
    assertEquals(0, collateral.compareTo(new BigDecimal("2200")), "got " + collateral);
  }

  @Test
  void missingQuoteFallsBackToStoredPnl_insteadOfDroppingThePosition() {
    MarketPriceService prices = mock(MarketPriceService.class);
    when(prices.getLivePrice(anyString())).thenReturn(0.0);
    Position p = longEurusd("1", "1.1000", "-40");

    assertEquals(0, AccountEquity.equity(account("1000"), List.of(p), prices).compareTo(new BigDecimal("960")));
    assertEquals(0, AccountEquity.collateral(account("1000"), List.of(p), prices).compareTo(new BigDecimal("2060")));
  }

  @Test
  void settledValueMovesOnlyByTheTradesNetResult_acrossOpenAndClose() {
    TradingAccount ta = account("10000");
    BigDecimal before = AccountEquity.settledValue(ta, List.of(), List.of());

    Position p = longEurusd("1", "1.1000", null);
    BigDecimal margin = new BigDecimal("1100");
    BigDecimal openFee = TradingFees.calculateCommission("EURUSD", p.getQuantity(), p.getAvgPrice());
    ta.setBalance(ta.getBalance().subtract(margin).subtract(openFee));
    BigDecimal whileOpen = AccountEquity.settledValue(ta, List.of(p), List.of());
    assertEquals(0, whileOpen.compareTo(before), "opening must not move the value, got " + whileOpen);

    PositionCloseMath.Snapshot close = PositionCloseMath.atFillPrice(p, ta, new BigDecimal("1.1010"), false);
    ta.setBalance(ta.getBalance().add(close.marginReturned()).add(close.grossPnl()).subtract(close.closeCommission()));
    BigDecimal after = AccountEquity.settledValue(ta, List.of(), List.of());
    assertEquals(0, after.subtract(before).compareTo(close.netPnl()),
        "closing must move the value by realized P/L " + close.netPnl() + ", got " + after.subtract(before));
  }

  @Test
  void settledValueCountsWaitingOrderReservesAndSubtractsDebt() {
    TradingAccount ta = account("500");
    ta.setBorrowedBalance(new BigDecimal("200"));
    BrokerOrder waiting = new BrokerOrder();
    waiting.setReserveRemaining(new BigDecimal("300"));
    BrokerOrder closing = new BrokerOrder();
    closing.setClosesPositionId(7L);
    closing.setReserveRemaining(new BigDecimal("999"));

    BigDecimal value = AccountEquity.settledValue(ta, List.of(), List.of(waiting, closing));

    assertEquals(0, value.compareTo(new BigDecimal("600")), "got " + value);
  }
}
