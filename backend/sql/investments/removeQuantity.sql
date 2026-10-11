UPDATE investment_holdings
SET quantity = $1, cost_basis_total = $2, is_closed = $3, fees_total = $4
WHERE id = $5
RETURNING *
