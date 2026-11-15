SELECT t.id, t.amount, a.currency, t.category_id, t.notes,
       TO_CHAR(COALESCE(t.cycle_date, t.occurred_at), 'YYYY-MM-DD') AS day
FROM transactions t
JOIN accounts a ON a.id = t.account_id
WHERE t.user_id = $1 AND t.type = 'expense'
  AND COALESCE(t.cycle_date, t.occurred_at) >= $2
ORDER BY COALESCE(t.cycle_date, t.occurred_at) ASC
