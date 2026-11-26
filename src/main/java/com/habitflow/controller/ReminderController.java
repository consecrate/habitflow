package com.habitflow.controller;

import com.habitflow.db.CheckInDao;
import com.habitflow.db.HabitDao;
import com.habitflow.db.ReminderDao;
import com.habitflow.model.Habit;
import com.habitflow.model.HabitSummary;
import com.habitflow.model.Reminder;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/** Per-habit reminder times, checked by a background thread while the app is open. */
public class ReminderController {
    private static final long CHECK_EVERY_SECONDS = 20;

    private final ReminderDao reminders = new ReminderDao();
    private final HabitDao habits = new HabitDao();
    private final CheckInDao checkIns = new CheckInDao();
    private ScheduledExecutorService scheduler;
    private LocalTime lastCheck;

    public List<Reminder> list() { return reminders.listFor(Session.require().getId()); }

    public LocalTime timeFor(int habitId) {
        return list().stream().filter(r -> r.habitId() == habitId && r.enabled()).map(Reminder::time).findFirst().orElse(null);
    }

    public void set(Habit h, LocalTime time, boolean enabled) {
        if (h.getUserId() != Session.require().getId()) throw new IllegalArgumentException("Not your habit");
        if (time == null) throw new IllegalArgumentException("Pick a time");
        reminders.upsert(h.getId(), time.withSecond(0).withNano(0), enabled);
    }

    public void save(Habit h, LocalTime time) {
        if (time == null) remove(h.getId());
        else set(h, time, true);
    }

    public void setEnabled(Reminder r, boolean enabled) {
        Habit h = habits.find(Session.require().getId(), r.habitId())
                .orElseThrow(() -> new IllegalArgumentException("Not your habit"));
        set(h, r.time(), enabled);
    }

    public void remove(int habitId) { reminders.delete(habitId); }

    /** Starts checking; the notifier is called (on the scheduler thread) for each habit that is due and not done. */
    public synchronized void start(Consumer<String> notifier) {
        stop();
        int userId = Session.require().getId();
        lastCheck = LocalTime.now();
        scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "reminders");
            t.setDaemon(true);
            return t;
        });
        scheduler.scheduleAtFixedRate(() -> {
            try {
                tick(userId, notifier);
            } catch (RuntimeException e) {
                System.err.println("Reminder check failed: " + e.getMessage()); // keep the scheduler alive
            }
        }, CHECK_EVERY_SECONDS, CHECK_EVERY_SECONDS, TimeUnit.SECONDS);
    }

    private void tick(int userId, Consumer<String> notifier) {
        LocalTime now = LocalTime.now();
        LocalTime from = lastCheck;
        lastCheck = now;
        if (now.isBefore(from)) return; // passed midnight
        for (Reminder r : reminders.listFor(userId)) {
            if (!r.enabled() || !r.time().isAfter(from) || r.time().isAfter(now)) continue;
            habits.find(userId, r.habitId()).ifPresent(h -> {
                HabitSummary s = HabitStats.summarize(h, checkIns.forHabit(h.getId()), LocalDate.now());
                if (s.dueToday() && !s.doneToday()) notifier.accept("Reminder: time for " + h.getName() + "!");
            });
        }
    }

    public synchronized void stop() {
        if (scheduler != null) scheduler.shutdownNow();
        scheduler = null;
    }
}
