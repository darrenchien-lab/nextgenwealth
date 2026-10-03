-- NUMERIC(18,8) only allowed values under 10^10 (10 billion) — too tight
-- for legitimate holdings priced in the trillions (e.g. IDR-denominated
-- assets). NUMERIC(24,8) allows up to 10^16 while keeping the same 8
-- decimal places of precision.
ALTER TABLE investment_holdings ALTER COLUMN current_price TYPE NUMERIC(24, 8);
