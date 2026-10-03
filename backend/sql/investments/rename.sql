UPDATE investment_holdings SET asset_name = $1 WHERE id = $2 RETURNING *
