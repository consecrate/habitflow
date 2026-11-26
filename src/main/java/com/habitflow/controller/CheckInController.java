package com.habitflow.controller;

import com.habitflow.controller.logic.CoinCalculator;
import com.habitflow.db.*;
import com.habitflow.model.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;

/** Recording progress. Coins are earned only for completing a habit today, and taken back on undo. */
public class CheckInController {
    /** What a check-in changed, for the UI to show. */
    public record Result(boolean completed, int coinsDelta) { }

    private final CheckInDao checkIns = new CheckInDao();
    private final UserDao users = new UserDao();
    private final CoinDao coins = new CoinDao();
    private final PowerUpDao powerUps = new PowerUpDao();
    private final AuditDao audit = new AuditDao();
    private final JournalDao journal = new JournalDao();
    private final List<CheckInListener> listeners = new CopyOnWriteArrayList<>();
    private final AchievementController achievements;

    public CheckInController(AchievementController achievements) {
        this.achievements = achievements;
        addListener(achievements);
    }

    public void addListener(CheckInListener l) { listeners.add(l); }

    /** One click: mark the habit fully done today. */
    public Result checkIn(Habit habit) {
        return checkIn(habit, habit.completeValue());
    }

    /** Set today's value (count, minutes, or 1/0). */
    public Result checkIn(Habit habit, double value) {
        return checkIn(habit, value, LocalDate.now(), null);
    }

    /** Set the value for any day since the habit was created (backfill). Past edits are audited. */
    public Result checkIn(Habit habit, double value, LocalDate day, String note) {
        User u = Session.require();
        LocalDate today = LocalDate.now();
        if (habit.getUserId() != u.getId()) throw new IllegalArgumentException("Not your habit");
        if (day.isAfter(today)) throw new IllegalArgumentException("You cannot check in for the future");
        if (day.isBefore(habit.getCreatedOn())) throw new IllegalArgumentException("That day is before the habit was created (" + habit.getCreatedOn() + ")");
        if (value < 0 || Double.isNaN(value)) throw new IllegalArgumentException("Value cannot be negative");
        String cleanNote = cleanNote(note, 200);

        Result result = Database.inTransaction(() -> {
            Optional<CheckIn> prev = checkIns.find(habit.getId(), day);
            boolean wasDone = prev.isPresent() && !prev.get().frozen() && habit.isCompleted(prev.get().value());
            boolean nowDone = habit.isCompleted(value);
            int awarded = prev.map(CheckIn::coinsAwarded).orElse(0);
            int delta = 0;

            if (!wasDone && nowDone && day.equals(today) && awarded == 0) {
                List<CheckIn> history = new ArrayList<>(checkIns.forHabit(habit.getId()));
                history.removeIf(c -> c.day().equals(day));
                history.add(new CheckIn(habit.getId(), day, value, cleanNote, false, 0));
                int streak = HabitStats.summarize(habit, history, today).currentStreak();
                boolean doubled = powerUps.activeUntil(u.getId(), DoubleCoins.CODE).isPresent();
                delta = CoinCalculator.reward(streak, doubled);
                users.addCoins(u.getId(), delta);
                coins.log(u.getId(), delta, "Completed " + habit.getName() + (doubled ? " (x2)" : ""));
                awarded = delta;
            } else if (wasDone && !nowDone && awarded > 0) {
                int refund = Math.min(awarded, users.coins(u.getId()));
                if (refund > 0) {
                    users.addCoins(u.getId(), -refund);
                    coins.log(u.getId(), -refund, "Undid " + habit.getName());
                }
                delta = -refund;
                awarded = 0;
            }

            if (value == 0 && cleanNote == null) checkIns.delete(habit.getId(), day);
            else checkIns.upsert(new CheckIn(habit.getId(), day, value, cleanNote, false, awarded));

            if (!day.equals(today)) {
                audit.log(u.getId(), "BACKFILL", habit.getName() + " on " + day + ": "
                        + prev.map(c -> habit.formatValue(c.value())).orElse("empty") + " -> " + habit.formatValue(value));
            }
            return new Result(nowDone, delta);
        });
        if (result.coinsDelta() != 0) Session.refresh();
        listeners.forEach(l -> l.onCheckIn(habit, day, result.completed()));
        return result;
    }

    /** Clears a day completely. */
    public Result undo(Habit habit, LocalDate day) {
        return checkIn(habit, 0, day, null);
    }

    public List<CheckIn> history(Habit habit) {
        if (habit.getUserId() != Session.require().getId()) throw new IllegalArgumentException("Not your habit");
        return checkIns.forHabit(habit.getId());
    }

    public Optional<CheckIn> find(Habit habit, LocalDate day) {
        return checkIns.find(habit.getId(), day);
    }

    // ---- Mood journal ----

    public void saveJournal(LocalDate day, int mood, String note) {
        if (day.isAfter(LocalDate.now())) throw new IllegalArgumentException("You cannot write about the future");
        journal.upsert(Session.require().getId(), new JournalEntry(day, mood, cleanNote(note, 500)));
        achievements.evaluate();
    }

    private static String cleanNote(String note, int maxLen) {
        if (note == null || note.isBlank()) return null;
        String trimmed = note.trim();
        if (trimmed.length() > maxLen) throw new IllegalArgumentException("Note must be at most " + maxLen + " characters");
        return trimmed;
    }

    public Optional<JournalEntry> journalFor(LocalDate day) {
        return journal.find(Session.require().getId(), day);
    }

    public List<JournalEntry> journal() {
        return journal.list(Session.require().getId());
    }
}
