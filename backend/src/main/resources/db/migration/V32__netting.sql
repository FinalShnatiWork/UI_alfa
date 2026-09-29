-- V32: Real netting (client vs client / client vs computer), see buysellmodel/NETTING_IMPLEMENTATION_PLAN.md
-- Idempotent and portable (PostgreSQL + H2 in PostgreSQL mode). No fixed ids (teammate DBs differ).

-- ─── Simulated counterparties ("the computer") ───────────────────────────────
ALTER TABLE app_user        ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE trading_account ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── Fill accounting on orders ───────────────────────────────────────────────
ALTER TABLE broker_order ADD COLUMN IF NOT EXISTS filled_qty        NUMERIC(18,8) NOT NULL DEFAULT 0;
ALTER TABLE broker_order ADD COLUMN IF NOT EXISTS internal_qty      NUMERIC(18,8) NOT NULL DEFAULT 0;
ALTER TABLE broker_order ADD COLUMN IF NOT EXISTS external_qty      NUMERIC(18,8) NOT NULL DEFAULT 0;
ALTER TABLE broker_order ADD COLUMN IF NOT EXISTS reserve_remaining NUMERIC(18,8);
ALTER TABLE broker_order ADD COLUMN IF NOT EXISTS routing           VARCHAR(16);
ALTER TABLE broker_order ADD COLUMN IF NOT EXISTS net_deadline      TIMESTAMP;
ALTER TABLE broker_order ADD COLUMN IF NOT EXISTS nn_shadow_correct BOOLEAN;

-- Everything filled before netting existed is history, not netting data.
UPDATE broker_order SET routing = 'LEGACY'
 WHERE routing IS NULL AND status NOT IN ('NEW', 'PARTIALLY_FILLED', 'PENDING_NET');

CREATE INDEX IF NOT EXISTS idx_broker_order_book ON broker_order(symbol_code, side, status);

-- ─── One row per internal cross ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS internal_match (
  id                 BIGSERIAL PRIMARY KEY,
  symbol_code        VARCHAR(32)   NOT NULL,
  buy_order_id       BIGINT        NOT NULL REFERENCES broker_order(id),
  sell_order_id      BIGINT        NOT NULL REFERENCES broker_order(id),
  buy_account_id     BIGINT        NOT NULL REFERENCES trading_account(id),
  sell_account_id    BIGINT        NOT NULL REFERENCES trading_account(id),
  quantity           NUMERIC(18,8) NOT NULL,
  bid                NUMERIC(18,8) NOT NULL,
  mid                NUMERIC(18,8) NOT NULL,
  ask                NUMERIC(18,8) NOT NULL,
  buyer_improvement  NUMERIC(18,8) NOT NULL,
  seller_improvement NUMERIC(18,8) NOT NULL,
  external_fee_saved NUMERIC(18,8) NOT NULL,
  buyer_simulated    BOOLEAN       NOT NULL DEFAULT FALSE,
  seller_simulated   BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_internal_match_nbbo CHECK (bid < mid AND mid < ask),
  CONSTRAINT chk_internal_match_no_self CHECK (buy_account_id <> sell_account_id),
  CONSTRAINT chk_internal_match_no_sim_sim CHECK (NOT (buyer_simulated AND seller_simulated)),
  CONSTRAINT chk_internal_match_qty CHECK (quantity > 0)
);
CREATE INDEX IF NOT EXISTS idx_internal_match_symbol ON internal_match(symbol_code, created_at);

-- ─── Two simulated liquidity accounts (they can never log in) ────────────────
INSERT INTO app_user (email, display_name, password_hash, role, banned, is_simulated, created_at)
SELECT 'sim-lp-1@broker.local', 'Computer LP 1', '!disabled-simulated-account', 'USER', FALSE, TRUE, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM app_user WHERE email = 'sim-lp-1@broker.local');

INSERT INTO app_user (email, display_name, password_hash, role, banned, is_simulated, created_at)
SELECT 'sim-lp-2@broker.local', 'Computer LP 2', '!disabled-simulated-account', 'USER', FALSE, TRUE, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM app_user WHERE email = 'sim-lp-2@broker.local');

UPDATE app_user SET is_simulated = TRUE WHERE email IN ('sim-lp-1@broker.local', 'sim-lp-2@broker.local');

INSERT INTO trading_account (user_id, account_type, currency, leverage, status, balance, equity, margin_used,
                             free_margin, borrowed_balance, interest_accrued_total, credit_limit,
                             daily_interest_rate, commission_paid_total, is_simulated, created_at, updated_at)
SELECT u.id, 'DEMO', 'USD', 100, 'ACTIVE', 1000000, 1000000, 0,
       1000000, 0, 0, 0,
       0, 0, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM app_user u
 WHERE u.email IN ('sim-lp-1@broker.local', 'sim-lp-2@broker.local')
   AND NOT EXISTS (SELECT 1 FROM trading_account t WHERE t.user_id = u.id);

UPDATE trading_account SET is_simulated = TRUE
 WHERE user_id IN (SELECT id FROM app_user WHERE is_simulated = TRUE);
