package com.habitflow.controller;

import com.habitflow.db.UserDao;
import com.habitflow.model.User;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/** Who is logged in. The UI subscribes to be told when the user's data (e.g. coins) changes. */
public final class Session {
    private static final UserDao USERS = new UserDao();
    private static final List<Runnable> LISTENERS = new CopyOnWriteArrayList<>();
    private static volatile User current;

    private Session() { }

    public static User require() {
        User u = current;
        if (u == null) throw new IllegalStateException("Please log in first");
        return u;
    }

    public static boolean isLoggedIn() { return current != null; }

    static void start(User user) {
        current = user;
        fire();
    }

    static void end() {
        current = null;
        LISTENERS.clear();
    }

    /** Reloads the user from the database (after coins changed) and notifies listeners. */
    public static void refresh() {
        User u = current;
        if (u == null) return;
        current = USERS.findById(u.getId()).orElse(u);
        fire();
    }

    public static void addChangeListener(Runnable r) { LISTENERS.add(r); }

    private static void fire() { LISTENERS.forEach(Runnable::run); }
}
