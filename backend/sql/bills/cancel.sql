UPDATE bills SET status = 'cancelled', recurrence_rule_id = NULL WHERE id = $1 RETURNING *
