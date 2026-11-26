package com.habitflow.db;

import com.habitflow.model.Achievement;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

/** SQL for the badge catalog and the badges each user earned. */
public class AchievementDao extends BaseDao<Achievement> {
    @Override
    protected Achievement mapRow(ResultSet rs) throws SQLException {
        return new Achievement(rs.getString("code"), rs.getString("name"), rs.getString("description"),
                rs.getInt("reward"), timestamp(rs, "earned_at"));
    }

    /** Full catalog with earned_at filled in for the ones this user has. */
    public List<Achievement> listFor(int userId) {
        return queryList("SELECT a.*, ua.earned_at FROM achievements a LEFT JOIN user_achievements ua "
                + "ON ua.code = a.code AND ua.user_id = ? ORDER BY ua.earned_at IS NULL, a.reward", userId);
    }

    /** Returns true only the first time, so rewards cannot be collected twice. */
    public boolean award(int userId, String code) {
        return update("INSERT INTO user_achievements (user_id, code) VALUES (?, ?) ON CONFLICT DO NOTHING", userId, code) == 1;
    }
}
