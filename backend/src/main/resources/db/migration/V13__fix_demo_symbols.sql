-- Replace AAPL, MSFT, GOOGL demo trades with symbols available in Charts (forex/metals/crypto only).
-- Also fix V12 open positions that used AAPL.

DO $$
DECLARE
  replacement TEXT[][] := ARRAY[
    ARRAY['AAPL',  'NZDUSD',  '0.6020',  '0.15'],
    ARRAY['MSFT',  'USDCAD',  '1.3700',  '0.20'],
    ARRAY['GOOGL', 'SOLUSDT', '172.00',  '0.10']
  ];
  r          TEXT[];
  old_sym    TEXT;
  new_sym    TEXT;
  new_px     NUMERIC;
  new_qty    NUMERIC;
  acc_id     BIGINT;
  open_ts    TIMESTAMPTZ;
  close_ts   TIMESTAMPTZ;
  move_pct   NUMERIC;
  close_px   NUMERIC;
  pnl        NUMERIC;
BEGIN
  FOREACH r SLICE 1 IN ARRAY replacement LOOP
    old_sym := r[1];
    new_sym := r[2];
    new_px  := r[3]::NUMERIC;
    new_qty := r[4]::NUMERIC;

    -- Delete old demo orders for this symbol
    DELETE FROM broker_order WHERE symbol_code = old_sym;

    -- Delete open positions using this symbol
    DELETE FROM position WHERE symbol_code = old_sym;

    -- Re-insert 2 trade pairs per account using new symbol
    FOR acc_id IN SELECT id FROM trading_account LOOP
      -- Trade pair 1
      open_ts   := NOW() - (random() * INTERVAL '60 days') - INTERVAL '2 hours';
      move_pct  := (random() * 2.0 + 0.3) / 100;
      IF random() < 0.60 THEN
        close_px := ROUND((new_px * (1 + move_pct))::numeric, 5);
      ELSE
        close_px := ROUND((new_px * (1 - move_pct))::numeric, 5);
      END IF;
      pnl      := ROUND(((close_px - new_px) * new_qty)::numeric, 2);
      close_ts := open_ts + (random() * INTERVAL '6 hours') + INTERVAL '5 minutes';

      INSERT INTO broker_order (trading_account_id, symbol_code, side, order_type, status, quantity, entry_price, realized_pnl, created_at, filled_at, updated_at)
      VALUES (acc_id, new_sym, 'BUY',  'MARKET', 'FILLED', new_qty, ROUND(new_px, 5), NULL, open_ts, open_ts, open_ts);
      INSERT INTO broker_order (trading_account_id, symbol_code, side, order_type, status, quantity, entry_price, realized_pnl, created_at, filled_at, updated_at)
      VALUES (acc_id, new_sym, 'SELL', 'MARKET', 'FILLED', new_qty, close_px, pnl, close_ts, close_ts, close_ts);

      -- Trade pair 2
      open_ts   := NOW() - (random() * INTERVAL '30 days') - INTERVAL '1 hour';
      move_pct  := (random() * 1.8 + 0.2) / 100;
      IF random() < 0.55 THEN
        close_px := ROUND((new_px * (1 + move_pct))::numeric, 5);
      ELSE
        close_px := ROUND((new_px * (1 - move_pct))::numeric, 5);
      END IF;
      pnl      := ROUND(((close_px - new_px) * new_qty)::numeric, 2);
      close_ts := open_ts + (random() * INTERVAL '4 hours') + INTERVAL '3 minutes';

      INSERT INTO broker_order (trading_account_id, symbol_code, side, order_type, status, quantity, entry_price, realized_pnl, created_at, filled_at, updated_at)
      VALUES (acc_id, new_sym, 'BUY',  'MARKET', 'FILLED', new_qty, ROUND(new_px, 5), NULL, open_ts, open_ts, open_ts);
      INSERT INTO broker_order (trading_account_id, symbol_code, side, order_type, status, quantity, entry_price, realized_pnl, created_at, filled_at, updated_at)
      VALUES (acc_id, new_sym, 'SELL', 'MARKET', 'FILLED', new_qty, close_px, pnl, close_ts, close_ts, close_ts);
    END LOOP;
  END LOOP;
END;
$$;
