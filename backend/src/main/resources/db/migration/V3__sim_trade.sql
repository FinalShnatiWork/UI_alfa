CREATE TABLE IF NOT EXISTS sim_trade (
  id BIGSERIAL PRIMARY KEY,
  symbol VARCHAR(32) NOT NULL,
  quantity INT NOT NULL,
  buyer_label VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sim_trade_created ON sim_trade (created_at DESC);
