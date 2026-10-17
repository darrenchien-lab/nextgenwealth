SELECT s.goal_id, s.account_id, s.holding_id, s.amount
FROM savings_goal_sources s
JOIN savings_goals g ON g.id = s.goal_id
WHERE g.user_id = $1
ORDER BY s.id
