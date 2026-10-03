-- Copied onto the payment transaction when a bill is marked paid (see
-- bills/insertPaymentTransaction.sql), same denormalization reasoning as
-- investment_transactions.asset_name — the note describes *that* payment,
-- so a later edit to the bill's own notes shouldn't rewrite past receipts.
ALTER TABLE bills ADD COLUMN IF NOT EXISTS notes TEXT;
