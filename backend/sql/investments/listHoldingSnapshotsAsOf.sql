-- Each holding's last saved value on or before a date, with its current
-- allocation category.
SELECT DISTINCT ON (s.holding_id)
  s.holding_id, TO_CHAR(s.snapshot_date, 'YYYY-MM-DD') AS snapshot_date,
  s.asset_name, s.value, s.display_currency, h.category
FROM investment_holding_snapshots s
JOIN investment_holdings h ON h.id = s.holding_id
WHERE s.user_id = $1 AND s.snapshot_date <= $2
ORDER BY s.holding_id, s.snapshot_date DESC
