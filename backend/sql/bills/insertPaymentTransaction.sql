INSERT INTO transactions (user_id, account_id, category_id, type, amount, occurred_at, bill_id, notes)
VALUES ($1, $2, $3, 'expense', $4, COALESCE($7::timestamp, NOW()), $5, $6)
