package com.brokerui.broker;

import java.math.BigDecimal;
import java.time.Instant;
import org.springframework.stereotype.Component;

/**
 * One write for a commission: the order, the account counter, and a COMMISSION
 * transaction all receive the same amount. Historical rows are left as they are.
 */
@Component
public class CommissionLedger {

  private final AccountTransactionRepository txRepo;

  public CommissionLedger(AccountTransactionRepository txRepo) {
    this.txRepo = txRepo;
  }

  /** Sets the order commission to this charge. Used when the order is new. */
  public void record(TradingAccount ta, BrokerOrder order, BigDecimal amount) {
    record(ta, order, amount, false);
  }

  /**
   * @param accumulate true adds this charge to a commission already stored on the
   *     order (a second partial fill). false replaces it.
   */
  public void record(TradingAccount ta, BrokerOrder order, BigDecimal amount, boolean accumulate) {
    BigDecimal fee = amount == null || amount.signum() < 0 ? BigDecimal.ZERO : amount;
    BigDecimal previous = order.getCommission() == null ? BigDecimal.ZERO : order.getCommission();
    order.setCommission(accumulate ? previous.add(fee) : fee);
    if (fee.signum() == 0) return;

    BigDecimal paid = ta.getCommissionPaidTotal() == null ? BigDecimal.ZERO : ta.getCommissionPaidTotal();
    ta.setCommissionPaidTotal(paid.add(fee));

    AccountTransaction tx = new AccountTransaction();
    tx.setTradingAccount(ta);
    tx.setTxType("COMMISSION");
    tx.setAmount(fee);
    tx.setCurrency(ta.getCurrency() == null ? "USD" : ta.getCurrency());
    tx.setStatus("APPROVED");
    tx.setProcessedAt(Instant.now());
    tx.setNote("Commission " + order.getSymbolCode() + " " + order.getSide());
    txRepo.save(tx);
  }
}
