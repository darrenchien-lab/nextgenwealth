SELECT * FROM investment_holdings
WHERE user_id = $1 AND is_closed = FALSE AND price_source IS NOT NULL
ORDER BY asset_name
