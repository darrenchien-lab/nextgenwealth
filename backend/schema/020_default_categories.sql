INSERT INTO categories (user_id, name)
SELECT NULL, defaults.name FROM (VALUES
  ('Food & Drink'),
  ('Transport'),
  ('Shopping'),
  ('Bills & Utilities'),
  ('Entertainment'),
  ('Health'),
  ('Salary'),
  ('Other')
) AS defaults(name)
WHERE NOT EXISTS (
  SELECT 1 FROM categories WHERE categories.user_id IS NULL AND categories.name = defaults.name
);
