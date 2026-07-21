-- Drop the unique constraint on (trading_account_id, symbol_code, side) to enable Hedging / Multiple Independent Positions per asset
ALTER TABLE position DROP CONSTRAINT IF EXISTS position_trading_account_id_symbol_code_side_key;
