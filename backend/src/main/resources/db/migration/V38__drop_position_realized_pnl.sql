-- Closed-trade profit lives on the order. This column on an open position was never read.
ALTER TABLE position DROP COLUMN IF EXISTS realized_pnl;
