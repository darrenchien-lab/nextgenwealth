SELECT COALESCE(SUM(delta), 0) AS total FROM balance_adjustments WHERE account_id = $1 AND occurred_at > $2
