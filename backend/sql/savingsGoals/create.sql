INSERT INTO savings_goals (user_id, name, target_amount, target_date, account_id, currency)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *
