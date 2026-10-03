UPDATE investment_holdings SET current_price = $1 WHERE id = $2 RETURNING *
