-- V31: live delta after V29 so a teammate's fresh (or already-migrated) DB
-- matches this machine. Idempotent: updates by id, inserts use ON CONFLICT.

-- ─── 12@gmail.com (account 3) — debt / cash / commission as of this session ──
UPDATE trading_account SET
  balance = 0,
  equity = 722441.13300000,
  margin_used = 299647.79840000,
  free_margin = 561.32354641,
  borrowed_balance = 581.79645359,
  interest_accrued_total = 77.41937359,
  commission_paid_total = 65.20000000,
  last_interest_at = '2026-09-26 18:21:24.112977',
  updated_at = '2026-09-26 21:00:15.621496'
WHERE id = 3;

-- Positions closed here after V29 (ghost rows on a teammate copy)
DELETE FROM position WHERE id IN (48, 51);

-- New open EURUSD from this session
INSERT INTO position (id, trading_account_id, symbol_code, side, quantity, avg_price, realized_pnl, unrealized_pnl, opened_at)
VALUES (59, 3, 'EURUSD', 'LONG', 1.00000000, 1.14027000, 0.00000000, -17.00000000, '2026-09-26 21:00:14.742549')
ON CONFLICT (id) DO UPDATE SET
  quantity       = EXCLUDED.quantity,
  avg_price      = EXCLUDED.avg_price,
  realized_pnl   = EXCLUDED.realized_pnl,
  unrealized_pnl = EXCLUDED.unrealized_pnl,
  symbol_code    = EXCLUDED.symbol_code,
  side           = EXCLUDED.side;

-- Credit ledger rows written after V29
INSERT INTO margin_loan_ledger (id, trading_account_id, entry_type, amount, borrowed_after, balance_after, note, created_at)
VALUES
  (22, 3, 'REPAY',  985.75000000, 707.42645359,   0.00000000, 'Auto-repay from trade settlement',     '2026-09-26 19:41:43.14048'),
  (23, 3, 'REPAY',  985.75000000, 707.42645359,   0.00000000, 'Auto-repay from trade settlement',     '2026-09-26 19:54:06.333528'),
  (24, 3, 'REPAY',  707.42645359,   0.00000000, 561.32354641, 'Auto-repay from trade settlement',     '2026-09-26 20:59:45.408468'),
  (25, 3, 'BORROW', 581.79645359, 581.79645359,   0.00000000, 'Auto-borrow to cover trade shortfall', '2026-09-26 21:00:14.736419')
ON CONFLICT (id) DO NOTHING;

-- Keep sequences ahead of any explicit ids above (same rule as V30).
SELECT setval('position_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM position), 1), (SELECT last_value FROM position_id_seq)));
SELECT setval('margin_loan_ledger_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM margin_loan_ledger), 1), (SELECT last_value FROM margin_loan_ledger_id_seq)));
SELECT setval('broker_order_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM broker_order), 1), (SELECT last_value FROM broker_order_id_seq)));
SELECT setval('trading_account_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM trading_account), 1), (SELECT last_value FROM trading_account_id_seq)));
SELECT setval('app_user_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM app_user), 1), (SELECT last_value FROM app_user_id_seq)));
