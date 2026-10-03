SELECT TO_CHAR(snapshot_date, 'YYYY-MM-DD') AS snapshot_date, net_worth, display_currency
FROM net_worth_snapshots
WHERE user_id = $1
ORDER BY snapshot_date ASC
