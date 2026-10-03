-- Mutasi (transaction log) for investments — separate from
-- investment_holdings (current state) and investment_holding_snapshots
-- (daily value history). Neither of those records discrete events, so
-- there was previously no way to answer "when did I buy this, at what
-- price, how much did I realize on that sale." Matches the standard
-- brokerage convention: only buy/sell are logged here, not price updates
-- (those are just market data refreshing, not something the user did).
--
-- asset_name/category are denormalized (copied at the time of the
-- transaction) rather than joined from investment_holdings, so a later
-- rename or category change doesn't rewrite what old entries say — same
-- reasoning as investment_holding_snapshots.asset_name.
CREATE TABLE IF NOT EXISTS investment_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  holding_id INTEGER REFERENCES investment_holdings(id) ON DELETE SET NULL,
  asset_name TEXT NOT NULL,
  category TEXT,
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
  quantity NUMERIC(20, 8) NOT NULL CHECK (quantity > 0),
  price_per_unit NUMERIC(24, 8) NOT NULL,
  total_amount NUMERIC(18, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  -- Only ever set for 'sell' rows — (price_per_unit - cost basis/unit at
  -- the time) * quantity. Assumes current_price was updated to the real
  -- sale price before removing the quantity (the app has no separate
  -- "sold at" input), same as how the two actions already work today.
  realized_gain NUMERIC(18, 2),
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_investment_transactions_user_id ON investment_transactions(user_id);
