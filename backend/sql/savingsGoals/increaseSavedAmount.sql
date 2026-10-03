UPDATE savings_goals SET saved_amount = saved_amount + $1 WHERE id = $2 RETURNING *
