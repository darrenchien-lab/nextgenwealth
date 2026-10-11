SELECT DISTINCT display_currency FROM investment_snapshots
WHERE user_id = $1 AND snapshot_date >= $2 AND snapshot_date < CURRENT_DATE
