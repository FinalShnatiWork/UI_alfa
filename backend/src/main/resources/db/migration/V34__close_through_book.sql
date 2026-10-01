-- A close (manual, stop, or liquidation) can wait on the internal book.
-- The column remembers which open position that order is closing.
ALTER TABLE broker_order ADD COLUMN IF NOT EXISTS closes_position_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_broker_order_closes_position ON broker_order (closes_position_id);
