SELECT holding_id, TO_CHAR(snapshot_date, 'YYYY-MM-DD') AS snapshot_date, asset_name, value, cost_basis, display_currency
FROM investment_holding_snapshots
WHERE user_id = $1
ORDER BY snapshot_date ASC
