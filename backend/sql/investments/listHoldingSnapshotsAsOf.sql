-- Each holding's last saved value on or before a date, under the holding's
-- current name and category (a snapshot keeps the name it was saved with,
-- so a renamed holding would otherwise stop matching its target).
SELECT DISTINCT ON (s.holding_id)
  s.holding_id, TO_CHAR(s.snapshot_date, 'YYYY-MM-DD') AS snapshot_date,
  h.asset_name, s.value, s.display_currency, h.category
FROM investment_holding_snapshots s
JOIN investment_holdings h ON h.id = s.holding_id
WHERE s.user_id = $1 AND s.snapshot_date <= $2
ORDER BY s.holding_id, s.snapshot_date DESC
