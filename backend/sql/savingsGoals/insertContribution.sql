INSERT INTO goal_contributions (goal_id, amount, occurred_at) VALUES ($1, $2, COALESCE($3::timestamp, NOW()))
