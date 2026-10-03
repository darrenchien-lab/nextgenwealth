INSERT INTO categories (user_id, name, parent_category_id)
VALUES ($1, $2, $3)
RETURNING *
