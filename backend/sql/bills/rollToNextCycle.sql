UPDATE bills SET due_date = $1, status = 'pending' WHERE id = $2 RETURNING *
