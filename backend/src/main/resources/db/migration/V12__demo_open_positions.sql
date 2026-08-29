-- Add open positions for accounts that have none, so the Positions/Dashboard pages show live data.
DO $$
DECLARE
  acc_id     BIGINT;
  sym        TEXT;
  qty        NUMERIC;
  avg_px     NUMERIC;
  open_ts    TIMESTAMPTZ;
  pos_data   TEXT[][] := ARRAY[
    ARRAY['EURUSD',  '1.0850', '0.20'],
    ARRAY['BTCUSDT', '64500.00', '0.01'],
    ARRAY['XAUUSD',  '2310.00', '0.05'],
    ARRAY['GBPUSD',  '1.2700', '0.15'],
    ARRAY['AAPL',    '185.00', '0.50']
  ];
  i INT;
BEGIN
  FOR acc_id IN
    SELECT ta.id FROM trading_account ta
    WHERE NOT EXISTS (SELECT 1 FROM position p WHERE p.trading_account_id = ta.id)
  LOOP
    FOR i IN 1..3 LOOP
      sym    := pos_data[i][1];
      avg_px := pos_data[i][2]::NUMERIC * (0.98 + random() * 0.04);  -- slight price variation
      qty    := pos_data[i][3]::NUMERIC;
      open_ts := NOW() - (random() * INTERVAL '7 days') - INTERVAL '1 hour';

      -- Create open position record
      INSERT INTO position (trading_account_id, symbol_code, quantity, avg_price, realized_pnl, unrealized_pnl, opened_at, updated_at)
      VALUES (acc_id, sym, qty, ROUND(avg_px::numeric, 5), 0, 0, open_ts, open_ts)
      ON CONFLICT (trading_account_id, symbol_code) DO NOTHING;

      -- Create matching BUY order in history
      INSERT INTO broker_order (trading_account_id, symbol_code, side, order_type, status, quantity, entry_price, realized_pnl, created_at, filled_at, updated_at)
      VALUES (acc_id, sym, 'BUY', 'MARKET', 'FILLED', qty, ROUND(avg_px::numeric, 5), NULL, open_ts, open_ts, open_ts);
    END LOOP;
  END LOOP;
END;
$$;
