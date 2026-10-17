UPDATE investment_holdings
SET price_source = NULL, price_symbol = NULL, price_updated_at = NULL, price_error = NULL
WHERE id = $1
RETURNING *
