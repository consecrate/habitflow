package com.habitflow.db;

import com.habitflow.model.Category;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

/** SQL for the categories table. */
public class CategoryDao extends BaseDao<Category> {
    @Override
    protected Category mapRow(ResultSet rs) throws SQLException {
        return new Category(rs.getInt("id"), rs.getString("name"), rs.getString("color"));
    }

    public List<Category> list(int userId) {
        return queryList("SELECT * FROM categories WHERE user_id = ? ORDER BY name", userId);
    }

    public Category create(int userId, String name, String color) {
        int id = insert("INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?) RETURNING id", userId, name, color);
        return new Category(id, name, color);
    }

    public void delete(int userId, int categoryId) {
        update("DELETE FROM categories WHERE id = ? AND user_id = ?", categoryId, userId);
    }
}
