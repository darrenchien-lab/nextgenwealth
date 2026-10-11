UPDATE investment_snapshots
SET total_value = total_value + $1, total_cost_basis = total_cost_basis + $2
WHERE user_id = $3 AND display_currency = $4 AND snapshot_date >= $5 AND snapshot_date < CURRENT_DATE
