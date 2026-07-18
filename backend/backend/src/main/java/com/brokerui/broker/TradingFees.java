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

  /** Flat commission charged to the client on every order fill (open or close). */
  public static final BigDecimal COMMISSION_PER_TRADE = new BigDecimal("1.50");

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
}
