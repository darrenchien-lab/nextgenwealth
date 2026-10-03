SELECT b.*, a.currency FROM bills b
LEFT JOIN accounts a ON a.id = b.account_id
WHERE b.user_id = $1
ORDER BY b.due_date ASC
