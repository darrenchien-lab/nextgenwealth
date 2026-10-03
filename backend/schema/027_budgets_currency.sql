-- Budgets previously had no currency of their own — the limit was always
-- silently interpreted in whatever the user's display currency happened to
-- be, which breaks the moment that setting changes later (same class of bug
-- as the net worth history mixing-currencies issue). Existing rows are
-- grandfathered to the user's current display currency, matching what they
-- were implicitly already being compared against.
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS currency VARCHAR(3);

UPDATE budgets b SET currency = u.display_currency
FROM users u WHERE b.user_id = u.id AND b.currency IS NULL;

ALTER TABLE budgets ALTER COLUMN currency SET NOT NULL;
