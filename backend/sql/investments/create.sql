INSERT INTO investment_holdings (user_id, asset_name, asset_type, quantity, currency, cost_basis_total, current_price, category, purchased_at, fees_total)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *
