SELECT DISTINCT currency FROM investment_holdings WHERE user_id = $1 AND is_closed = FALSE
