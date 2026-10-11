-- Transactions dated before a cycle boundary but set to count in the cycle
-- that starts at (or after) it, e.g. a salary paid a few days early.
SELECT t.type, t.amount, a.currency
FROM transactions t
JOIN accounts a ON a.id = t.account_id
WHERE t.user_id = $1
  AND t.cycle_date IS NOT NULL
  AND t.occurred_at < $2
  AND t.cycle_date >= $2
