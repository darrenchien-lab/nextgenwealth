-- Links a reversing transfer back to the transfer it reverses. Deleting a
-- transfer used to just erase it and undo its balance effect directly —
-- but any transfer created after it had already snapshotted its own
-- balance_after based on a history that included it, and there's no way to
-- retroactively fix those without replaying the account's entire ledger.
-- Switching to reversing entries (never hard-deleting, only ever adding an
-- offsetting transfer) keeps every past snapshot truthful, the standard
-- double-entry bookkeeping approach for correcting a past entry.
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS reverses_transfer_id INTEGER REFERENCES transfers(id) ON DELETE SET NULL;
