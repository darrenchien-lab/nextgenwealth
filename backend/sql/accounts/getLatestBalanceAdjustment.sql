SELECT balance_after, occurred_at FROM balance_adjustments WHERE account_id = $1 ORDER BY occurred_at DESC LIMIT 1
