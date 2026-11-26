package com.habitflow.controller;

import com.habitflow.db.Database;

/** Called once by the GUI before anything else: connects and makes sure all tables exist. */
public final class StartupController {
    private StartupController() { }

    /** Throws a RuntimeException with a readable message when PostgreSQL is not reachable. */
    public static void initDatabase() {
        try {
            Database.checkConnection();
            Database.runScript("/schema.sql");
        } catch (RuntimeException e) {
            throw new IllegalStateException("Cannot connect to PostgreSQL at " + Database.url() + "\n\n" + e.getMessage()
                    + "\n\nStart it with: brew services start postgresql@16\nand create the database with: createdb habitflow", e);
        }
    }
}
