UPDATE investment_holdings
SET quantity = $1, cost_basis_total = $2, fees_total = $3, is_closed = FALSE
WHERE id = $4
RETURNING *
