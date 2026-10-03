SELECT TO_CHAR(snapshot_date, 'YYYY-MM-DD') AS snapshot_date, total_value, total_cost_basis, display_currency
FROM investment_snapshots
WHERE user_id = $1
ORDER BY snapshot_date ASC
