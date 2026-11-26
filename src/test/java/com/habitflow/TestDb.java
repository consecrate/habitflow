package com.habitflow;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;

/** Direct SQL helpers for test setup only (a separate connection to habitflow_test). */
final class TestDb {
    private TestDb() { }

    private static Connection conn() throws SQLException {
        return DriverManager.getConnection(System.getProperty("habitflow.db.url"), System.getProperty("user.name"), "");
    }

    private static long run(String sql, Object... params) {
        try (Connection c = conn(); PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) ps.setObject(i + 1, params[i]);
            if (sql.trim().toUpperCase().startsWith("SELECT")) {
                try (ResultSet rs = ps.executeQuery()) { return rs.next() ? rs.getLong(1) : 0; }
            }
            return ps.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    static void truncateUsers() { run("TRUNCATE users RESTART IDENTITY CASCADE"); }

    static void setCreatedOn(int habitId, LocalDate d) { run("UPDATE habits SET created_on = ? WHERE id = ?", java.sql.Date.valueOf(d), habitId); }

    static long ledgerSum(int userId) { return run("SELECT coalesce(sum(delta),0) FROM coin_ledger WHERE user_id = ?", userId); }

    static long checkInCoins(int userId) {
        return run("SELECT coalesce(sum(delta),0) FROM coin_ledger WHERE user_id = ? AND reason LIKE 'Completed %'", userId);
    }

    /** Grants coins the honest way: balance and ledger together. */
    static void giveCoins(int userId, int amount) {
        run("UPDATE users SET coins = coins + ? WHERE id = ?", amount, userId);
        run("INSERT INTO coin_ledger (user_id, delta, reason) VALUES (?, ?, 'Test grant')", userId, amount);
    }
}
