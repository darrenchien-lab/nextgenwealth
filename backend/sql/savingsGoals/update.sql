UPDATE savings_goals
SET name = $1, target_amount = $2, target_date = $3, currency = $4
WHERE id = $5
RETURNING *
