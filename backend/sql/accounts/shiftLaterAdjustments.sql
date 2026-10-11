UPDATE balance_adjustments SET balance_after = balance_after + $1 WHERE account_id = $2 AND occurred_at > $3
