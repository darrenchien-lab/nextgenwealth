CREATE TABLE IF NOT EXISTS bills (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
  due_date DATE NOT NULL,
  recurrence_rule_id INTEGER REFERENCES recurrence_rules(id) ON DELETE SET NULL,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bills_user_id_due_date ON bills(user_id, due_date);

-- Links a payment transaction back to the bill it paid, so "has this bill
-- ever been paid" (used to block hard-deleting a bill) can be answered
-- without a separate payment-history table.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL;
