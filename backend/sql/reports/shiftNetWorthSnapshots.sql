UPDATE net_worth_snapshots
SET net_worth = net_worth + $1
WHERE user_id = $2 AND display_currency = $3 AND snapshot_date >= $4 AND snapshot_date < CURRENT_DATE
