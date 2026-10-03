CREATE TABLE IF NOT EXISTS savings_goals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  target_amount NUMERIC(18, 2) NOT NULL CHECK (target_amount > 0),
  target_date DATE,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  saved_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
