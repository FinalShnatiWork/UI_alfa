-- V29: Live snapshot — syncs full DB state so any fresh install matches the dev environment.
-- AUTO-GENERATED from live DB. Re-run export script after each session to keep in sync.

-- ─── New users (added after V14) ────────────────────────────────────────────
INSERT INTO app_user (id, email, display_name, created_at, password_hash, role, banned)
VALUES
  (8,  'trader.hedge@broker.local', 'Hedge Trader (Multiple Gold Trades)',    '2026-07-24 03:59:44.866829', '$2a$10$nThCsjXyYJgfTYwLRHDBO.slfXYLKJuOl4EuFZxdtu3s8V8PTLYwO', 'USER', false),
  (9,  'trader.vip@broker.local',   'VIP Trader ($25k Credit Line)',          '2026-07-24 03:59:45.049029', '$2a$10$a1YXr6D/cRe5EFdCQVyxoO3LO9gn8jPS6Sgupj9SZtrd1qVgv/T9u', 'USER', false),
  (10, 'loan@broker.local',         'Loan Trader',                            '2026-07-24 03:59:45.177455', '$2a$10$.d6UuapGZ5bCsNKBYLdhbOXaRLVuxYRNlC.OIMTl6Q9oh5s7oSMIu', 'USER', false),
  (11, 'trader.risk@broker.local',  'High Risk Trader (Margin Call)',         '2026-07-24 03:59:45.309622', '$2a$10$DVRgGyPNKvpiX2pm514jeuYNnZ9wVPTXHwNXfLxWugH05xQdR/20m', 'USER', false),
  (15, '1@gmail.com',               '78 99',                                  '2026-07-26 13:54:24.167426', '$2a$10$OJjq3SFN6YXMNnPNGP/Uw.iBL4JppoAZvr6tdi8n51wk.X6uVGue2', 'USER', false)
ON CONFLICT (id) DO NOTHING;

-- ─── New trading accounts ────────────────────────────────────────────────────
INSERT INTO trading_account (id, user_id, account_type, currency, leverage, status, created_at, balance, equity, margin_used, free_margin, borrowed_balance, interest_accrued_total, commission_paid_total, updated_at)
VALUES
  (7,  8,  'DEMO', 'USD', 100, 'ACTIVE', '2026-07-24 03:59:44.901595',  5000.00,    5000.00,    755.50,    5000.00,    0.00,       0.00,  0.00, '2026-07-24 07:20:45.927'),
  (8,  9,  'DEMO', 'USD', 100, 'ACTIVE', '2026-07-24 03:59:45.058558',  15000.00,   15000.00,   327.50,    15000.00,   0.00,       0.00,  0.00, '2026-07-24 07:20:45.927'),
  (9,  10, 'DEMO', 'USD', 100, 'ACTIVE', '2026-07-24 03:59:45.186778',  2500.00,    2500.00,    32.85,     2500.00,    1530.22575, 47.73, 0.00, '2026-09-26 18:21:24.109'),
  (10, 11, 'DEMO', 'USD', 100, 'ACTIVE', '2026-07-24 03:59:45.319934',  280.00,     280.00,     32.85,     280.00,     0.00,       45.00, 0.01, '2026-07-24 07:20:45.927'),
  (14, 15, 'DEMO', 'USD', 100, 'ACTIVE', '2026-07-26 13:54:25.534555',  100000.00,  100000.00,  0.00,      100000.00,  0.00,       0.00,  0.00, '2026-07-26 13:54:25.534')
ON CONFLICT (id) DO NOTHING;

-- ─── Update existing accounts with current balances + debt ──────────────────
UPDATE trading_account SET
  balance = 99997.67543, equity = 99997.67543, margin_used = 2660.47240,
  free_margin = 99997.67543, borrowed_balance = 0, interest_accrued_total = 0,
  commission_paid_total = 3.31, updated_at = '2026-07-24 07:20:45.927'
WHERE id = 1;

UPDATE trading_account SET
  balance = 99979.39, equity = 99979.39, margin_used = 0,
  free_margin = 99979.39, borrowed_balance = 0, interest_accrued_total = 0,
  commission_paid_total = 2.99, updated_at = '2026-07-24 07:20:45.927'
WHERE id = 2;

UPDATE trading_account SET
  balance = 0, equity = 490013.48, margin_used = 299647.79840,
  free_margin = 0, borrowed_balance = 1693.17645359, interest_accrued_total = 77.41937359,
  commission_paid_total = 56.65, last_interest_at = '2026-09-26 18:21:24.112977',
  updated_at = '2026-09-26 18:39:32.684479'
WHERE id = 3;

UPDATE trading_account SET
  balance = 100230.68746, equity = 100230.68746, margin_used = 1401.21110,
  free_margin = 100230.68746, borrowed_balance = 0, interest_accrued_total = 0,
  commission_paid_total = 3.46, updated_at = '2026-07-24 07:20:45.927'
WHERE id = 4;

UPDATE trading_account SET
  balance = 100000.00, equity = 100000.00, margin_used = 334.55570,
  free_margin = 100000.00, borrowed_balance = 0, interest_accrued_total = 0,
  commission_paid_total = 3.09, updated_at = '2026-07-24 07:20:45.927'
WHERE id = 5;

UPDATE trading_account SET
  balance = 100000.00, equity = 100000.00, margin_used = 341.10490,
  free_margin = 100000.00, borrowed_balance = 0, interest_accrued_total = 0,
  commission_paid_total = 3.44, updated_at = '2026-07-24 07:20:45.927'
WHERE id = 6;

-- ─── Open positions (current live state) ────────────────────────────────────
INSERT INTO position (id, trading_account_id, symbol_code, side, quantity, avg_price, realized_pnl, unrealized_pnl, opened_at)
VALUES
  (5,  3, 'SOLUSD',  'LONG', 0.60,   169.24000,      0.00,  0.00, '2026-05-28 07:44:15.783996'),
  (6,  3, 'EURUSD',  'LONG', 6.00,   1.16889250,    -0.02,  0.00, '2026-06-01 13:37:18.30445'),
  (7,  5, 'EURUSD',  'LONG', 0.20,   1.06928000,     0.00,  0.00, '2026-06-01 06:59:06.753908'),
  (8,  5, 'BTCUSDT', 'LONG', 0.01,   64481.34042,    0.00,  0.00, '2026-05-26 01:38:47.251922'),
  (9,  5, 'XAUUSD',  'LONG', 0.05,   2285.03067,     0.00,  0.00, '2026-05-30 20:05:53.297585'),
  (10, 6, 'EURUSD',  'LONG', 0.20,   1.10276000,     0.00,  0.00, '2026-05-30 06:24:15.26479'),
  (11, 6, 'BTCUSDT', 'LONG', 0.01,   65270.73059,    0.00,  0.00, '2026-05-29 18:25:53.954703'),
  (12, 6, 'XAUUSD',  'LONG', 0.05,   2280.51588,     0.00,  0.00, '2026-05-29 07:50:45.954186'),
  (13, 4, 'EURUSD',  'LONG', 1.20,   1.16237333,     0.00,  0.00, '2026-05-27 04:48:08.906377'),
  (14, 4, 'BTCUSDT', 'LONG', 0.01,   63631.05394,    0.00,  0.00, '2026-05-29 18:47:29.061168'),
  (16, 1, 'EURUSD',  'LONG', 2.20,   1.15455455,     0.00,  0.00, '2026-05-27 18:00:29.14784'),
  (17, 1, 'BTCUSDT', 'LONG', 0.01,   64883.66189,    0.00,  0.00, '2026-05-27 11:37:50.850453'),
  (18, 1, 'XAUUSD',  'LONG', 0.05,   2279.28060,     0.00,  0.00, '2026-06-01 20:14:13.442214'),
  (19, 3, 'ETHUSD',  'LONG', 1.00,   2412.30000,     0.00,  0.00, '2026-06-01 22:39:46.717336'),
  (20, 3, 'USDCAD',  'LONG', 1.00,   1.17553000,     0.00,  0.00, '2026-06-02 11:04:19.903016'),
  (21, 3, 'USDJPY',  'LONG', 1.00,   158.80400000,   0.00,  0.00, '2026-06-02 11:04:28.852463'),
  (22, 3, 'NZDUSD',  'LONG', 1.00,   1.17985000,     0.00,  0.00, '2026-06-02 11:04:36.538108'),
  (23, 7, 'XAUUSD',  'LONG', 0.10,   2400.00000,     0.00,  0.00, '2026-07-24 03:59:44.912354'),
  (24, 7, 'XAUUSD',  'LONG', 0.20,   2415.00000,     0.00,  0.00, '2026-07-24 03:59:44.918815'),
  (25, 7, 'BTCUSD',  'LONG', 0.05,   65000.00000,    0.00,  0.00, '2026-07-24 03:59:44.925529'),
  (26, 8, 'BTCUSD',  'LONG', 0.50,   65500.00000,    0.00,  0.00, '2026-07-24 03:59:45.065593'),
  (27, 9, 'BTCUSD',  'LONG', 0.05,   65700.00000,    0.00,  0.00, '2026-07-24 03:59:45.205815'),
  (30, 10,'BTCUSD',  'LONG', 0.05,   65700.00000,    0.00,  0.00, '2026-07-24 04:07:30.09448'),
  (31, 3, 'XAGUSD',  'LONG', 5.00,   57.55500,       0.00,  0.00, '2026-07-24 04:09:30.538545'),
  (32, 3, 'XAGUSD',  'LONG', 5.00,   57.55500,       0.00,  0.00, '2026-07-24 04:09:36.356768'),
  (33, 3, 'XAUUSD',  'LONG', 5.00,   4032.00000,     0.00,  0.00, '2026-07-24 04:09:49.619408'),
  (34, 3, 'XAUUSD',  'LONG', 5.00,   4032.00000,     0.00,  0.00, '2026-07-24 04:09:50.899339'),
  (36, 3, 'XAUUSD',  'LONG', 10.30,  4031.60000,     0.00,  0.00, '2026-07-24 04:10:11.328194'),
  (37, 3, 'BTCUSD',  'LONG', 1.00,   101988.00000,   0.00,  0.00, '2026-07-24 04:10:26.386831'),
  (38, 3, 'BTCUSD',  'LONG', 2.00,   102266.92000,   0.00,  0.00, '2026-07-24 04:10:34.335941'),
  (39, 3, 'BTCUSD',  'LONG', 2.00,   103863.76000,   0.00,  0.00, '2026-07-24 04:10:39.884984'),
  (40, 3, 'BTCUSD',  'LONG', 2.00,   102561.94000,   0.00,  0.00, '2026-07-24 04:10:43.697949'),
  (41, 3, 'BTCUSD',  'LONG', 2.00,   103384.25000,   0.00,  0.00, '2026-07-24 04:10:45.26858'),
  (42, 3, 'BTCUSD',  'LONG', 3.10,   103146.39000,   0.00,  0.00, '2026-07-24 04:10:51.483898'),
  (43, 3, 'XRPUSD',  'LONG', 3.10,   2.41840000,     0.00,  0.00, '2026-07-24 04:11:18.451903'),
  (44, 3, 'XRPUSD',  'LONG', 3.10,   2.38807000,     0.00,  0.00, '2026-07-24 04:11:21.196501'),
  (45, 3, 'XRPUSD',  'LONG', 3.10,   2.38807000,     0.00,  0.00, '2026-07-24 04:11:22.356429'),
  (46, 3, 'XRPUSD',  'LONG', 3.10,   2.38807000,     0.00,  0.00, '2026-07-24 04:11:23.403781'),
  (47, 3, 'EURUSD',  'LONG', 1.00,   1.13860000,     0.00,  0.00, '2026-07-24 04:11:33.31789'),
  (48, 3, 'EURUSD',  'LONG', 1.00,   1.13860000,     0.00,  0.00, '2026-07-24 04:11:38.09025'),
  (49, 3, 'EURUSD',  'SHORT',1.00,   1.13860000,     0.00,  0.00, '2026-07-24 04:12:21.468533'),
  (50, 3, 'EURUSD',  'SHORT',1.00,   1.13860000,     0.00,  0.00, '2026-07-24 04:12:27.721996'),
  (51, 3, 'EURUSD',  'SHORT',1.00,   1.13860000,     0.00,  0.00, '2026-07-24 04:12:41.312349')
ON CONFLICT (id) DO UPDATE SET
  quantity      = EXCLUDED.quantity,
  avg_price     = EXCLUDED.avg_price,
  realized_pnl  = EXCLUDED.realized_pnl,
  unrealized_pnl= EXCLUDED.unrealized_pnl;

-- ─── Margin loan ledger (full audit trail) ───────────────────────────────────
INSERT INTO margin_loan_ledger (id, trading_account_id, entry_type, amount, borrowed_after, balance_after, note, created_at)
VALUES
  (1,  9,  'BORROW',      1500.00000000,   1500.00000000,   2500.00000000, 'Standard margin credit line utilization',             '2026-07-24 03:59:45.197234'),
  (2,  10, 'REPAY',       1927.11800000,   1472.88200000,    280.00000000, 'Auto-repay from trade settlement',                    '2026-07-24 03:59:55.442169'),
  (3,  10, 'LIQUIDATION', 1472.88200000,   1472.88200000,    280.00000000, 'Liquidation complete — 1 position(s) closed; residual debt written off', '2026-07-24 03:59:55.456906'),
  (4,  3,  'BORROW',       425.36708000,    425.36708000,      0.00000000, 'Auto-borrow to cover trade shortfall',                '2026-07-24 04:12:27.716691'),
  (5,  3,  'BORROW',      1138.83000000,   1564.19708000,      0.00000000, 'Auto-borrow to cover trade shortfall',                '2026-07-24 04:12:41.308899'),
  (6,  3,  'BORROW',      1138.93000000,   2703.12708000,      0.00000000, 'Auto-borrow to cover trade shortfall',                '2026-07-24 04:13:49.466517'),
  (7,  3,  'BORROW',      1138.93000000,   3842.05708000,      0.00000000, 'Auto-borrow to cover trade shortfall',                '2026-07-24 04:13:52.478768'),
  (8,  9,  'INTEREST',       7.50000000,   1507.50000000,   2500.00000000, 'Daily interest charge (0.5%/day)',                    '2026-07-26 12:11:59.583315'),
  (9,  3,  'INTEREST',      19.21028540,   3861.26736540,      0.00000000, 'Daily interest charge (0.5%/day)',                    '2026-07-26 12:11:59.603667'),
  (10, 9,  'INTEREST',       7.53750000,   1515.03750000,   2500.00000000, 'Daily interest charge (0.5%/day)',                    '2026-08-29 19:56:12.951909'),
  (11, 3,  'INTEREST',      19.30633683,   3880.57370223,      0.00000000, 'Daily interest charge (0.5%/day)',                    '2026-08-29 19:56:12.977144'),
  (12, 9,  'INTEREST',       7.57518750,   1522.61268750,   2500.00000000, 'Daily interest charge (0.5%/day)',                    '2026-09-19 18:45:48.045678'),
  (13, 3,  'INTEREST',      19.40286851,   3899.97657074,      0.00000000, 'Daily interest charge (0.5%/day)',                    '2026-09-19 18:45:48.065776'),
  (14, 9,  'INTEREST',       7.61306344,   1530.22575094,   2500.00000000, 'Daily interest charge (0.5%/day)',                    '2026-09-26 18:21:24.091203'),
  (15, 3,  'INTEREST',      19.49988285,   3919.47645359,      0.00000000, 'Daily interest charge (0.5%/day)',                    '2026-09-26 18:21:24.113514'),
  (16, 3,  'REPAY',        995.85000000,   2923.62645359,      0.00000000, 'Auto-repay from trade settlement',                    '2026-09-26 18:22:17.130873'),
  (17, 3,  'BORROW',      1143.12000000,   4066.74645359,      0.00000000, 'Auto-borrow to cover trade shortfall',                '2026-09-26 18:22:30.08627'),
  (18, 3,  'BORROW',      1143.12000000,   5209.86645359,      0.00000000, 'Auto-borrow to cover trade shortfall',                '2026-09-26 18:22:33.348921'),
  (19, 3,  'REPAY',       1120.42000000,   4089.44645359,      0.00000000, 'Auto-repay from trade settlement',                    '2026-09-26 18:39:22.029097'),
  (20, 3,  'REPAY',       1120.42000000,   2969.02645359,      0.00000000, 'Auto-repay from trade settlement',                    '2026-09-26 18:39:27.57359'),
  (21, 3,  'REPAY',       1275.85000000,   1693.17645359,      0.00000000, 'Auto-repay from trade settlement',                    '2026-09-26 18:39:31.454477')
ON CONFLICT (id) DO NOTHING;

-- ─── New order for loan trader ───────────────────────────────────────────────
INSERT INTO broker_order (id, trading_account_id, symbol_code, side, order_type, status, quantity, entry_price, realized_pnl, commission, nn_route_recommendation, created_at, updated_at)
VALUES (365, 10, 'BTCUSD', 'SELL', 'MARKET', 'FILLED', 0.05, 103585.36, 1894.268, 0.01, 'LEGACY', '2026-07-24 03:59:55.446835', '2026-07-24 03:59:55.446835')
ON CONFLICT (id) DO NOTHING;
