package com.brokerui.broker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

/**
 * Pure arithmetic tests — no Mockito, so they run even when the JDK is newer than
 * the ByteBuddy version Spring Boot's test starter originally shipped.
 */
class PositionCloseMathTest {

  @Test
  void longCloseUsesBidNotMid() {
    Position pos = position("BTCUSD", "LONG", BigDecimal.ONE, new BigDecimal("100"));
    TradingAccount ta = account(100);
    BigDecimal mid = new BigDecimal("50");

    PositionCloseMath.Snapshot s = PositionCloseMath.compute(pos, ta, mid);

    BigDecimal expectedBid = TradingFees.applySpread(mid, false);
    assertEquals(0, s.closePrice().compareTo(expectedBid), "LONG close must sell at Bid");
    assertTrue(s.closePrice().compareTo(mid) < 0, "Bid must be below mid");
    assertEquals("SELL", s.closeSide());
  }

  @Test
  void shortCloseUsesAskNotMid() {
    Position pos = position("BTCUSD", "SHORT", BigDecimal.ONE, new BigDecimal("100"));
    TradingAccount ta = account(100);
    BigDecimal mid = new BigDecimal("50");

    PositionCloseMath.Snapshot s = PositionCloseMath.compute(pos, ta, mid);

    BigDecimal expectedAsk = TradingFees.applySpread(mid, true);
    assertEquals(0, s.closePrice().compareTo(expectedAsk), "SHORT close must buy at Ask");
    assertTrue(s.closePrice().compareTo(mid) > 0, "Ask must be above mid");
    assertEquals("BUY", s.closeSide());
  }

  @Test
  void settlementSubtractsCloseCommissionFromGrossPlusMargin() {
    Position pos = position("BTCUSD", "LONG", BigDecimal.ONE, new BigDecimal("100"));
    TradingAccount ta = account(100);
    PositionCloseMath.Snapshot s = PositionCloseMath.compute(pos, ta, new BigDecimal("50"));

    BigDecimal expected = s.marginReturned().add(s.grossPnl()).subtract(s.closeCommission());
    assertEquals(0, s.settlement().compareTo(expected));
    assertEquals(0, s.netPnl().compareTo(s.grossPnl().subtract(s.totalFees())));
  }

  @Test
  void sameInputsYieldSameSnapshotForEveryClosePath() {
    Position pos = position("ETHUSD", "LONG", new BigDecimal("2"), new BigDecimal("2400"));
    TradingAccount ta = account(50);
    BigDecimal mid = new BigDecimal("2410");
    PositionCloseMath.Snapshot a = PositionCloseMath.compute(pos, ta, mid);
    PositionCloseMath.Snapshot b = PositionCloseMath.compute(pos, ta, mid);
    assertEquals(0, a.settlement().compareTo(b.settlement()));
    assertEquals(0, a.netPnl().compareTo(b.netPnl()));
    assertEquals(0, a.closePrice().compareTo(b.closePrice()));
  }

  private static Position position(String symbol, String side, BigDecimal qty, BigDecimal avg) {
    Position p = new Position();
    p.setSymbolCode(symbol);
    p.setSide(side);
    p.setQuantity(qty);
    p.setAvgPrice(avg);
    return p;
  }

  private static TradingAccount account(int leverage) {
    TradingAccount ta = new TradingAccount();
    ta.setLeverage(leverage);
    ta.setBalance(BigDecimal.ZERO);
    ta.setBorrowedBalance(BigDecimal.ZERO);
    return ta;
  }
}
