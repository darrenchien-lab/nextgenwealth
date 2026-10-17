UPDATE investment_holdings
SET price_source = $1, price_symbol = $2, current_price = $3, price_updated_at = NOW(), price_error = NULL
WHERE id = $4
RETURNING *
