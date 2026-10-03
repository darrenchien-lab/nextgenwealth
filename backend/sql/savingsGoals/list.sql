SELECT g.*, a.currency FROM savings_goals g
LEFT JOIN accounts a ON a.id = g.account_id
WHERE g.user_id = $1
ORDER BY g.created_at ASC
