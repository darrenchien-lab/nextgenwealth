UPDATE bills SET status = 'overdue' WHERE user_id = $1 AND status = 'pending' AND due_date < CURRENT_DATE
