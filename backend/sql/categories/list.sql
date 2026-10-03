SELECT * FROM categories WHERE user_id = $1 OR user_id IS NULL ORDER BY name ASC
