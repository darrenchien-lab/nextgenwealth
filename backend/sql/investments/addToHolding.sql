UPDATE investment_holdings
SET quantity = $1, cost_basis_total = $2, is_closed = FALSE
WHERE id = $3
RETURNING *
