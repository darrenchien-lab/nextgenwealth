INSERT INTO balance_adjustments (account_id, delta, balance_after)
VALUES ($1, $2, $3)
RETURNING *
