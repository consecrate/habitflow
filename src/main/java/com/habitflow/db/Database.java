package com.habitflow.db;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Properties;
import java.util.function.Supplier;

/**
 * Owns the single JDBC connection of this desktop app.
 * All access is serialized on one lock, so the reminder thread and the UI thread never interleave statements.
 */
public final class Database {
    private static final Object LOCK = new Object();
    private static final Properties CONFIG = loadConfig();
    private static Connection connection;

    private Database() { }

    @FunctionalInterface
    public interface SqlWork<R> {
        R run(Connection c) throws SQLException;
    }

    private static Properties loadConfig() {
        Properties p = new Properties();
        try (InputStream in = Database.class.getResourceAsStream("/db.properties")) {
            if (in != null) p.load(in);
        } catch (IOException e) {
            throw new IllegalStateException("Cannot read db.properties", e);
        }
        for (String key : new String[]{"url", "user", "password"}) {
            String override = System.getProperty("habitflow.db." + key);
            if (override != null) p.setProperty(key, override);
        }
        return p;
    }

    public static String url() {
        return CONFIG.getProperty("url");
    }

    private static Connection connection() throws SQLException {
        if (connection == null || connection.isClosed()) {
            String user = CONFIG.getProperty("user", "");
            // Homebrew/Postgres.app create a superuser named after the OS account
            if (user.isBlank()) user = System.getProperty("user.name");
            connection = DriverManager.getConnection(url(), user, CONFIG.getProperty("password", ""));
        }
        return connection;
    }

    /** Runs work on the shared connection; SQLExceptions become DataAccessException. */
    static <R> R with(SqlWork<R> work) {
        synchronized (LOCK) {
            try {
                return work.run(connection());
            } catch (SQLException e) {
                throw new DataAccessException(e.getMessage(), e);
            }
        }
    }

    /** Runs work atomically. Nested calls join the outer transaction. Any exception rolls everything back. */
    public static <R> R inTransaction(Supplier<R> work) {
        synchronized (LOCK) {
            try {
                Connection c = connection();
                if (!c.getAutoCommit()) return work.get();
                c.setAutoCommit(false);
                try {
                    R result = work.get();
                    c.commit();
                    return result;
                } catch (RuntimeException e) {
                    c.rollback();
                    throw e;
                } finally {
                    c.setAutoCommit(true);
                }
            } catch (SQLException e) {
                throw new DataAccessException(e.getMessage(), e);
            }
        }
    }

    public static void inTransaction(Runnable work) {
        inTransaction(() -> { work.run(); return null; });
    }

    /** Executes a SQL script from the classpath (pgjdbc accepts multiple statements in one execute). */
    public static void runScript(String resource) {
        String sql;
        try (InputStream in = Database.class.getResourceAsStream(resource)) {
            if (in == null) throw new IllegalArgumentException("Missing script " + resource);
            sql = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        with(c -> {
            try (Statement st = c.createStatement()) {
                st.execute(sql);
            }
            return null;
        });
    }

    /** Fails fast with a readable message when PostgreSQL is not reachable. */
    public static void checkConnection() {
        with(c -> c.isValid(2));
    }
}
