CREATE TABLE IF NOT EXISTS app_user (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO app_user (email, display_name)
SELECT 'demo@broker.local', 'Demo User'
WHERE NOT EXISTS (SELECT 1 FROM app_user WHERE email = 'demo@broker.local');

