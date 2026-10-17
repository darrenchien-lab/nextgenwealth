SELECT TO_CHAR(snapshot_date, 'YYYY-MM-DD') AS snapshot_date, value AS total_value, cost_basis AS total_cost_basis, display_currency
FROM investment_holding_snapshots
WHERE user_id = $1 AND holding_id = $2
ORDER BY snapshot_date ASC
