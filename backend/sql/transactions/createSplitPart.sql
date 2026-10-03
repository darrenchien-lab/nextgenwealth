INSERT INTO transactions (user_id, account_id, category_id, type, amount, occurred_at, notes)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *
