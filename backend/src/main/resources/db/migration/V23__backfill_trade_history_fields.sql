-- V23: Backfill incomplete trade-history / account fields introduced by later features
-- (commission, open_price/opened_at, NN routing, margin columns, trade_fill fees).
--
-- Old rows were created with DEFAULT 0 / NULL and never rewritten. This migration
-- reconstructs what we can from existing data so History + admin stats are usable.
-- It does NOT invent fake P/L for unpaired opens.

-- ── helpers: contract size + asset multiplier (mirrors BrokerApiController / TradingFees) ──
CREATE OR REPLACE FUNCTION v23_contract_size(sym TEXT)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN upper(coalesce(sym, '')) LIKE '%BTC%' OR upper(coalesce(sym, '')) LIKE '%ETH%' THEN 1::numeric
    WHEN upper(coalesce(sym, '')) LIKE '%SOL%' THEN 100::numeric
    WHEN upper(coalesce(sym, '')) LIKE '%XRP%' THEN 1000::numeric
    WHEN upper(coalesce(sym, '')) LIKE '%XAU%' THEN 100::numeric
    WHEN upper(coalesce(sym, '')) LIKE '%XAG%' THEN 5000::numeric
    ELSE 100000::numeric
  END;
$$;

CREATE OR REPLACE FUNCTION v23_asset_multiplier(sym TEXT)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN upper(coalesce(sym, '')) LIKE '%BTC%'
      OR upper(coalesce(sym, '')) LIKE '%ETH%'
      OR upper(coalesce(sym, '')) LIKE '%SOL%' THEN 1.2::numeric
    WHEN upper(coalesce(sym, '')) LIKE '%XAU%'
      OR upper(coalesce(sym, '')) LIKE '%XAG%' THEN 1.1::numeric
    ELSE 1::numeric
  END;
$$;

-- Dynamic commission (same formula as TradingFees.calculateCommission)
CREATE OR REPLACE FUNCTION v23_calc_commission(sym TEXT, qty NUMERIC, px NUMERIC)
RETURNS NUMERIC LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  notional NUMERIC;
  fee NUMERIC;
  max_fee NUMERIC;
BEGIN
  IF qty IS NULL OR qty <= 0 OR px IS NULL OR px <= 0 THEN
    RETURN 1.50; -- fallback COMMISSION_PER_TRADE
  END IF;
  notional := px * qty * v23_contract_size(sym);
  fee := round(notional * 0.000002 * v23_asset_multiplier(sym), 2);
  max_fee := least(round(qty * 1.00, 2), 15.00);
  IF fee > max_fee THEN
    fee := max_fee;
  END IF;
  IF fee < 0 THEN
    fee := 0;
  END IF;
  RETURN fee;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) entry_price / filled_at from trade_fill or timestamps
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE broker_order bo
SET entry_price = tf.price
FROM (
  SELECT DISTINCT ON (order_id) order_id, price
  FROM trade_fill
  ORDER BY order_id, executed_at DESC, id DESC
) tf
WHERE bo.id = tf.order_id
  AND bo.entry_price IS NULL
  AND tf.price IS NOT NULL
  AND tf.price > 0;

UPDATE broker_order
SET filled_at = coalesce(filled_at, created_at)
WHERE status = 'FILLED' AND filled_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Pair closers (realized_pnl set) with FIFO openers → open_price / opened_at
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  closer RECORD;
  opener RECORD;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS v23_used_openers (id BIGINT PRIMARY KEY) ON COMMIT DROP;
  DELETE FROM v23_used_openers;

  -- Reserve openers already linked by a prior closer that has open_price/opened_at.
  INSERT INTO v23_used_openers(id)
  SELECT DISTINCT ON (o.id) o.id
  FROM broker_order c
  JOIN broker_order o
    ON o.trading_account_id = c.trading_account_id
   AND o.symbol_code = c.symbol_code
   AND o.status = 'FILLED'
   AND o.realized_pnl IS NULL
   AND o.side = CASE WHEN upper(c.side) = 'SELL' THEN 'BUY' ELSE 'SELL' END
   AND o.entry_price = c.open_price
   AND coalesce(o.filled_at, o.created_at) = c.opened_at
  WHERE c.status = 'FILLED'
    AND c.realized_pnl IS NOT NULL
    AND c.open_price IS NOT NULL
    AND c.opened_at IS NOT NULL
  ORDER BY o.id, c.id
  ON CONFLICT DO NOTHING;

  FOR closer IN
    SELECT id, trading_account_id, symbol_code, side, filled_at, created_at, open_price, opened_at
    FROM broker_order
    WHERE status = 'FILLED'
      AND realized_pnl IS NOT NULL
      AND (open_price IS NULL OR opened_at IS NULL)
    ORDER BY coalesce(filled_at, created_at), id
  LOOP
    SELECT o.id, o.entry_price, o.filled_at, o.created_at
      INTO opener
    FROM broker_order o
    WHERE o.trading_account_id = closer.trading_account_id
      AND o.symbol_code = closer.symbol_code
      AND o.status = 'FILLED'
      AND o.realized_pnl IS NULL
      AND o.side = CASE WHEN upper(closer.side) = 'SELL' THEN 'BUY' ELSE 'SELL' END
      AND o.id <> closer.id
      AND o.entry_price IS NOT NULL
      AND coalesce(o.filled_at, o.created_at) <= coalesce(closer.filled_at, closer.created_at)
      AND o.id NOT IN (SELECT id FROM v23_used_openers)
    ORDER BY coalesce(o.filled_at, o.created_at), o.id
    LIMIT 1;

    IF FOUND THEN
      UPDATE broker_order
      SET open_price = coalesce(open_price, opener.entry_price),
          opened_at  = coalesce(opened_at, opener.filled_at, opener.created_at)
      WHERE id = closer.id;
      INSERT INTO v23_used_openers(id) VALUES (opener.id) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Commission on FILLED orders that still have 0
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE broker_order
SET commission = v23_calc_commission(
    symbol_code,
    quantity,
    coalesce(entry_price, limit_price, stop_price)
  )
WHERE status = 'FILLED'
  AND (commission IS NULL OR commission = 0)
  AND coalesce(entry_price, limit_price, stop_price) IS NOT NULL
  AND coalesce(entry_price, limit_price, stop_price) > 0;

-- Pending/cancelled with reservation price but zero commission: leave 0 (fee charged on fill only).

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) trade_fill rows + fees
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE trade_fill tf
SET fee = bo.commission
FROM broker_order bo
WHERE tf.order_id = bo.id
  AND (tf.fee IS NULL OR tf.fee = 0)
  AND bo.commission > 0;

INSERT INTO trade_fill (order_id, price, quantity, fee, liquidity, executed_at)
SELECT
  bo.id,
  bo.entry_price,
  bo.quantity,
  coalesce(bo.commission, 0),
  'TAKER',
  coalesce(bo.filled_at, bo.created_at)
FROM broker_order bo
WHERE bo.status = 'FILLED'
  AND bo.entry_price IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM trade_fill tf WHERE tf.order_id = bo.id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) NN routing markers for pre-NN history (so admin filters aren't blank)
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE broker_order
SET nn_route_recommendation = 'LEGACY',
    nn_match_prob = coalesce(nn_match_prob, 0),
    nn_expected_savings = coalesce(nn_expected_savings, 0)
WHERE status IN ('FILLED', 'CANCELLED')
  AND nn_route_recommendation IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) Account aggregates: commission total, margin_used, free_margin, equity
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE trading_account ta
SET commission_paid_total = coalesce((
  SELECT sum(bo.commission) FROM broker_order bo WHERE bo.trading_account_id = ta.id
), 0);

UPDATE trading_account ta
SET margin_used = coalesce((
  SELECT round(sum(
    coalesce(p.avg_price, 0) * coalesce(p.quantity, 0) * v23_contract_size(p.symbol_code)
      / greatest(ta.leverage, 1)
  ), 4)
  FROM position p
  WHERE p.trading_account_id = ta.id
    AND coalesce(p.quantity, 0) <> 0
), 0);

-- Prepaid-margin model: cash balance already excludes locked margin.
UPDATE trading_account
SET free_margin = balance,
    equity = balance,
    updated_at = CURRENT_TIMESTAMP;

-- ═══════════════════════════════════════════════════════════════════════════
-- cleanup helpers (keep DB tidy; logic lives in Java going forward)
-- ═══════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS v23_calc_commission(TEXT, NUMERIC, NUMERIC);
DROP FUNCTION IF EXISTS v23_contract_size(TEXT);
DROP FUNCTION IF EXISTS v23_asset_multiplier(TEXT);
