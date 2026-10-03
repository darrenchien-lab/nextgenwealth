UPDATE investment_holdings
SET quantity = $1, cost_basis_total = $2, is_closed = $3
WHERE id = $4
RETURNING *
