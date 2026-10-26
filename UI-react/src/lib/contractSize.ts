/**
 * Returns contract size multiplier for a given trading symbol.
 * Shared by the live screens and the offline stand-in, so both price a lot the same way.
 *
 * @param symbol asset symbol
 * @returns contract size multiplier
 */
export function getContractSize(symbol: string): number {
  const sym = symbol.toUpperCase();
  if (sym.includes('BTC')) return 1;
  if (sym.includes('ETH')) return 1;
  if (sym.includes('SOL')) return 1;
  if (sym.includes('XRP')) return 1000;
  if (sym.includes('XAU')) return 100;
  if (sym.includes('XAG')) return 5000;
  return 100000;
}
