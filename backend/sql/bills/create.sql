INSERT INTO bills (user_id, name, amount, due_date, recurrence_rule_id, account_id, category_id, notes)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *
