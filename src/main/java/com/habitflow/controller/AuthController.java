package com.habitflow.controller;

import com.habitflow.controller.logic.PasswordHasher;
import com.habitflow.db.AuditDao;
import com.habitflow.db.UserDao;
import com.habitflow.model.User;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Optional;

/** Registration, login with lockout, logout, and profile/password changes. */
public class AuthController {
    public static final int MAX_ATTEMPTS = 5;
    public static final Duration LOCK_TIME = Duration.ofMinutes(5);

    private final UserDao users = new UserDao();
    private final AuditDao audit = new AuditDao();

    public User register(String username, String displayName, String password, String confirm) {
        String name = username == null ? "" : username.trim().toLowerCase();
        if (!name.matches("[a-z0-9_]{3,20}")) throw new IllegalArgumentException("Username: 3-20 characters, letters, digits or _");
        if (displayName == null || displayName.isBlank()) throw new IllegalArgumentException("Display name is required");
        validatePassword(password);
        if (!password.equals(confirm)) throw new IllegalArgumentException("Passwords do not match");
        if (users.findByUsername(name).isPresent()) throw new IllegalArgumentException("Username '" + name + "' is taken");
        String salt = PasswordHasher.newSalt();
        User u = users.create(name, displayName.trim(), PasswordHasher.hash(password, salt), salt);
        audit.log(u.getId(), "REGISTER", "Account created");
        Session.start(u);
        return u;
    }

    public User login(String username, String password) {
        String name = username == null ? "" : username.trim().toLowerCase();
        Optional<UserDao.Credentials> found = users.findCredentials(name);
        if (found.isEmpty()) throw new IllegalArgumentException("Wrong username or password");
        UserDao.Credentials c = found.get();
        if (c.lockedUntil() != null && c.lockedUntil().isAfter(LocalDateTime.now())) {
            long mins = Math.max(1, Duration.between(LocalDateTime.now(), c.lockedUntil()).toMinutes() + 1);
            throw new IllegalStateException("Too many failed attempts. Try again in " + mins + " minute(s).");
        }
        if (!PasswordHasher.verify(password == null ? "" : password, c.salt(), c.passwordHash())) {
            int attempts = c.failedAttempts() + 1;
            boolean lock = attempts >= MAX_ATTEMPTS;
            users.recordFailedLogin(c.userId(), lock ? 0 : attempts, lock ? LocalDateTime.now().plus(LOCK_TIME) : null);
            if (lock) {
                audit.log(c.userId(), "LOCKED", "Locked after " + MAX_ATTEMPTS + " failed logins");
                throw new IllegalStateException("Too many failed attempts. Account locked for " + LOCK_TIME.toMinutes() + " minutes.");
            }
            throw new IllegalArgumentException("Wrong username or password (" + (MAX_ATTEMPTS - attempts) + " attempts left)");
        }
        users.resetFailedLogins(c.userId());
        User u = users.findById(c.userId()).orElseThrow();
        audit.log(u.getId(), "LOGIN", "Logged in");
        Session.start(u);
        return u;
    }

    public void logout() {
        Session.end();
    }

    public void changeDisplayName(String displayName) {
        User u = Session.require();
        u.setDisplayName(displayName); // validates
        users.updateDisplayName(u.getId(), u.getDisplayName());
        Session.refresh();
    }

    public void changePassword(String oldPassword, String newPassword, String confirm) {
        User u = Session.require();
        UserDao.Credentials c = users.findCredentials(u.getUsername()).orElseThrow();
        if (!PasswordHasher.verify(oldPassword, c.salt(), c.passwordHash())) throw new IllegalArgumentException("Current password is wrong");
        validatePassword(newPassword);
        if (!newPassword.equals(confirm)) throw new IllegalArgumentException("Passwords do not match");
        String salt = PasswordHasher.newSalt();
        users.updatePassword(u.getId(), PasswordHasher.hash(newPassword, salt), salt);
        audit.log(u.getId(), "PASSWORD", "Password changed");
    }

    private static void validatePassword(String p) {
        if (p == null || p.length() < 8 || !p.matches(".*[A-Za-z].*") || !p.matches(".*\\d.*")) {
            throw new IllegalArgumentException("Password: at least 8 characters with a letter and a digit");
        }
    }
}
