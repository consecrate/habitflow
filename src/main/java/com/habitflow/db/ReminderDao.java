package com.habitflow.db;

import com.habitflow.model.Reminder;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalTime;
import java.util.List;

/** SQL for the reminders table (one reminder time per habit). */
public class ReminderDao extends BaseDao<Reminder> {
    @Override
    protected Reminder mapRow(ResultSet rs) throws SQLException {
        return new Reminder(rs.getInt("habit_id"), rs.getString("name"), rs.getTime("remind_at").toLocalTime(), rs.getBoolean("enabled"));
    }

    public List<Reminder> listFor(int userId) {
        return queryList("SELECT r.*, h.name FROM reminders r JOIN habits h ON h.id = r.habit_id WHERE h.user_id = ? AND NOT h.archived ORDER BY r.remind_at", userId);
    }

    public void upsert(int habitId, LocalTime time, boolean enabled) {
        update("INSERT INTO reminders (habit_id, remind_at, enabled) VALUES (?, ?, ?) "
                + "ON CONFLICT (habit_id) DO UPDATE SET remind_at = EXCLUDED.remind_at, enabled = EXCLUDED.enabled", habitId, time, enabled);
    }

    public void delete(int habitId) {
        update("DELETE FROM reminders WHERE habit_id = ?", habitId);
    }
}
