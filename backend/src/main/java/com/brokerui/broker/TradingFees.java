package com.brokerui.broker;

import java.math.BigDecimal;

/**
 * Central place for trading fee constants charged to the client on every trade fill.
 * <p>
 * This is intentionally the same flat amount used by the netting-broker AI routing model
 * (see {@code buysellmodel/simulation.js}, {@code EXCHANGE_FEE_PER_TRADE}) as the assumed
 * cost of routing an order to the external exchange/liquidity provider. That symmetry keeps
 * the economics consistent: the client always pays this commission regardless of how the
 * order was routed, while the platform only incurs the matching exchange-fee cost when the
 * AI advisor ({@code NNPredictorClient}) recommends {@code EXTERNAL} routing. Orders matched
 * {@code INTERNAL}ly cost the platform nothing, so the whole commission becomes pure profit —
 * which is exactly the netting-broker business model this app demonstrates.
 */
public final class TradingFees {
  private TradingFees() {}

  /** Default fallback commission charged when trade parameters are not fully specified. */
  public static final BigDecimal COMMISSION_PER_TRADE = new BigDecimal("1.50");

  /**
   * Dynamically calculates commission for a trade as 0.0025% (2.5 bps) of notional value
   * ({@code price × quantity × contractSize}), floored at $0.10 and capped at $50.00.
   * Falls back to {@link #COMMISSION_PER_TRADE} when quantity or price is missing/non-positive.
   *
   * @param symbolCode the asset symbol code
   * @param quantity trade volume / quantity
   * @param fillPrice execution price
   * @return calculated commission amount
   */
  public static BigDecimal calculateCommission(String symbolCode, BigDecimal quantity, BigDecimal fillPrice) {
    if (quantity == null || quantity.compareTo(BigDecimal.ZERO) <= 0 || fillPrice == null || fillPrice.compareTo(BigDecimal.ZERO) <= 0) {
      return COMMISSION_PER_TRADE;
    }

    BigDecimal contractSize = BrokerApiController.getContractSize(symbolCode);
    BigDecimal notional = fillPrice.multiply(quantity).multiply(contractSize);

    // Fixed commission rate of 0.0025% (2.5 bps) of notional value
    BigDecimal rate = new BigDecimal("0.000025");
    BigDecimal totalFee = notional.multiply(rate).setScale(2, java.math.RoundingMode.HALF_UP);

    // Minimum $0.10, Maximum $50.00 per trade to stay logical and avoid eating all profit or losing profitability
    BigDecimal minFee = new BigDecimal("0.10");
    BigDecimal maxFee = new BigDecimal("50.00");

    if (totalFee.compareTo(minFee) < 0) {
      return minFee;
    }
    if (totalFee.compareTo(maxFee) > 0) {
      return maxFee;
    }
    return totalFee;
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
      if (rawPrice == null || rawPrice.compareTo(BigDecimal.ZERO) <= 0) return rawPrice;
      // 0.015% markup per side (1.5 basis points) - standard broker spread
      BigDecimal spreadRate = new BigDecimal("0.00015"); 
      if (isBuy) {
          return rawPrice.multiply(BigDecimal.ONE.add(spreadRate)).setScale(5, java.math.RoundingMode.HALF_UP);
      } else {
          return rawPrice.multiply(BigDecimal.ONE.subtract(spreadRate)).setScale(5, java.math.RoundingMode.HALF_UP);
      }
  }
}

