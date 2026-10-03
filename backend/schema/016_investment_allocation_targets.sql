CREATE TABLE IF NOT EXISTS investment_allocation_targets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_name VARCHAR(255) NOT NULL,
  target_percentage NUMERIC(5, 2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, asset_name)
);

-- A single reference CAGR the user is aiming for, shown alongside the
-- allocation comparison. Not computed from history (insufficient net worth
-- snapshot history exists yet) — a target the user sets themselves.
ALTER TABLE users ADD COLUMN IF NOT EXISTS target_cagr NUMERIC(6, 2);
