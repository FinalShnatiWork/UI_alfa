-- Broker-like demo core tables (no real payments/people).

CREATE TABLE IF NOT EXISTS trading_account (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  account_type VARCHAR(16) NOT NULL DEFAULT 'DEMO', -- DEMO / REAL (demo-only here)
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  leverage INT NOT NULL DEFAULT 100,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE / DISABLED
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trading_account_user ON trading_account(user_id);

CREATE TABLE IF NOT EXISTS symbol (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE, -- e.g. BTCUSDT, EURUSDT, AAPL
  kind VARCHAR(16) NOT NULL,        -- CRYPTO / FX / STOCK
  base_currency VARCHAR(8),
  quote_currency VARCHAR(8),
  price_decimals INT NOT NULL DEFAULT 2,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_symbol_kind_enabled ON symbol(kind, enabled);

CREATE TABLE IF NOT EXISTS broker_order (
  id BIGSERIAL PRIMARY KEY,
  trading_account_id BIGINT NOT NULL REFERENCES trading_account(id) ON DELETE CASCADE,
  symbol_code VARCHAR(32) NOT NULL REFERENCES symbol(code),
  side VARCHAR(8) NOT NULL,         -- BUY / SELL
  order_type VARCHAR(16) NOT NULL,  -- MARKET / LIMIT / STOP / STOP_LIMIT
  status VARCHAR(24) NOT NULL DEFAULT 'NEW', -- NEW / PARTIALLY_FILLED / FILLED / CANCELED / REJECTED / EXPIRED
  quantity NUMERIC(18,8) NOT NULL,
  limit_price NUMERIC(18,8),
  stop_price NUMERIC(18,8),
  take_profit NUMERIC(18,8),
  stop_loss NUMERIC(18,8),
  client_tag VARCHAR(64),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  filled_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_broker_order_account_created ON broker_order(trading_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broker_order_symbol_created ON broker_order(symbol_code, created_at DESC);

CREATE TABLE IF NOT EXISTS trade_fill (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES broker_order(id) ON DELETE CASCADE,
  price NUMERIC(18,8) NOT NULL,
  quantity NUMERIC(18,8) NOT NULL,
  fee NUMERIC(18,8) NOT NULL DEFAULT 0,
  liquidity VARCHAR(8), -- MAKER / TAKER (demo)
  executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trade_fill_order_executed ON trade_fill(order_id, executed_at DESC);

CREATE TABLE IF NOT EXISTS position (
  id BIGSERIAL PRIMARY KEY,
  trading_account_id BIGINT NOT NULL REFERENCES trading_account(id) ON DELETE CASCADE,
  symbol_code VARCHAR(32) NOT NULL REFERENCES symbol(code),
  quantity NUMERIC(18,8) NOT NULL DEFAULT 0,
  avg_price NUMERIC(18,8),
  realized_pnl NUMERIC(18,8) NOT NULL DEFAULT 0,
  unrealized_pnl NUMERIC(18,8) NOT NULL DEFAULT 0,
  opened_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (trading_account_id, symbol_code)
);

CREATE INDEX IF NOT EXISTS idx_position_account ON position(trading_account_id);

CREATE TABLE IF NOT EXISTS account_transaction (
  id BIGSERIAL PRIMARY KEY,
  trading_account_id BIGINT NOT NULL REFERENCES trading_account(id) ON DELETE CASCADE,
  tx_type VARCHAR(16) NOT NULL,   -- DEPOSIT / WITHDRAWAL / ADJUSTMENT / BONUS
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING', -- PENDING / APPROVED / REJECTED
  amount NUMERIC(18,8) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  method VARCHAR(32),             -- card / bank / crypto / internal (demo)
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_account_transaction_account_created ON account_transaction(trading_account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS kyc_case (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'NOT_STARTED', -- NOT_STARTED / SUBMITTED / VERIFIED / REJECTED
  submitted_at TIMESTAMP,
  reviewed_at TIMESTAMP,
  note TEXT,
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS notification (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  notif_type VARCHAR(32) NOT NULL, -- PRICE_ALERT / SYSTEM / TRADE / KYC (demo)
  title VARCHAR(128) NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notification_user_created ON notification(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES app_user(id) ON DELETE SET NULL,
  action VARCHAR(64) NOT NULL,   -- LOGIN / LOGOUT / CREATE_ORDER / UPDATE_SETTINGS / ADMIN_VIEW (demo)
  detail TEXT,
  ip VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_created ON audit_log(user_id, created_at DESC);

-- Seed minimal demo data (re-usable; safe to run multiple times).
INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals)
SELECT 'BTCUSDT', 'CRYPTO', 'BTC', 'USDT', 2
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code = 'BTCUSDT');

INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals)
SELECT 'ETHUSDT', 'CRYPTO', 'ETH', 'USDT', 2
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code = 'ETHUSDT');

INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals)
SELECT 'SOLUSDT', 'CRYPTO', 'SOL', 'USDT', 4
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code = 'SOLUSDT');

INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals)
SELECT 'EURUSDT', 'FX', 'EUR', 'USDT', 5
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code = 'EURUSDT');

INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals)
SELECT 'GBPUSDT', 'FX', 'GBP', 'USDT', 5
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code = 'GBPUSDT');

INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals)
SELECT 'AUDUSDT', 'FX', 'AUD', 'USDT', 5
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code = 'AUDUSDT');

INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals)
SELECT 'AAPL', 'STOCK', 'AAPL', 'USD', 2
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code = 'AAPL');

INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals)
SELECT 'MSFT', 'STOCK', 'MSFT', 'USD', 2
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code = 'MSFT');

INSERT INTO symbol (code, kind, base_currency, quote_currency, price_decimals)
SELECT 'GOOGL', 'STOCK', 'GOOGL', 'USD', 2
WHERE NOT EXISTS (SELECT 1 FROM symbol WHERE code = 'GOOGL');

INSERT INTO trading_account (user_id, account_type, currency, leverage, status)
SELECT u.id, 'DEMO', 'USD', 100, 'ACTIVE'
FROM app_user u
WHERE u.email = 'demo@broker.local'
  AND NOT EXISTS (SELECT 1 FROM trading_account ta WHERE ta.user_id = u.id);

INSERT INTO account_transaction (trading_account_id, tx_type, status, amount, currency, method, note, processed_at)
SELECT ta.id, 'DEPOSIT', 'APPROVED', 100000, ta.currency, 'internal', 'Demo balance credit', CURRENT_TIMESTAMP
FROM trading_account ta
JOIN app_user u ON u.id = ta.user_id
WHERE u.email = 'demo@broker.local'
  AND NOT EXISTS (SELECT 1 FROM account_transaction t WHERE t.trading_account_id = ta.id AND t.tx_type = 'DEPOSIT');

INSERT INTO kyc_case (user_id, status)
SELECT u.id, 'NOT_STARTED'
FROM app_user u
WHERE u.email = 'demo@broker.local'
  AND NOT EXISTS (SELECT 1 FROM kyc_case k WHERE k.user_id = u.id);

INSERT INTO notification (user_id, notif_type, title, body)
SELECT u.id, 'SYSTEM', 'Welcome', 'This is a demo broker account. No real trading or payments.'
FROM app_user u
WHERE u.email = 'demo@broker.local'
  AND NOT EXISTS (SELECT 1 FROM notification n WHERE n.user_id = u.id AND n.notif_type = 'SYSTEM' AND n.title = 'Welcome');

