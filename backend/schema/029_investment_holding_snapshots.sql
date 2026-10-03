-- Per-holding daily value history for the Investments page's "all holdings"
-- trend chart — investment_snapshots (028) only ever tracked the PORTFOLIO
-- TOTAL, not each holding's own value over time, so that chart couldn't be
-- built from it. asset_name is snapshotted here (not just holding_id) so a
-- later rename doesn't retroactively relabel older points; the chart groups
-- by holding_id and uses the most recent name for the legend/line label.
CREATE TABLE IF NOT EXISTS investment_holding_snapshots (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  holding_id INTEGER NOT NULL REFERENCES investment_holdings(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  asset_name TEXT NOT NULL,
  value NUMERIC(20, 2) NOT NULL,
  cost_basis NUMERIC(20, 2) NOT NULL,
  display_currency VARCHAR(3) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (holding_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_investment_holding_snapshots_user_date ON investment_holding_snapshots(user_id, snapshot_date);
