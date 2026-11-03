package com.brokerui.market;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.brokerui.broker.MT5IntegrationService;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

/** A silent feed gives no price: neither a made-up one nor an old one. */
class MarketPriceServiceTest {

  @Test
  void silentFeedGivesNoPriceAndAnOldQuoteIsNotReused() throws Exception {
    MT5IntegrationService mt5 = mock(MT5IntegrationService.class);
    YahooFinanceService yahoo = mock(YahooFinanceService.class);
    BinanceService binance = mock(BinanceService.class);
    when(mt5.isConfigured()).thenReturn(false);
    when(yahoo.isConfigured()).thenReturn(false);
    when(binance.getLivePrice("BTCUSD")).thenReturn(101_000.0, 0.0);
    MarketPriceService prices = new MarketPriceService(mt5, yahoo, binance);

    assertEquals(0.0, prices.getLivePrice("EURUSD"), 0.0);
    assertNull(prices.marketPrice("EURUSD"));

    assertEquals(101_000.0, prices.getLivePrice("BTCUSD"), 0.0);
    assertEquals(0, prices.marketPrice("BTCUSD").compareTo(BigDecimal.valueOf(101_000.0)));

    Thread.sleep(1_600);
    assertEquals(0.0, prices.getLivePrice("BTCUSD"), 0.0);
    assertNull(prices.marketPrice("BTCUSD"));
  }
}
