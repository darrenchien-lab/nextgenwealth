CREATE TABLE IF NOT EXISTS investment_holdings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_name VARCHAR(255) NOT NULL,
  asset_type VARCHAR(50) NOT NULL,
  quantity NUMERIC(20, 8) NOT NULL CHECK (quantity > 0),
  cost_basis_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  current_price NUMERIC(18, 8) NOT NULL DEFAULT 0,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_investment_holdings_user_id ON investment_holdings(user_id);
