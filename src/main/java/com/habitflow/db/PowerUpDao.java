package com.habitflow.db;

import com.habitflow.model.InventoryItem;
import com.habitflow.model.PowerUp;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/** SQL for the shop catalog, the user's inventory and timed effects. */
public class PowerUpDao extends BaseDao<PowerUp> {
    @Override
    protected PowerUp mapRow(ResultSet rs) throws SQLException {
        return PowerUp.create(rs.getString("code"), rs.getString("name"), rs.getString("description"), rs.getInt("price"));
    }

    public List<PowerUp> catalog() {
        return queryList("SELECT * FROM power_ups ORDER BY price");
    }

    public List<InventoryItem> inventory(int userId) {
        return queryRaw("SELECT p.*, u.qty FROM user_power_ups u JOIN power_ups p ON p.code = u.code WHERE u.user_id = ? AND u.qty > 0 ORDER BY p.price",
                rs -> new InventoryItem(mapRow(rs), rs.getInt("qty")), userId);
    }

    public int quantity(int userId, String code) {
        return (int) scalar("SELECT coalesce(max(qty), 0) FROM user_power_ups WHERE user_id = ? AND code = ?", userId, code);
    }

    /** Changes the owned quantity. Returns false instead of going below zero. */
    public boolean addQuantity(int userId, String code, int delta) {
        if (delta < 0) {
            return update("UPDATE user_power_ups SET qty = qty + ? WHERE user_id = ? AND code = ? AND qty + ? >= 0", delta, userId, code, delta) == 1;
        }
        update("INSERT INTO user_power_ups (user_id, code, qty) VALUES (?, ?, ?) ON CONFLICT (user_id, code) DO UPDATE SET qty = user_power_ups.qty + EXCLUDED.qty",
                userId, code, delta);
        return true;
    }

    public void addEffect(int userId, String code, LocalDateTime expiresAt) {
        update("INSERT INTO active_effects (user_id, code, expires_at) VALUES (?, ?, ?)", userId, code, expiresAt);
    }

    /** Expiry time of an effect that is still running, if any. */
    public Optional<LocalDateTime> activeUntil(int userId, String code) {
        return queryRaw("SELECT max(expires_at) AS t FROM active_effects WHERE user_id = ? AND code = ? AND expires_at > now()",
                rs -> timestamp(rs, "t"), userId, code).stream().filter(t -> t != null).findFirst();
    }
}
