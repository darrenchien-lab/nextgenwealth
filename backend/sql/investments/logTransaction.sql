INSERT INTO investment_transactions (user_id, holding_id, asset_name, category, type, quantity, price_per_unit, total_amount, currency, realized_gain, account_id, occurred_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12::timestamp, NOW()))
RETURNING *
