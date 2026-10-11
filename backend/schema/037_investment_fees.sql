-- Brokerage/exchange fees, tracked separately so a holding's cost basis can
-- be shown both with fees (what actually left the account) and without
-- (what broker apps usually show). investment_transactions.fee is NULL when
-- it isn't known (no market price was given for that buy/sell);
-- investment_holdings.fees_total is the part of the cost basis that is fees,
-- reduced proportionally when units are sold.
ALTER TABLE investment_holdings ADD COLUMN IF NOT EXISTS fees_total NUMERIC(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE investment_transactions ADD COLUMN IF NOT EXISTS fee NUMERIC(18, 2);
