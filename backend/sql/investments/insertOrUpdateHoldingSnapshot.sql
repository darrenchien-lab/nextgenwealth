INSERT INTO investment_holding_snapshots (user_id, holding_id, snapshot_date, asset_name, value, cost_basis, display_currency)
VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6)
ON CONFLICT (holding_id, snapshot_date)
DO UPDATE SET asset_name = $3, value = $4, cost_basis = $5, display_currency = $6
