UPDATE bills SET status = 'overdue' WHERE status = 'pending' AND due_date < CURRENT_DATE
