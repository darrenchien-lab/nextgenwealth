-- Investment holdings originally had no currency, so multi-currency
-- portfolios totalled incorrectly (raw numbers summed regardless of
-- currency). Existing rows are backfilled to the owning user's
-- display_currency, which leaves their currently displayed totals
-- unchanged until the user corrects a holding's currency by re-entering it.
ALTER TABLE investment_holdings ADD COLUMN IF NOT EXISTS currency VARCHAR(3);

UPDATE investment_holdings h
SET currency = u.display_currency
FROM users u
WHERE h.user_id = u.id AND h.currency IS NULL;

ALTER TABLE investment_holdings ALTER COLUMN currency SET DEFAULT 'IDR';
ALTER TABLE investment_holdings ALTER COLUMN currency SET NOT NULL;
