-- Restate what an internal match saved. The old rows stored a flat $1.50 per side ($3).
-- Crypto now saves 0.10% of notional on each side. Forex and metals save $3.50 per lot per side.
UPDATE internal_match
SET external_fee_saved = CASE
  WHEN UPPER(symbol_code) LIKE '%BTC%'
    OR UPPER(symbol_code) LIKE '%ETH%'
    OR UPPER(symbol_code) LIKE '%SOL%'
    OR UPPER(symbol_code) LIKE '%XRP%'
  THEN ROUND(
    mid * quantity * (
      CASE
        WHEN UPPER(symbol_code) LIKE '%BTC%' OR UPPER(symbol_code) LIKE '%ETH%' THEN 1
        WHEN UPPER(symbol_code) LIKE '%SOL%' THEN 100
        WHEN UPPER(symbol_code) LIKE '%XRP%' THEN 1000
        ELSE 1
      END
    ) * 0.001, 2) * 2
  ELSE ROUND(quantity * 3.50, 2) * 2
END;
