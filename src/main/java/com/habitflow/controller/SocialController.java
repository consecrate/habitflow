package com.habitflow.controller;

import com.habitflow.db.*;
import com.habitflow.model.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** Accountability partners: friend requests and a read-only view of friends' shared habits. */
public class SocialController {
    private final UserDao users = new UserDao();
    private final FriendDao friends = new FriendDao();
    private final HabitDao habits = new HabitDao();
    private final CheckInDao checkIns = new CheckInDao();
    private final AuditDao audit = new AuditDao();
    private final AchievementController achievements;

    public SocialController(AchievementController achievements) {
        this.achievements = achievements;
    }

    public void sendRequest(String username) {
        User me = Session.require();
        String name = username == null ? "" : username.trim().toLowerCase();
        User other = users.findByUsername(name).orElseThrow(() -> new IllegalArgumentException("No user called '" + name + "'"));
        if (other.getId() == me.getId()) throw new IllegalArgumentException("You cannot add yourself");
        if (friends.exists(me.getId(), other.getId())) throw new IllegalArgumentException("You are already connected or a request is pending");
        friends.request(me.getId(), other.getId());
        audit.log(me.getId(), "FRIEND_REQUEST", "Sent to @" + other.getUsername());
    }

    public List<FriendRequest> incoming() { return friends.incoming(Session.require().getId()); }

    public List<FriendRequest> outgoing() { return friends.outgoing(Session.require().getId()); }

    public void accept(FriendRequest r) {
        int me = Session.require().getId();
        if (!friends.accept(r.fromUserId(), me)) throw new IllegalStateException("That request no longer exists");
        audit.log(me, "FRIEND_ACCEPT", "Now partners with @" + r.username());
        achievements.evaluate();
    }

    public void decline(FriendRequest r) { friends.remove(Session.require().getId(), r.fromUserId()); }

    public void remove(Partner p) {
        int me = Session.require().getId();
        friends.remove(me, p.getId());
        audit.log(me, "FRIEND_REMOVE", "Removed @" + p.getUsername());
    }

    /** Friends with only the habits they marked as shared. */
    public List<Partner> partners() {
        LocalDate today = LocalDate.now();
        List<Partner> out = new ArrayList<>();
        for (FriendRequest f : friends.friends(Session.require().getId())) {
            List<Partner.SharedHabit> shared = new ArrayList<>();
            for (Habit h : habits.listShared(f.fromUserId())) {
                HabitSummary s = HabitStats.summarize(h, checkIns.forHabit(h.getId()), today);
                shared.add(new Partner.SharedHabit(h.getName(), h.getColor(), s.currentStreak(), h.getSchedule().streakUnit(), s.strength(), s.doneToday()));
            }
            out.add(new Partner(f.fromUserId(), f.username(), f.displayName(), shared));
        }
        return out;
    }
}
