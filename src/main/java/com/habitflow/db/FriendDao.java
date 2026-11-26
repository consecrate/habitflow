package com.habitflow.db;

import com.habitflow.model.FriendRequest;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

/** SQL for the friendships table: requests, accepting, and listing partners. */
public class FriendDao extends BaseDao<FriendRequest> {
    @Override
    protected FriendRequest mapRow(ResultSet rs) throws SQLException {
        return new FriendRequest(rs.getInt("id"), rs.getString("username"), rs.getString("display_name"), timestamp(rs, "created_at"));
    }

    /** Any row between the two users, in either direction. */
    public boolean exists(int a, int b) {
        return scalar("SELECT count(*) FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)", a, b, b, a) > 0;
    }

    public void request(int from, int to) {
        update("INSERT INTO friendships (requester_id, addressee_id) VALUES (?, ?)", from, to);
    }

    public List<FriendRequest> incoming(int userId) {
        return queryList("SELECT u.id, u.username, u.display_name, f.created_at FROM friendships f JOIN users u ON u.id = f.requester_id "
                + "WHERE f.addressee_id = ? AND f.status = 'PENDING' ORDER BY f.created_at", userId);
    }

    public List<FriendRequest> outgoing(int userId) {
        return queryList("SELECT u.id, u.username, u.display_name, f.created_at FROM friendships f JOIN users u ON u.id = f.addressee_id "
                + "WHERE f.requester_id = ? AND f.status = 'PENDING' ORDER BY f.created_at", userId);
    }

    public boolean accept(int from, int to) {
        return update("UPDATE friendships SET status = 'ACCEPTED' WHERE requester_id = ? AND addressee_id = ? AND status = 'PENDING'", from, to) == 1;
    }

    /** Declines a request or ends a friendship, whichever direction it was made in. */
    public void remove(int a, int b) {
        update("DELETE FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)", a, b, b, a);
    }

    public List<FriendRequest> friends(int userId) {
        return queryList("SELECT u.id, u.username, u.display_name, f.created_at FROM friendships f "
                + "JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END "
                + "WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'ACCEPTED' ORDER BY u.display_name", userId, userId, userId);
    }
}
