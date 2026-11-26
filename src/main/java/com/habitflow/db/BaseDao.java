package com.habitflow.db;

import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Time;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Template for every DAO: subclasses write the SQL strings and say how one row becomes an object (mapRow).
 * Parameters are always bound through PreparedStatement, never concatenated, so input cannot inject SQL.
 */
public abstract class BaseDao<T> {

    /** Turns the current row of the result set into a domain object. */
    protected abstract T mapRow(ResultSet rs) throws SQLException;

    protected List<T> queryList(String sql, Object... params) {
        return Database.with(c -> {
            try (PreparedStatement ps = prepare(c.prepareStatement(sql), params); ResultSet rs = ps.executeQuery()) {
                List<T> out = new ArrayList<>();
                while (rs.next()) out.add(mapRow(rs));
                return out;
            }
        });
    }

    protected Optional<T> queryOne(String sql, Object... params) {
        List<T> rows = queryList(sql, params);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    /** For queries whose rows are not of type T (aggregates, joins). */
    protected <R> List<R> queryRaw(String sql, RowMapper<R> mapper, Object... params) {
        return Database.with(c -> {
            try (PreparedStatement ps = prepare(c.prepareStatement(sql), params); ResultSet rs = ps.executeQuery()) {
                List<R> out = new ArrayList<>();
                while (rs.next()) out.add(mapper.map(rs));
                return out;
            }
        });
    }

    protected long scalar(String sql, Object... params) {
        List<Long> v = queryRaw(sql, rs -> rs.getLong(1), params);
        return v.isEmpty() ? 0 : v.get(0);
    }

    protected int update(String sql, Object... params) {
        return Database.with(c -> {
            try (PreparedStatement ps = prepare(c.prepareStatement(sql), params)) {
                return ps.executeUpdate();
            }
        });
    }

    /** Runs an INSERT ... RETURNING id and returns the generated key. */
    protected int insert(String sql, Object... params) {
        return (int) scalar(sql, params);
    }

    @FunctionalInterface
    public interface RowMapper<R> {
        R map(ResultSet rs) throws SQLException;
    }

    private static PreparedStatement prepare(PreparedStatement ps, Object... params) throws SQLException {
        for (int i = 0; i < params.length; i++) {
            Object p = params[i];
            if (p instanceof LocalDate d) ps.setDate(i + 1, Date.valueOf(d));
            else if (p instanceof LocalDateTime t) ps.setTimestamp(i + 1, Timestamp.valueOf(t));
            else if (p instanceof LocalTime t) ps.setTime(i + 1, Time.valueOf(t));
            else ps.setObject(i + 1, p);
        }
        return ps;
    }

    protected static LocalDate date(ResultSet rs, String col) throws SQLException {
        Date d = rs.getDate(col);
        return d == null ? null : d.toLocalDate();
    }

    protected static LocalDateTime timestamp(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toLocalDateTime();
    }

    protected static Integer nullableInt(ResultSet rs, String col) throws SQLException {
        int v = rs.getInt(col);
        return rs.wasNull() ? null : v;
    }
}
