-- Portfolio value history for the Investments page's trend chart — mirrors
-- net_worth_snapshots, but the unique constraint here (which that table
-- lacks) lets snapshot-taking be idempotent: re-running it the same day
-- (e.g. a startup catch-up firing more than once) updates the existing row
-- instead of creating a duplicate.
CREATE TABLE IF NOT EXISTS investment_snapshots (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_value NUMERIC(20, 2) NOT NULL,
  total_cost_basis NUMERIC(20, 2) NOT NULL,
  display_currency VARCHAR(3) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_investment_snapshots_user_date ON investment_snapshots(user_id, snapshot_date);
