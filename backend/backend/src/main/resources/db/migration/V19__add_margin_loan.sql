-- V19: Margin credit line (auto-borrow on insufficient funds, daily interest, liquidation)

ALTER TABLE trading_account ADD COLUMN borrowed_balance NUMERIC(18, 8) NOT NULL DEFAULT 0;
ALTER TABLE trading_account ADD COLUMN interest_accrued_total NUMERIC(18, 8) NOT NULL DEFAULT 0;
ALTER TABLE trading_account ADD COLUMN last_interest_at TIMESTAMP;

CREATE TABLE margin_loan_ledger (
  id BIGSERIAL PRIMARY KEY,
  trading_account_id BIGINT NOT NULL REFERENCES trading_account(id) ON DELETE CASCADE,
  entry_type VARCHAR(20) NOT NULL,
  amount NUMERIC(18, 8) NOT NULL,
  borrowed_after NUMERIC(18, 8) NOT NULL,
  balance_after NUMERIC(18, 8) NOT NULL,
  note VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_margin_loan_ledger_account ON margin_loan_ledger(trading_account_id);
CREATE INDEX idx_margin_loan_ledger_created ON margin_loan_ledger(created_at);
