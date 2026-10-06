package com.brokerui.broker;

import java.math.BigDecimal;
import java.util.Set;

/**
 * Contract size and volume rules per instrument. Pure (no Spring) so the netting core and fee
 * math can be compiled and tested on their own. {@link BrokerApiController#getContractSize} delegates here.
 */
public final class ContractSpecs {
  private ContractSpecs() {}

  /** Instruments a client can open. Older seeded codes (BTCUSDT, stocks) stay readable in history only. */
  public static final Set<String> TRADABLE = Set.of(
      "EURUSD", "GBPUSD", "USDCAD", "EURNOK", "GBPJPY", "USDJPY", "NZDUSD", "CADJPY",
      "XAUUSD", "XAGUSD",
      "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD");

  public static final BigDecimal MIN_LOTS = new BigDecimal("0.01");
  public static final BigDecimal MAX_LOTS = new BigDecimal("100");
  /** Lots are whole multiples of 0.01. */
  public static final int LOT_DECIMALS = 2;

  public static boolean isTradable(String symbol) {
    return symbol != null && TRADABLE.contains(symbol.toUpperCase());
  }

  /** Error code for an order volume outside the rules, or null when it is fine. */
  public static String volumeError(BigDecimal lots) {
    if (lots == null || lots.signum() <= 0) return "invalid_quantity";
    if (lots.compareTo(MIN_LOTS) < 0 || lots.compareTo(MAX_LOTS) > 0) return "volume_out_of_range";
    if (lots.stripTrailingZeros().scale() > LOT_DECIMALS) return "volume_step";
    return null;
  }

  public static BigDecimal getContractSize(String symbol) {
    if (symbol == null) return BigDecimal.ONE;
    String sym = symbol.toUpperCase();
    if (sym.contains("BTC")) return BigDecimal.ONE;
    if (sym.contains("ETH")) return BigDecimal.ONE;
    if (sym.contains("SOL")) return BigDecimal.ONE;
    if (sym.contains("XRP")) return BigDecimal.valueOf(1000);
    if (sym.contains("XAU")) return BigDecimal.valueOf(100);
    if (sym.contains("XAG")) return BigDecimal.valueOf(5000);
    return BigDecimal.valueOf(100000);
  }
}
