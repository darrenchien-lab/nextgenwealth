UPDATE bills SET name = $1, amount = $2, due_date = $3, account_id = $4, category_id = $5, notes = $6 WHERE id = $7 RETURNING *
