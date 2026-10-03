UPDATE investment_holdings SET category = $1 WHERE id = $2 RETURNING *
