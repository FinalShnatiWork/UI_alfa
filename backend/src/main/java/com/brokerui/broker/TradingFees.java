package com.brokerui.broker;

import java.math.BigDecimal;

/**
 * Two schedules, both with the client paying twice what the venue charges.
 * Crypto is a percent of notional (Binance-like). Forex and metals are dollars per lot,
 * because a percent of a 100,000-unit contract is far above a retail FX commission.
 * An internal cross keeps both client commissions and pays the venue nothing.
 */
public final class TradingFees {
  private TradingFees() {}

  /** Crypto: 0.20% of notional. */
  public static final BigDecimal CLIENT_RATE = new BigDecimal("0.002");

  /** Crypto: 0.10% of notional sent to the venue. */
  public static final BigDecimal EXCHANGE_RATE = new BigDecimal("0.001");

  /** Forex and metals: client commission per 1.0 lot, per fill. */
  public static final BigDecimal CLIENT_PER_LOT = new BigDecimal("7.00");

  /** Forex and metals: venue cost per 1.0 lot on the quantity that leaves. */
  public static final BigDecimal EXCHANGE_PER_LOT = new BigDecimal("3.50");

  public static boolean isCrypto(String symbolCode) {
    if (symbolCode == null) return false;
    String sym = symbolCode.toUpperCase();
    return sym.contains("BTC") || sym.contains("ETH") || sym.contains("SOL") || sym.contains("XRP");
  }

  public static BigDecimal notional(String symbolCode, BigDecimal quantity, BigDecimal price) {
    if (quantity == null || quantity.compareTo(BigDecimal.ZERO) <= 0
        || price == null || price.compareTo(BigDecimal.ZERO) <= 0) {
      return BigDecimal.ZERO;
    }
    return price.multiply(quantity).multiply(ContractSpecs.getContractSize(symbolCode));
  }

  /**
   * Crypto: {@link #CLIENT_RATE} of notional. Forex and metals: {@link #CLIENT_PER_LOT} times lots.
   */
  public static BigDecimal calculateCommission(String symbolCode, BigDecimal quantity, BigDecimal fillPrice) {
    if (quantity == null || quantity.compareTo(BigDecimal.ZERO) <= 0) return BigDecimal.ZERO.setScale(2);
    if (!isCrypto(symbolCode)) {
      return quantity.multiply(CLIENT_PER_LOT).setScale(2, java.math.RoundingMode.HALF_UP);
    }
    return notional(symbolCode, quantity, fillPrice).multiply(CLIENT_RATE).setScale(2, java.math.RoundingMode.HALF_UP);
  }

  /** Venue cost for this quantity. Zero when the quantity never leaves the building. */
  public static BigDecimal exchangeFee(String symbolCode, BigDecimal quantity, BigDecimal price) {
    if (quantity == null || quantity.compareTo(BigDecimal.ZERO) <= 0) return BigDecimal.ZERO.setScale(2);
    if (!isCrypto(symbolCode)) {
      return quantity.multiply(EXCHANGE_PER_LOT).setScale(2, java.math.RoundingMode.HALF_UP);
    }
    return notional(symbolCode, quantity, price).multiply(EXCHANGE_RATE).setScale(2, java.math.RoundingMode.HALF_UP);
  }

  /**
   * Calculates dynamic commission with a client profit safety guard:
   * On winning trades, total commission is capped so it never exceeds 20% of gross profit.
   * This guarantees the client keeps at least 80% of their trading profit.
   */
  public static BigDecimal calculateCommission(String symbolCode, BigDecimal quantity, BigDecimal fillPrice, BigDecimal grossPnl) {
    BigDecimal fee = calculateCommission(symbolCode, quantity, fillPrice);
    if (grossPnl != null && grossPnl.compareTo(BigDecimal.ZERO) > 0) {
      BigDecimal maxProfitFee = grossPnl.multiply(new BigDecimal("0.20")).setScale(2, java.math.RoundingMode.HALF_UP);
      if (maxProfitFee.compareTo(new BigDecimal("0.05")) >= 0 && fee.compareTo(maxProfitFee) > 0) {
        return maxProfitFee;
      }
    }
    return fee;
  }

  /**
   * Client Profit Safety Guard for the close leg.
   * On winning trades, total commission (open + close) is capped to max 20% of gross
   * profit so the client keeps at least 80% of gains. The open-leg fee was already
   * charged and cannot be refunded, so only {@code closeCommission} may be reduced.
   *
   * @return the close-leg commission to actually charge (never negative)
   */
  public static BigDecimal applyProfitSafetyGuard(
      BigDecimal openCommission, BigDecimal closeCommission, BigDecimal grossPnl) {
    BigDecimal open = openCommission == null ? BigDecimal.ZERO : openCommission;
    BigDecimal close = closeCommission == null ? BigDecimal.ZERO : closeCommission;
    if (grossPnl != null && grossPnl.compareTo(BigDecimal.ZERO) > 0) {
      BigDecimal maxFee = grossPnl.multiply(new BigDecimal("0.20")).setScale(2, java.math.RoundingMode.HALF_UP);
      if (maxFee.compareTo(new BigDecimal("0.05")) >= 0 && open.add(close).compareTo(maxFee) > 0) {
        close = maxFee.subtract(open);
        if (close.compareTo(BigDecimal.ZERO) < 0) {
          close = BigDecimal.ZERO;
        }
      }
    }
    return close;
  }

  /**
   * Records the commission on the given order and adds it to the account's lifetime total.
   * Does not touch cash balance — callers are responsible for folding the commission into
   * their own settlement math (margin required on open, or net proceeds on close).
   *
   * @param ta     the trading account being charged
   * @param order  the order this commission applies to
   * @param amount the commission amount
   */
  public static void charge(TradingAccount ta, BrokerOrder order, BigDecimal amount) {
    order.setCommission(amount);
    BigDecimal total = ta.getCommissionPaidTotal() == null ? BigDecimal.ZERO : ta.getCommissionPaidTotal();
    ta.setCommissionPaidTotal(total.add(amount));
  }

  /**
   * Applies a subtle spread to the raw market price.
   * This ensures the broker inherently profits from the Bid/Ask difference.
   * @param rawPrice The raw mid-market price
   * @param isBuy True if the client is buying (paying the higher Ask price), False if selling (receiving the lower Bid price)
   */
  public static BigDecimal applySpread(BigDecimal rawPrice, boolean isBuy) {
      // 0.015% markup per side (1.5 basis points) - standard broker spread (see PriceSpread)
      return PriceSpread.apply(rawPrice, isBuy);
  }
}

