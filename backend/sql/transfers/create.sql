INSERT INTO transfers (user_id, from_account_id, to_account_id, from_amount, to_amount, occurred_at, notes, from_balance_after, to_balance_after, reverses_transfer_id)
VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()), $7, $8, $9, $10)
RETURNING *
