CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
  amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
  occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
  notes TEXT,
  recurrence_rule_id INTEGER REFERENCES recurrence_rules(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_account_category_occurred_at
  ON transactions(user_id, account_id, category_id, occurred_at);
