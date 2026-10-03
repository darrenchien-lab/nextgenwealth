INSERT INTO transactions (user_id, account_id, category_id, type, amount, occurred_at, notes, recurrence_rule_id)
VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()), $7, $8)
RETURNING *
