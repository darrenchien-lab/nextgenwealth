-- Users with automatically priced holdings, and how long ago the stalest
-- one was refreshed (NULL if one never has been).
SELECT user_id, MIN(price_updated_at) AS oldest_update, BOOL_OR(price_updated_at IS NULL) AS never_updated
FROM investment_holdings
WHERE is_closed = FALSE AND price_source IS NOT NULL
GROUP BY user_id
