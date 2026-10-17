-- Where a goal's money is kept. A goal with sources tracks its progress
-- from them automatically: each source is an account or an investment
-- holding, either in full (amount NULL) or only up to a set amount (e.g.
-- 60,000,000 of a savings account that also holds other money). A goal
-- with no sources is tracked by hand, through saved_amount and
-- goal_contributions as before.
CREATE TABLE IF NOT EXISTS savings_goal_sources (
  id SERIAL PRIMARY KEY,
  goal_id INTEGER NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  holding_id INTEGER REFERENCES investment_holdings(id) ON DELETE CASCADE,
  amount NUMERIC(18, 2) CHECK (amount IS NULL OR amount > 0),
  CHECK ((account_id IS NULL) <> (holding_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_savings_goal_sources_goal_id ON savings_goal_sources(goal_id);

-- The currency a goal's target and progress are counted in. Older goals
-- fall back to their linked account's currency, then the display currency.
ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS currency VARCHAR(3);
