-- Transactions dated before a cycle boundary but set to count in the cycle
-- that starts at (or after) it, with the day each happened, so a day-by-day
-- net worth line can leave them out until they belong.
SELECT t.type, t.amount, a.currency, TO_CHAR(t.occurred_at, 'YYYY-MM-DD') AS day
FROM transactions t
JOIN accounts a ON a.id = t.account_id
WHERE t.user_id = $1
  AND t.cycle_date IS NOT NULL
  AND t.occurred_at < $2
  AND t.cycle_date >= $2
