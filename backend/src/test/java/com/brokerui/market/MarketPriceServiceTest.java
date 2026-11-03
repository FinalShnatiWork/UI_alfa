package com.brokerui.market;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.brokerui.broker.MT5IntegrationService;
import org.junit.jupiter.api.Test;

/** A silent feed must not invent a price. The last real quote of this server run is kept. */
class MarketPriceServiceTest {

  @Test
  void silentFeedReturnsNothingUntilARealPriceWasSeen() throws Exception {
    MT5IntegrationService mt5 = mock(MT5IntegrationService.class);
    YahooFinanceService yahoo = mock(YahooFinanceService.class);
    BinanceService binance = mock(BinanceService.class);
    when(mt5.isConfigured()).thenReturn(false);
    when(yahoo.isConfigured()).thenReturn(false);
    when(binance.getLivePrice("BTCUSD")).thenReturn(101_000.0, 0.0);
    MarketPriceService prices = new MarketPriceService(mt5, yahoo, binance);

    assertNull(prices.executionQuote("EURUSD"));
    assertEquals(0.0, prices.getLivePrice("EURUSD"), 0.0);

    MarketPriceService.ExecutionQuote live = prices.executionQuote("BTCUSD");
    assertTrue(live.live());
    assertEquals(101_000.0, live.price(), 0.0);

    MarketPriceService.ExecutionQuote stale = prices.executionQuote("BTCUSD");
    assertFalse(stale.live());
    assertEquals(101_000.0, stale.price(), 0.0);
  }
}
