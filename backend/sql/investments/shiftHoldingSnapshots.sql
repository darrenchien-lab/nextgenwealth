-- One row per day the portfolio was snapshotted in this currency: adds to the
-- holding's existing snapshot, or creates it for days before the holding was
-- entered in the app.
INSERT INTO investment_holding_snapshots (user_id, holding_id, snapshot_date, asset_name, value, cost_basis, display_currency)
SELECT $1, $2, s.snapshot_date, $3, $4, $5, s.display_currency
FROM investment_snapshots s
WHERE s.user_id = $1 AND s.display_currency = $6 AND s.snapshot_date >= $7 AND s.snapshot_date < CURRENT_DATE
ON CONFLICT (holding_id, snapshot_date)
DO UPDATE SET value = investment_holding_snapshots.value + EXCLUDED.value,
              cost_basis = investment_holding_snapshots.cost_basis + EXCLUDED.cost_basis
