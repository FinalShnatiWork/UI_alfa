-- V17__add_position_side.sql
-- Add side column to position table and update unique constraint

ALTER TABLE position DROP CONSTRAINT IF EXISTS position_trading_account_id_symbol_code_key;
ALTER TABLE position ADD COLUMN IF NOT EXISTS side VARCHAR(8) NOT NULL DEFAULT 'LONG';
ALTER TABLE position ADD CONSTRAINT position_trading_account_id_symbol_code_side_key UNIQUE (trading_account_id, symbol_code, side);
