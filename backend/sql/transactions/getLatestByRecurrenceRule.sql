SELECT * FROM transactions WHERE recurrence_rule_id = $1 ORDER BY occurred_at DESC LIMIT 1
