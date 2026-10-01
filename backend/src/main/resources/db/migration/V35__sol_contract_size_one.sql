-- SOL used a contract size of 100, so an open position's floating profit was
-- 100 times a one-coin move. BTC and ETH are size 1. Closed SOL rows were
-- already stored as a one-coin move, so only the open mark is scaled.
UPDATE position
SET unrealized_pnl = round(unrealized_pnl / 100, 8)
WHERE upper(symbol_code) LIKE '%SOL%';

CREATE OR REPLACE FUNCTION v23_contract_size(sym TEXT)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN upper(coalesce(sym, '')) LIKE '%BTC%'
      OR upper(coalesce(sym, '')) LIKE '%ETH%'
      OR upper(coalesce(sym, '')) LIKE '%SOL%' THEN 1::numeric
    WHEN upper(coalesce(sym, '')) LIKE '%XRP%' THEN 1000::numeric
    WHEN upper(coalesce(sym, '')) LIKE '%XAU%' THEN 100::numeric
    WHEN upper(coalesce(sym, '')) LIKE '%XAG%' THEN 5000::numeric
    ELSE 100000::numeric
  END;
$$;
