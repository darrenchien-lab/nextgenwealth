CREATE TABLE IF NOT EXISTS exchange_rates (
  id SERIAL PRIMARY KEY,
  base_currency VARCHAR(3) NOT NULL,
  quote_currency VARCHAR(3) NOT NULL,
  rate NUMERIC(20, 8) NOT NULL,
  fetched_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Rows are append-only (one per successful daily fetch) so a fallback to the
-- most recent previously cached rate is just "the next row back", not a
-- separate history table.
CREATE INDEX IF NOT EXISTS idx_exchange_rates_pair_fetched_at
  ON exchange_rates(base_currency, quote_currency, fetched_at DESC);
