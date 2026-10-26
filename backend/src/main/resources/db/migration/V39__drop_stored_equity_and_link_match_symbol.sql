-- Account value and free cash are computed when a screen asks. The stored copies could disagree.
ALTER TABLE trading_account DROP COLUMN IF EXISTS equity;
ALTER TABLE trading_account DROP COLUMN IF EXISTS free_margin;

-- A match names a real instrument, the same way an order and a position already do.
ALTER TABLE internal_match
  ADD CONSTRAINT fk_internal_match_symbol
  FOREIGN KEY (symbol_code) REFERENCES symbol (code);
