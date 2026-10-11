INSERT INTO balance_adjustments (account_id, delta, balance_after, occurred_at)
VALUES ($1, $2, $3, COALESCE($4::timestamp, NOW()))
RETURNING *
