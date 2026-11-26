package com.habitflow.db;

import com.habitflow.model.JournalEntry;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/** SQL for the journal_entries table (one mood entry per user per day). */
public class JournalDao extends BaseDao<JournalEntry> {
    @Override
    protected JournalEntry mapRow(ResultSet rs) throws SQLException {
        return new JournalEntry(date(rs, "day"), rs.getInt("mood"), rs.getString("note"));
    }

    public void upsert(int userId, JournalEntry e) {
        update("INSERT INTO journal_entries (user_id, day, mood, note) VALUES (?, ?, ?, ?) "
                + "ON CONFLICT (user_id, day) DO UPDATE SET mood = EXCLUDED.mood, note = EXCLUDED.note", userId, e.day(), e.mood(), e.note());
    }

    public Optional<JournalEntry> find(int userId, LocalDate day) {
        return queryOne("SELECT * FROM journal_entries WHERE user_id = ? AND day = ?", userId, day);
    }

    public List<JournalEntry> list(int userId) {
        return queryList("SELECT * FROM journal_entries WHERE user_id = ? ORDER BY day DESC", userId);
    }

    public int count(int userId) {
        return (int) scalar("SELECT count(*) FROM journal_entries WHERE user_id = ?", userId);
    }
}
