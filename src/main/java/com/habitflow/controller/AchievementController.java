package com.habitflow.controller;

import com.habitflow.db.*;
import com.habitflow.model.Achievement;
import com.habitflow.model.Habit;
import com.habitflow.model.HabitSummary;
import com.habitflow.model.User;

import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

/** Checks badge rules after anything that could unlock one, and pays out their coin reward once. */
public class AchievementController implements CheckInListener {
    private final AchievementDao achievements = new AchievementDao();
    private final HabitDao habits = new HabitDao();
    private final CheckInDao checkIns = new CheckInDao();
    private final FriendDao friends = new FriendDao();
    private final CoinDao coins = new CoinDao();
    private final JournalDao journal = new JournalDao();
    private final UserDao users = new UserDao();
    private final List<Consumer<Achievement>> unlockListeners = new CopyOnWriteArrayList<>();

    public List<Achievement> list() {
        return achievements.listFor(Session.require().getId());
    }

    public void addUnlockListener(Consumer<Achievement> l) { unlockListeners.add(l); }

    @Override
    public void onCheckIn(Habit habit, LocalDate day, boolean completed) {
        if (completed) evaluate();
    }

    /** Awards every rule that is now met and not yet earned. Returns the new ones. */
    public List<Achievement> evaluate() {
        User u = Session.require();
        int id = u.getId();
        List<HabitSummary> summaries = HabitStats.summarizeAll(id, false, habits, checkIns);
        long totalDone = checkIns.countCompleted(id);
        int bestStreak = summaries.stream().filter(s -> s.habit().getSchedule().streakUnit().equals("days"))
                .mapToInt(HabitSummary::longestStreak).max().orElse(0);
        List<HabitSummary> due = summaries.stream().filter(HabitSummary::dueToday).toList();

        Map<String, Boolean> rules = new LinkedHashMap<>();
        rules.put("FIRST_CHECKIN", totalDone >= 1);
        rules.put("STREAK_7", bestStreak >= 7);
        rules.put("STREAK_30", bestStreak >= 30);
        rules.put("STREAK_100", bestStreak >= 100);
        rules.put("CHECKINS_100", totalDone >= 100);
        rules.put("CHECKINS_1000", totalDone >= 1000);
        rules.put("PERFECT_DAY", !due.isEmpty() && due.stream().allMatch(HabitSummary::doneToday));
        rules.put("FIVE_HABITS", summaries.size() >= 5);
        rules.put("FIRST_FRIEND", !friends.friends(id).isEmpty());
        rules.put("FIRST_PURCHASE", coins.countPurchases(id) >= 1);
        rules.put("JOURNAL_7", journal.count(id) >= 7);

        List<Achievement> unlocked = new ArrayList<>();
        Database.inTransaction(() -> {
            for (Achievement a : achievements.listFor(id)) {
                if (a.isEarned() || !rules.getOrDefault(a.code(), false)) continue;
                if (achievements.award(id, a.code())) {
                    if (a.reward() > 0) {
                        users.addCoins(id, a.reward());
                        coins.log(id, a.reward(), "Achievement: " + a.name());
                    }
                    unlocked.add(a);
                }
            }
        });
        if (!unlocked.isEmpty()) {
            Session.refresh();
            unlocked.forEach(a -> unlockListeners.forEach(l -> l.accept(a)));
        }
        return unlocked;
    }
}
