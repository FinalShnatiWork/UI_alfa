-- Add entry_price and realized_pnl to broker_order for accurate trade history.
ALTER TABLE broker_order ADD COLUMN IF NOT EXISTS entry_price NUMERIC(18,8);
ALTER TABLE broker_order ADD COLUMN IF NOT EXISTS realized_pnl NUMERIC(18,8);
