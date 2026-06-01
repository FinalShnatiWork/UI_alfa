-- Demo trades for all trading accounts so the History page shows realistic data.
-- Generates ~20 completed trade pairs (BUY+SELL) per account.
DO $$
DECLARE
  acc_id    BIGINT;
  symbols   TEXT[]  := ARRAY['EURUSD','GBPUSD','XAUUSD','BTCUSDT','ETHUSDT','AAPL','MSFT','GOOGL','USDJPY','XAGUSD'];
  base_px   NUMERIC[] := ARRAY[1.0850, 1.2700, 2310.00, 64500.00, 3150.00, 185.00, 415.00, 175.00, 154.50, 28.50];
  sym       TEXT;
  open_px   NUMERIC;
  close_px  NUMERIC;
  qty       NUMERIC;
  pnl       NUMERIC;
  move_pct  NUMERIC;
  open_ts   TIMESTAMPTZ;
  close_ts  TIMESTAMPTZ;
  i         INT;
  sym_idx   INT;
BEGIN
  FOR acc_id IN SELECT id FROM trading_account LOOP
    FOR i IN 1..20 LOOP
      -- Pick symbol cyclically with some variation per account + trade index
      sym_idx  := ((acc_id * 3 + i) % array_length(symbols, 1)) + 1;
      sym      := symbols[sym_idx];
      open_px  := base_px[sym_idx];

      -- Random quantity: 0.01 to 0.50 lots
      qty      := ROUND((0.01 + random() * 0.49)::numeric, 2);

      -- Random price move: ±0.3% to ±2.5%
      move_pct := (random() * 2.2 + 0.3) / 100;
      -- ~60% chance of profit
      IF random() < 0.60 THEN
        close_px := ROUND((open_px * (1 + move_pct))::numeric, 5);
      ELSE
        close_px := ROUND((open_px * (1 - move_pct))::numeric, 5);
      END IF;

      pnl := ROUND(((close_px - open_px) * qty)::numeric, 2);

      -- Spread trades across last 90 days
      open_ts  := NOW() - (random() * INTERVAL '90 days') - INTERVAL '1 hour';
      close_ts := open_ts + (random() * INTERVAL '8 hours') + INTERVAL '5 minutes';

      -- BUY order
      INSERT INTO broker_order
        (trading_account_id, symbol_code, side, order_type, status, quantity,
         entry_price, realized_pnl, created_at, filled_at, updated_at)
      VALUES
        (acc_id, sym, 'BUY', 'MARKET', 'FILLED', qty,
         open_px, NULL, open_ts, open_ts, open_ts);

      -- SELL order (close)
      INSERT INTO broker_order
        (trading_account_id, symbol_code, side, order_type, status, quantity,
         entry_price, realized_pnl, created_at, filled_at, updated_at)
      VALUES
        (acc_id, sym, 'SELL', 'MARKET', 'FILLED', qty,
         close_px, pnl, close_ts, close_ts, close_ts);

    END LOOP;
  END LOOP;
END;
$$;
