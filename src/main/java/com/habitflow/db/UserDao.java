package com.habitflow.db;

import com.habitflow.model.User;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.Optional;

/** SQL for the users table: accounts, login data and the coin balance. */
public class UserDao extends BaseDao<User> {

    /** Login data that never leaves the db/controller tiers. */
    public record Credentials(int userId, String passwordHash, String salt, int failedAttempts, LocalDateTime lockedUntil) { }

    @Override
    protected User mapRow(ResultSet rs) throws SQLException {
        return new User(rs.getInt("id"), rs.getString("username"), rs.getString("display_name"), rs.getInt("coins"));
    }

    public User create(String username, String displayName, String hash, String salt) {
        int id = insert("INSERT INTO users (username, display_name, password_hash, salt) VALUES (?, ?, ?, ?) RETURNING id",
                username, displayName, hash, salt);
        return findById(id).orElseThrow();
    }

    public Optional<User> findById(int id) {
        return queryOne("SELECT * FROM users WHERE id = ?", id);
    }

    public Optional<User> findByUsername(String username) {
        return queryOne("SELECT * FROM users WHERE username = ?", username);
    }

    public Optional<Credentials> findCredentials(String username) {
        return queryRaw("SELECT id, password_hash, salt, failed_attempts, locked_until FROM users WHERE username = ?",
                rs -> new Credentials(rs.getInt("id"), rs.getString("password_hash"), rs.getString("salt"),
                        rs.getInt("failed_attempts"), timestamp(rs, "locked_until")), username)
                .stream().findFirst();
    }

    public void recordFailedLogin(int userId, int attempts, LocalDateTime lockUntil) {
        update("UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?", attempts, lockUntil, userId);
    }

    public void resetFailedLogins(int userId) {
        update("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?", userId);
    }

    public int coins(int userId) {
        return (int) scalar("SELECT coins FROM users WHERE id = ?", userId);
    }

    /** Adds (or with a negative delta, spends) coins. Returns false instead of going below zero. */
    public boolean addCoins(int userId, int delta) {
        return update("UPDATE users SET coins = coins + ? WHERE id = ? AND coins + ? >= 0", delta, userId, delta) == 1;
    }

    public void updateDisplayName(int userId, String displayName) {
        update("UPDATE users SET display_name = ? WHERE id = ?", displayName, userId);
    }

    public void updatePassword(int userId, String hash, String salt) {
        update("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?", hash, salt, userId);
    }

    public void deleteByUsername(String username) {
        update("DELETE FROM users WHERE username = ?", username);
    }
}
