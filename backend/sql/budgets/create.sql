INSERT INTO budgets (user_id, category_id, period, limit_amount, currency)
VALUES ($1, $2, $3, $4, $5)
RETURNING *
