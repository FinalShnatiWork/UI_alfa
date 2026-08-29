-- Store computed account numbers directly (demo-friendly).
ALTER TABLE trading_account ADD COLUMN IF NOT EXISTS balance NUMERIC(18,8) NOT NULL DEFAULT 0;
ALTER TABLE trading_account ADD COLUMN IF NOT EXISTS equity NUMERIC(18,8) NOT NULL DEFAULT 0;
ALTER TABLE trading_account ADD COLUMN IF NOT EXISTS margin_used NUMERIC(18,8) NOT NULL DEFAULT 0;
ALTER TABLE trading_account ADD COLUMN IF NOT EXISTS free_margin NUMERIC(18,8) NOT NULL DEFAULT 0;
ALTER TABLE trading_account ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Initialize balances for demo account if a demo deposit exists.
UPDATE trading_account ta
SET
  balance = COALESCE((
    SELECT SUM(CASE
      WHEN t.status = 'APPROVED' AND t.tx_type IN ('DEPOSIT','BONUS','ADJUSTMENT') THEN t.amount
      WHEN t.status = 'APPROVED' AND t.tx_type = 'WITHDRAWAL' THEN -t.amount
      ELSE 0
    END)
    FROM account_transaction t
    WHERE t.trading_account_id = ta.id
  ), 0),
  equity = COALESCE((
    SELECT SUM(CASE
      WHEN t.status = 'APPROVED' AND t.tx_type IN ('DEPOSIT','BONUS','ADJUSTMENT') THEN t.amount
      WHEN t.status = 'APPROVED' AND t.tx_type = 'WITHDRAWAL' THEN -t.amount
      ELSE 0
    END)
    FROM account_transaction t
    WHERE t.trading_account_id = ta.id
  ), 0),
  margin_used = 0,
  free_margin = COALESCE((
    SELECT SUM(CASE
      WHEN t.status = 'APPROVED' AND t.tx_type IN ('DEPOSIT','BONUS','ADJUSTMENT') THEN t.amount
      WHEN t.status = 'APPROVED' AND t.tx_type = 'WITHDRAWAL' THEN -t.amount
      ELSE 0
    END)
    FROM account_transaction t
    WHERE t.trading_account_id = ta.id
  ), 0),
  updated_at = CURRENT_TIMESTAMP
WHERE ta.account_type = 'DEMO';

