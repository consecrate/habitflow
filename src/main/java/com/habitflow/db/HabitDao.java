package com.habitflow.db;

import com.habitflow.model.Habit;
import com.habitflow.model.HabitType;
import com.habitflow.model.Schedule;
import com.habitflow.model.ScheduleType;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;

/** SQL for the habits table; rebuilds the right Habit subclass and Schedule from each row. */
public class HabitDao extends BaseDao<Habit> {
    private static final String SELECT =
            "SELECT h.*, c.name AS category_name FROM habits h LEFT JOIN categories c ON c.id = h.category_id ";

    /** Rebuilds the right Habit subclass and Schedule strategy from the row. */
    @Override
    protected Habit mapRow(ResultSet rs) throws SQLException {
        Habit h = HabitType.valueOf(rs.getString("type")).newHabit();
        h.setId(rs.getInt("id"));
        h.setUserId(rs.getInt("user_id"));
        h.setCategoryId(nullableInt(rs, "category_id"));
        h.setCategoryName(rs.getString("category_name"));
        h.setName(rs.getString("name"));
        h.setTarget(rs.getDouble("target"));
        h.setUnit(rs.getString("unit"));
        h.setSchedule(Schedule.of(ScheduleType.valueOf(rs.getString("schedule_type")), rs.getInt("schedule_param")));
        h.setColor(rs.getString("color"));
        h.setShared(rs.getBoolean("shared"));
        h.setArchived(rs.getBoolean("archived"));
        h.setCreatedOn(date(rs, "created_on"));
        return h;
    }

    public List<Habit> list(int userId, boolean includeArchived) {
        return queryList(SELECT + "WHERE h.user_id = ? AND (? OR NOT h.archived) ORDER BY h.archived, h.id", userId, includeArchived);
    }

    public List<Habit> listShared(int userId) {
        return queryList(SELECT + "WHERE h.user_id = ? AND h.shared AND NOT h.archived ORDER BY h.id", userId);
    }

    public Optional<Habit> find(int userId, int habitId) {
        return queryOne(SELECT + "WHERE h.user_id = ? AND h.id = ?", userId, habitId);
    }

    public Optional<Habit> findByName(int userId, String name) {
        return queryOne(SELECT + "WHERE h.user_id = ? AND lower(h.name) = lower(?)", userId, name);
    }

    public void insert(Habit h) {
        h.setId(insert("INSERT INTO habits (user_id, category_id, name, type, target, unit, schedule_type, schedule_param, color, shared, archived, created_on) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
                h.getUserId(), h.getCategoryId(), h.getName(), h.getType().name(), h.getTarget(), h.getUnit(),
                h.getSchedule().type().name(), h.getSchedule().param(), h.getColor(), h.isShared(), h.isArchived(), h.getCreatedOn()));
    }

    public void update(Habit h) {
        update("UPDATE habits SET category_id = ?, name = ?, type = ?, target = ?, unit = ?, schedule_type = ?, schedule_param = ?, "
                        + "color = ?, shared = ?, archived = ? WHERE id = ? AND user_id = ?",
                h.getCategoryId(), h.getName(), h.getType().name(), h.getTarget(), h.getUnit(), h.getSchedule().type().name(),
                h.getSchedule().param(), h.getColor(), h.isShared(), h.isArchived(), h.getId(), h.getUserId());
    }

    public void delete(int userId, int habitId) {
        update("DELETE FROM habits WHERE id = ? AND user_id = ?", habitId, userId);
    }

    public int countActive(int userId) {
        return (int) scalar("SELECT count(*) FROM habits WHERE user_id = ? AND NOT archived", userId);
    }
}
