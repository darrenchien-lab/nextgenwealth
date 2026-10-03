SELECT * FROM bills
WHERE user_id = $1
  AND status IN ('pending', 'overdue')
  AND due_date <= CURRENT_DATE + ($2 || ' days')::interval
ORDER BY due_date ASC
