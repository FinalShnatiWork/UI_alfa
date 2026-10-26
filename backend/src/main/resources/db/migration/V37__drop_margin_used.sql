-- Occupied margin is derived from open positions. The stored column was never updated by trades.
ALTER TABLE trading_account DROP COLUMN IF EXISTS margin_used;
