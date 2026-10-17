UPDATE investment_holdings
SET current_price = $1, price_updated_at = NOW(), price_error = NULL
WHERE id = $2
