package com.habitflow.db;

import com.habitflow.model.CheckIn;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.*;

/** SQL for check_ins, including the aggregate queries behind the statistics charts. */
public class CheckInDao extends BaseDao<CheckIn> {
    /** SQL version of Habit.isCompleted, so aggregates can run inside PostgreSQL. */
    private static final String COMPLETED =
            "(ci.frozen = FALSE AND ci.value >= CASE h.type WHEN 'BOOLEAN' THEN 1 ELSE h.target END)";

    @Override
    protected CheckIn mapRow(ResultSet rs) throws SQLException {
        return new CheckIn(rs.getInt("habit_id"), date(rs, "day"), rs.getDouble("value"),
                rs.getString("note"), rs.getBoolean("frozen"), rs.getInt("coins_awarded"));
    }

    public Optional<CheckIn> find(int habitId, LocalDate day) {
        return queryOne("SELECT * FROM check_ins WHERE habit_id = ? AND day = ?", habitId, day);
    }

    public List<CheckIn> forHabit(int habitId) {
        return queryList("SELECT * FROM check_ins WHERE habit_id = ? ORDER BY day", habitId);
    }

    /** Every check-in of a user's habits in one round trip, grouped by habit id. */
    public Map<Integer, List<CheckIn>> allForUser(int userId) {
        Map<Integer, List<CheckIn>> out = new HashMap<>();
        for (CheckIn c : queryList("SELECT ci.* FROM check_ins ci JOIN habits h ON h.id = ci.habit_id WHERE h.user_id = ? ORDER BY ci.day", userId)) {
            out.computeIfAbsent(c.habitId(), k -> new ArrayList<>()).add(c);
        }
        return out;
    }

    /** Insert or overwrite the check-in for that habit and day (UNIQUE(habit_id, day)). */
    public void upsert(CheckIn c) {
        update("INSERT INTO check_ins (habit_id, day, value, note, frozen, coins_awarded) VALUES (?, ?, ?, ?, ?, ?) "
                        + "ON CONFLICT (habit_id, day) DO UPDATE SET value = EXCLUDED.value, note = EXCLUDED.note, "
                        + "frozen = EXCLUDED.frozen, coins_awarded = EXCLUDED.coins_awarded",
                c.habitId(), c.day(), c.value(), c.note(), c.frozen(), c.coinsAwarded());
    }

    public void delete(int habitId, LocalDate day) {
        update("DELETE FROM check_ins WHERE habit_id = ? AND day = ?", habitId, day);
    }

    public long countCompleted(int userId) {
        return scalar("SELECT count(*) FROM check_ins ci JOIN habits h ON h.id = ci.habit_id WHERE h.user_id = ? AND " + COMPLETED, userId);
    }

    /** Completed check-ins per day from..to, with zero-filled gaps (generate_series). */
    public LinkedHashMap<LocalDate, Integer> completedPerDay(int userId, LocalDate from, LocalDate to) {
        LinkedHashMap<LocalDate, Integer> out = new LinkedHashMap<>();
        queryRaw("SELECT d::date AS day, count(ci.habit_id) AS n FROM generate_series(?::date, ?::date, interval '1 day') d "
                        + "LEFT JOIN (check_ins ci JOIN habits h ON h.id = ci.habit_id AND h.user_id = ?) ON ci.day = d::date AND " + COMPLETED
                        + " GROUP BY d ORDER BY d",
                rs -> out.put(date(rs, "day"), rs.getInt("n")), from, to, userId);
        return out;
    }

    /** Completed check-ins per weekday since a date. */
    public EnumMap<DayOfWeek, Integer> completedPerWeekday(int userId, LocalDate from) {
        EnumMap<DayOfWeek, Integer> out = new EnumMap<>(DayOfWeek.class);
        for (DayOfWeek d : DayOfWeek.values()) out.put(d, 0);
        queryRaw("SELECT extract(isodow FROM ci.day)::int AS dow, count(*) AS n FROM check_ins ci JOIN habits h ON h.id = ci.habit_id "
                        + "WHERE h.user_id = ? AND ci.day >= ? AND " + COMPLETED + " GROUP BY dow",
                rs -> out.put(DayOfWeek.of(rs.getInt("dow")), rs.getInt("n")), userId, from);
        return out;
    }

    /** Completed check-ins per category since a date. */
    public LinkedHashMap<String, Integer> completedPerCategory(int userId, LocalDate from) {
        LinkedHashMap<String, Integer> out = new LinkedHashMap<>();
        queryRaw("SELECT coalesce(c.name, 'Uncategorized') AS cat, count(*) AS n FROM check_ins ci JOIN habits h ON h.id = ci.habit_id "
                        + "LEFT JOIN categories c ON c.id = h.category_id WHERE h.user_id = ? AND ci.day >= ? AND " + COMPLETED
                        + " GROUP BY cat ORDER BY n DESC",
                rs -> out.put(rs.getString("cat"), rs.getInt("n")), userId, from);
        return out;
    }
}
