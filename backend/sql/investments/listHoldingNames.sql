-- Every holding of a user (open or closed) with its name and currency.
SELECT id, asset_name, currency FROM investment_holdings WHERE user_id = $1
