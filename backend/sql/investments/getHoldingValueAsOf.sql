-- A holding's last saved value on or before a date.
SELECT value, display_currency
FROM investment_holding_snapshots
WHERE holding_id = $1 AND snapshot_date <= $2
ORDER BY snapshot_date DESC
LIMIT 1
