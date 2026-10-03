SELECT * FROM investment_holdings WHERE user_id = $1 AND is_closed = FALSE ORDER BY category ASC NULLS LAST, asset_name ASC
