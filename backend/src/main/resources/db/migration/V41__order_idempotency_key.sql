-- The client sends a fresh Idempotency-Key with every order click. A repeat of the same request
-- (double click, retry after a lost answer) returns the first order instead of placing a second one.
ALTER TABLE broker_order ADD COLUMN idempotency_key VARCHAR(64);

CREATE UNIQUE INDEX ux_broker_order_idempotency
  ON broker_order (trading_account_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
