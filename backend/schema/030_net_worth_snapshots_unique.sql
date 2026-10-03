-- Brings net_worth_snapshots to parity with investment_snapshots: a unique
-- constraint per (user_id, snapshot_date) lets snapshot-taking become a
-- true upsert, so the startup catch-up can safely re-run every time the
-- server starts (refreshing today's numbers) instead of only running once
-- per day guarded by a separate "does today exist" check.
--
-- Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, unlike ADD COLUMN — this
-- DO block is the standard idempotent stand-in, needed because setup-db.js
-- re-runs every schema file on every run rather than tracking which have
-- already been applied.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'net_worth_snapshots_user_date_unique'
  ) THEN
    ALTER TABLE net_worth_snapshots ADD CONSTRAINT net_worth_snapshots_user_date_unique UNIQUE (user_id, snapshot_date);
  END IF;
END $$;
