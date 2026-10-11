-- When set, the transaction counts toward the budget cycle containing this
-- date instead of the one containing occurred_at — e.g. a salary paid a day
-- or two before the cycle starts, which belongs to the new cycle's budget.
-- Only budgets, the dashboard and reports use it; balances, statements and
-- net worth history always follow occurred_at, when the money really moved.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cycle_date TIMESTAMP;
