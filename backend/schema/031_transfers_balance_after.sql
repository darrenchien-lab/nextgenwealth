-- Nullable, and only ever populated going forward — a transfer's "balance
-- after" can only be known truthfully at the moment it's created (it'd take
-- replaying the account's entire transaction history in order to
-- reconstruct it for transfers made before this column existed, which isn't
-- worth the risk of quietly fabricating a number for old data).
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS from_balance_after NUMERIC(18, 2);
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS to_balance_after NUMERIC(18, 2);
