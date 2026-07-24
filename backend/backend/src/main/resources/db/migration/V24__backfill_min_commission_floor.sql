-- V24: For FILLED trades where the dynamic commission rounds to $0.00 (tiny notional),
-- store a $0.01 display/accounting floor so History / admin totals are not blank zeros.
-- Live TradingFees Java formula is unchanged for new trades.

UPDATE broker_order
SET commission = 0.01
WHERE status = 'FILLED'
  AND commission = 0
  AND coalesce(entry_price, limit_price, stop_price) IS NOT NULL
  AND coalesce(entry_price, limit_price, stop_price) > 0
  AND quantity > 0;

UPDATE trade_fill tf
SET fee = 0.01
FROM broker_order bo
WHERE tf.order_id = bo.id
  AND tf.fee = 0
  AND bo.commission = 0.01;

UPDATE trading_account ta
SET commission_paid_total = coalesce((
  SELECT sum(bo.commission) FROM broker_order bo WHERE bo.trading_account_id = ta.id
), 0);
