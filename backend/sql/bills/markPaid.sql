UPDATE bills SET status = 'paid' WHERE id = $1 RETURNING *
