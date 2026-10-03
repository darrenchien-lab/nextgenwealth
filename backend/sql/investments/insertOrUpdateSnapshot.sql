INSERT INTO investment_snapshots (user_id, snapshot_date, total_value, total_cost_basis, display_currency)
VALUES ($1, CURRENT_DATE, $2, $3, $4)
ON CONFLICT (user_id, snapshot_date)
DO UPDATE SET total_value = $2, total_cost_basis = $3, display_currency = $4
