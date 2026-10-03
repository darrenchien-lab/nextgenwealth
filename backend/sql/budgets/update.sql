UPDATE budgets SET category_id = $1, period = $2, limit_amount = $3, currency = $4 WHERE id = $5 RETURNING *
