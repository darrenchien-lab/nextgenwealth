-- Where a holding's last price comes from automatically. NULL source means
-- the price is typed in by hand, as before. price_symbol is the code the
-- source knows it by (e.g. 'BBCA.JK' on Yahoo Finance, 'btcidr' on Indodax),
-- kept apart from the holding's own name so renaming it changes nothing.
ALTER TABLE investment_holdings ADD COLUMN IF NOT EXISTS price_source VARCHAR(20);
ALTER TABLE investment_holdings ADD COLUMN IF NOT EXISTS price_symbol VARCHAR(40);
-- When the price was last refreshed from the source, and why the last try
-- failed (NULL once it succeeds again), so a stale price can be flagged.
ALTER TABLE investment_holdings ADD COLUMN IF NOT EXISTS price_updated_at TIMESTAMP;
ALTER TABLE investment_holdings ADD COLUMN IF NOT EXISTS price_error TEXT;
