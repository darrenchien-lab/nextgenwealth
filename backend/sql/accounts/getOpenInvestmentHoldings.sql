SELECT currency, quantity, current_price FROM investment_holdings WHERE user_id = $1 AND is_closed = FALSE
