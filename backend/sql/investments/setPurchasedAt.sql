UPDATE investment_holdings SET purchased_at = $1 WHERE id = $2 RETURNING *
