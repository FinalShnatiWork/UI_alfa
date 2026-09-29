package com.brokerui.broker;

import java.math.BigDecimal;

/**
 * Contract size per instrument. Pure (no Spring) so the netting core and fee math can be
 * compiled and tested on their own. {@link BrokerApiController#getContractSize} delegates here.
 */
public final class ContractSpecs {
  private ContractSpecs() {}

  public static BigDecimal getContractSize(String symbol) {
    if (symbol == null) return BigDecimal.ONE;
    String sym = symbol.toUpperCase();
    if (sym.contains("BTC")) return BigDecimal.ONE;
    if (sym.contains("ETH")) return BigDecimal.ONE;
    if (sym.contains("SOL")) return BigDecimal.valueOf(100);
    if (sym.contains("XRP")) return BigDecimal.valueOf(1000);
    if (sym.contains("XAU")) return BigDecimal.valueOf(100);
    if (sym.contains("XAG")) return BigDecimal.valueOf(5000);
    return BigDecimal.valueOf(100000);
  }
}
