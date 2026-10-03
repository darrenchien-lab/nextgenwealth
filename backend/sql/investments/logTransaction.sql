INSERT INTO investment_transactions (user_id, holding_id, asset_name, category, type, quantity, price_per_unit, total_amount, currency, realized_gain, account_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING *
