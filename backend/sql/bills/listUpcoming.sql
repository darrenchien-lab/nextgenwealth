SELECT b.*, a.currency FROM bills b
LEFT JOIN accounts a ON a.id = b.account_id
WHERE b.user_id = $1
  AND b.status IN ('pending', 'overdue')
  AND b.due_date <= CURRENT_DATE + ($2 || ' days')::interval
ORDER BY b.due_date ASC
