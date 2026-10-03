UPDATE transactions
SET type = $1, amount = $2, category_id = $3, occurred_at = $4, notes = $5, account_id = $6
WHERE id = $7
RETURNING *
