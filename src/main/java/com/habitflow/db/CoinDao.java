package com.habitflow.db;

import com.habitflow.model.CoinTransaction;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

/** Append-only history of every coin change; its sum always equals users.coins. */
public class CoinDao extends BaseDao<CoinTransaction> {
    @Override
    protected CoinTransaction mapRow(ResultSet rs) throws SQLException {
        return new CoinTransaction(rs.getInt("delta"), rs.getString("reason"), timestamp(rs, "created_at"));
    }

    public void log(int userId, int delta, String reason) {
        update("INSERT INTO coin_ledger (user_id, delta, reason) VALUES (?, ?, ?)", userId, delta, reason);
    }

    public List<CoinTransaction> recent(int userId, int limit) {
        return queryList("SELECT * FROM coin_ledger WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?", userId, limit);
    }

    public int countPurchases(int userId) {
        return (int) scalar("SELECT count(*) FROM coin_ledger WHERE user_id = ? AND reason LIKE 'Bought %'", userId);
    }
}
