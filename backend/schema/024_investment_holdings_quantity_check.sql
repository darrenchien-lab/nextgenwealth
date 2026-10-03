-- Fully closing a holding (selling all of it) sets quantity to 0 and
-- is_closed = TRUE; the original `quantity > 0` check made that impossible,
-- so removeHolding failed whenever a user removed their entire remaining
-- quantity instead of a partial amount.
ALTER TABLE investment_holdings DROP CONSTRAINT IF EXISTS investment_holdings_quantity_check;
ALTER TABLE investment_holdings ADD CONSTRAINT investment_holdings_quantity_check CHECK (quantity >= 0);
