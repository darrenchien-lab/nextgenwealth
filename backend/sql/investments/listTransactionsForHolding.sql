SELECT * FROM investment_transactions WHERE user_id = $1 AND holding_id = $2 ORDER BY occurred_at DESC, id DESC
