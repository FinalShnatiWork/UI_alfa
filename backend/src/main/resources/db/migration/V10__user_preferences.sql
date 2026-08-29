-- User preferences table for storing theme color and other settings
CREATE TABLE IF NOT EXISTS user_preference (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  pref_key VARCHAR(64) NOT NULL,
  pref_value TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, pref_key)
);

CREATE INDEX IF NOT EXISTS idx_user_preference_user ON user_preference(user_id);
