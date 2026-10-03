-- Logs every direct balance correction ("click to edit balance") — these
-- bypass the transaction/transfer ledger by design (that's the whole point
-- of a manual override), which meant reconcileBalances had no way to know
-- one had ever happened and kept comparing against a stale ledger total.
-- Reconciliation now anchors from the most recent row here (balance_after +
-- its timestamp) instead of always from initial_balance, so it stays
-- accurate for any account that's ever been manually corrected — the
-- overwhelming majority of real accounts. Adjustments made before this
-- table existed still can't be reconstructed (there was never a record of
-- them), same trade-off as the investment cost-basis reliability cutoff.
CREATE TABLE IF NOT EXISTS balance_adjustments (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  delta NUMERIC(18, 2) NOT NULL,
  balance_after NUMERIC(18, 2) NOT NULL,
  occurred_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_balance_adjustments_account_id ON balance_adjustments(account_id);
