package com.habitflow.db;

import com.habitflow.model.AuditEntry;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

/** Reads and writes the activity log (audit_log table). */
public class AuditDao extends BaseDao<AuditEntry> {
    @Override
    protected AuditEntry mapRow(ResultSet rs) throws SQLException {
        return new AuditEntry(timestamp(rs, "created_at"), rs.getString("action"), rs.getString("details"));
    }

    public void log(int userId, String action, String details) {
        update("INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)", userId, action,
                details.length() > 300 ? details.substring(0, 300) : details);
    }

    public List<AuditEntry> recent(int userId, int limit) {
        return queryList("SELECT * FROM audit_log WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?", userId, limit);
    }
}
