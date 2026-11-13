-- The name the app greets a user by. NULL means they haven't set one.
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(60);
