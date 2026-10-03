SELECT net_worth, display_currency FROM net_worth_snapshots
WHERE user_id = $1 AND snapshot_date <= $2
ORDER BY snapshot_date DESC LIMIT 1
