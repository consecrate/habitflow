package com.habitflow.tools;

import com.habitflow.controller.*;
import com.habitflow.controller.logic.CoinCalculator;
import com.habitflow.db.*;
import com.habitflow.model.*;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.*;

/**
 * Fills the database with a year of believable demo data for users "demo", "sam" and "kai"
 * (password demo1234). Only those three accounts are replaced; other accounts are untouched.
 * Run: mvn -q compile exec:java
 */
public final class Seeder {
    public static final String PASSWORD = "demo1234";
    private static final Random RNG = new Random(42); // same data every run
    private static final LocalDate TODAY = LocalDate.now();

    private final AuthController auth = new AuthController();
    private final AchievementController achievements = new AchievementController();
    private final ShopController shop = new ShopController(achievements);
    private final SocialController social = new SocialController(achievements);
    private final HabitDao habits = new HabitDao();
    private final CheckInDao checkIns = new CheckInDao();
    private final CategoryDao categories = new CategoryDao();
    private final JournalDao journal = new JournalDao();
    private final UserDao users = new UserDao();
    private final CoinDao coins = new CoinDao();
    private final ReminderDao reminders = new ReminderDao();

    /** How one demo habit behaves. adherence = chance of doing it on a due day. */
    private record Spec(String name, HabitType type, double target, String unit, Schedule schedule, String category,
                        String color, int ageDays, double adherence, boolean shared) { }

    public static void main(String[] args) {
        Database.runScript("/schema.sql");
        new Seeder().run();
        System.exit(0);
    }

    private void run() {
        for (String u : List.of("demo", "sam", "kai")) users.deleteByUsername(u);

        // --- sam: the accountability partner ---
        auth.register("sam", "Sam Carter", PASSWORD, PASSWORD);
        Map<String, Integer> samCats = cats(Session.require().getId());
        Map<String, Habit> sam = new LinkedHashMap<>();
        for (Spec s : List.of(
                new Spec("Cycling", HabitType.DURATION, 45, "", new TimesPerWeekSchedule(3), "Health", "#2E86AB", 160, 0.55, true),
                new Spec("Practice guitar", HabitType.DURATION, 20, "", new DailySchedule(), "Learning", "#C47F2C", 120, 0.72, true),
                new Spec("Vitamins", HabitType.BOOLEAN, 1, "", new DailySchedule(), "Health", "#3A7D5C", 200, 0.9, false))) {
            sam.put(s.name(), seedHabit(s, samCats));
        }
        auth.logout();

        // --- demo: the main account ---
        auth.register("demo", "Linh Tran", PASSWORD, PASSWORD);
        int demoId = Session.require().getId();
        Map<String, Integer> demoCats = cats(demoId);
        int monToFri = 0b0011111;
        List<Spec> specs = List.of(
                new Spec("Morning run", HabitType.BOOLEAN, 1, "", new WeekdaySchedule(DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY), "Health", "#3A7D5C", 364, 0.82, true),
                new Spec("Drink water", HabitType.COUNT, 8, "glasses", new DailySchedule(), "Health", "#2E86AB", 364, 0.86, false),
                new Spec("Meditate", HabitType.DURATION, 10, "", new DailySchedule(), "Mind", "#6A5ACD", 300, 0.74, true),
                new Spec("Read", HabitType.DURATION, 30, "", new DailySchedule(), "Learning", "#C47F2C", 280, 0.7, false),
                new Spec("Evening journal", HabitType.BOOLEAN, 1, "", new DailySchedule(), "Mind", "#8E6CB0", 200, 0.62, false),
                new Spec("Gym", HabitType.BOOLEAN, 1, "", new TimesPerWeekSchedule(3), "Health", "#D1495B", 364, 0.5, true),
                new Spec("Learn Spanish", HabitType.DURATION, 15, "", new DailySchedule(), "Learning", "#E09F3E", 150, 0.6, false),
                new Spec("No phone after 10pm", HabitType.BOOLEAN, 1, "", new DailySchedule(), "Mind", "#5C6B73", 90, 0.55, false),
                new Spec("Inbox zero", HabitType.BOOLEAN, 1, "", new WeekdaySchedule(monToFri), "Work", "#4F7CAC", 240, 0.7, false),
                new Spec("Water the plants", HabitType.BOOLEAN, 1, "", new EveryNDaysSchedule(3), "Home", "#3E8E7E", 364, 0.9, false),
                new Spec("Push-ups", HabitType.COUNT, 50, "reps", new DailySchedule(), "Health", "#B5654A", 60, 0.6, false),
                new Spec("Deep work", HabitType.DURATION, 90, "", new WeekdaySchedule(monToFri), "Work", "#33658A", 120, 0.65, false));
        Map<String, Habit> demo = new LinkedHashMap<>();
        for (Spec s : specs) demo.put(s.name(), seedHabit(s, demoCats));

        storyline(demo);
        seedJournal(demoId, demo);
        seedCoins(demoId);
        reminders.upsert(demo.get("Drink water").getId(), LocalTime.of(10, 0), true);
        reminders.upsert(demo.get("Meditate").getId(), LocalTime.of(7, 30), true);
        reminders.upsert(demo.get("Read").getId(), LocalTime.of(21, 0), true);
        reminders.upsert(demo.get("Evening journal").getId(), LocalTime.of(22, 0), false);

        // demo and sam become partners
        social.sendRequest("sam");
        auth.logout();
        auth.login("sam", PASSWORD);
        social.accept(social.incoming().get(0));
        auth.logout();

        // kai sends demo a request that is still pending
        auth.register("kai", "Kai Morgan", PASSWORD, PASSWORD);
        social.sendRequest("demo");
        auth.logout();

        auth.login("demo", PASSWORD);
        achievements.evaluate();
        printTimings();
        System.out.println("Seeded: log in as demo / " + PASSWORD + " (also sam, kai). Coins: " + users.coins(demoId));
        auth.logout();
    }

    private Map<String, Integer> cats(int userId) {
        Map<String, Integer> m = new HashMap<>();
        String[][] defs = {{"Health", "#3A7D5C"}, {"Mind", "#6A5ACD"}, {"Learning", "#C47F2C"}, {"Work", "#4F7CAC"}, {"Home", "#3E8E7E"}};
        for (String[] d : defs) m.put(d[0], categories.create(userId, d[0], d[1]).id());
        return m;
    }

    /** Creates the habit and simulates its history: better adherence over time, momentum, weekend dips. */
    private Habit seedHabit(Spec s, Map<String, Integer> cats) {
        Habit h = s.type().newHabit();
        h.setName(s.name());
        if (s.type() != HabitType.BOOLEAN) h.setTarget(s.target());
        h.setUnit(s.unit());
        h.setSchedule(s.schedule());
        h.setCategoryId(cats.get(s.category()));
        h.setColor(s.color());
        h.setShared(s.shared());
        h.setUserId(Session.require().getId());
        h.setCreatedOn(TODAY.minusDays(s.ageDays()));
        habits.insert(h);

        Database.inTransaction(() -> {
            Set<LocalDate> done = new HashSet<>();
            boolean yesterday = false;
            for (LocalDate d = h.getCreatedOn(); d.isBefore(TODAY); d = d.plusDays(1)) {
                if (!h.getSchedule().isDue(d, h.getCreatedOn(), done)) continue;
                double age = 1 - (double) java.time.temporal.ChronoUnit.DAYS.between(h.getCreatedOn(), d) / Math.max(1, s.ageDays());
                double p = s.adherence() * (0.8 + 0.25 * (1 - age)) + (yesterday ? 0.06 : -0.04);
                if (d.getDayOfWeek().getValue() >= 6) p -= 0.08;
                boolean success = RNG.nextDouble() < p;
                yesterday = success;
                double value = success ? fullValue(h) : partialValue(h);
                if (value <= 0) continue;
                if (success) done.add(d);
                checkIns.upsert(new CheckIn(h.getId(), d, value, null, false, 0));
            }
        });
        return h;
    }

    private static double fullValue(Habit h) {
        if (h.getType() == HabitType.DURATION) return h.getTarget() + RNG.nextInt((int) Math.max(2, h.getTarget() / 3));
        return h.getTarget();
    }

    private static double partialValue(Habit h) {
        if (h.getType() == HabitType.BOOLEAN || RNG.nextDouble() < 0.5) return 0;
        return Math.max(1, Math.floor(h.getTarget() * (0.2 + 0.6 * RNG.nextDouble())));
    }

    /** Hand-made recent history so the demo tells a story (long streaks, one missed day to freeze, today half done). */
    private void storyline(Map<String, Habit> demo) {
        Database.inTransaction(() -> {
            fill(demo.get("Drink water"), 48, 1);       // 48-day streak
            fill(demo.get("Morning run"), 60, 1);
            fill(demo.get("Meditate"), 23, 1);
            fill(demo.get("Read"), 19, 2);              // ...then missed yesterday: auto-freeze will save it
            checkIns.delete(demo.get("Read").getId(), TODAY.minusDays(1));
            fill(demo.get("Inbox zero"), 30, 1);
            // today so far
            put(demo.get("Drink water"), TODAY, 5);
            put(demo.get("Meditate"), TODAY, 12);
            put(demo.get("Inbox zero"), TODAY, 1);
        });
    }

    private void fill(Habit h, int days, int skipLast) {
        for (LocalDate d = TODAY.minusDays(days); d.isBefore(TODAY.minusDays(skipLast - 1L)); d = d.plusDays(1)) {
            if (!d.isBefore(h.getCreatedOn()) && h.getSchedule().isDue(d, h.getCreatedOn(), Set.of())) put(h, d, fullValue(h));
        }
    }

    private void put(Habit h, LocalDate d, double value) {
        checkIns.upsert(new CheckIn(h.getId(), d, value, null, false, 0));
    }

    /** Mood that really depends on meditation, running and phone use, so the insights page finds something true. */
    private void seedJournal(int userId, Map<String, Habit> demo) {
        Map<Integer, List<CheckIn>> all = checkIns.allForUser(userId);
        Set<LocalDate> meditate = days(demo.get("Meditate"), all);
        Set<LocalDate> run = days(demo.get("Morning run"), all);
        Set<LocalDate> phone = days(demo.get("No phone after 10pm"), all);
        String[] notes = {"Slept well.", "Busy day at work.", "Felt calm after meditating.", "Tired, skipped the evening plan.",
                "Great run this morning!", "Rainy and slow.", "Productive deep work session.", "Dinner with friends."};
        Database.inTransaction(() -> {
            for (LocalDate d = TODAY.minusDays(180); d.isBefore(TODAY); d = d.plusDays(1)) {
                if (RNG.nextDouble() > 0.72) continue;
                double mood = 2.6 + (meditate.contains(d) ? 0.9 : 0) + (run.contains(d) ? 0.5 : 0)
                        + (phone.contains(d) ? 0.3 : 0) + RNG.nextGaussian() * 0.6;
                int m = (int) Math.max(1, Math.min(5, Math.round(mood)));
                journal.upsert(userId, new JournalEntry(d, m, RNG.nextDouble() < 0.4 ? notes[RNG.nextInt(notes.length)] : null));
            }
        });
    }

    private static Set<LocalDate> days(Habit h, Map<Integer, List<CheckIn>> all) {
        Set<LocalDate> s = new HashSet<>();
        for (CheckIn c : all.getOrDefault(h.getId(), List.of())) if (h.isCompleted(c.value())) s.add(c.day());
        return s;
    }

    /** The coin system "launched" 21 days ago: pay for completions since then, then go shopping. */
    private void seedCoins(int userId) {
        Database.inTransaction(() -> {
            int total = 0;
            for (Habit h : habits.list(userId, false)) {
                List<CheckIn> list = checkIns.forHabit(h.getId());
                for (CheckIn c : list) {
                    if (c.day().isBefore(TODAY.minusDays(21)) || !h.isCompleted(c.value())) continue;
                    int reward = CoinCalculator.reward(Math.min(30, (int) (21 - java.time.temporal.ChronoUnit.DAYS.between(c.day(), TODAY))), false);
                    checkIns.upsert(new CheckIn(c.habitId(), c.day(), c.value(), c.note(), false, reward));
                    total += reward;
                }
            }
            users.addCoins(userId, total);
            coins.log(userId, total, "Completed habits (last 3 weeks)");
        });
        Map<String, PowerUp> byCode = new HashMap<>();
        shop.catalog().forEach(p -> byCode.put(p.getCode(), p));
        shop.buy(byCode.get(StreakFreeze.CODE));
        shop.buy(byCode.get(StreakFreeze.CODE));
        shop.buy(byCode.get(RestDay.CODE));
        shop.buy(byCode.get(DoubleCoins.CODE));
    }

    private void printTimings() {
        StatsController stats = new StatsController();
        stats.summaries(); // warm-up
        long t0 = System.nanoTime();
        var s = stats.summaries();
        stats.overview(s);
        long t1 = System.nanoTime();
        stats.trend(90);
        stats.byWeekday(90);
        stats.byCategory(30);
        stats.heatmap(null);
        stats.moodInsights();
        long t2 = System.nanoTime();
        int rows = checkIns.allForUser(Session.require().getId()).values().stream().mapToInt(List::size).sum();
        System.out.printf("Timing with %d check-ins: Today dashboard %.1f ms, Statistics page %.1f ms%n",
                rows, (t1 - t0) / 1e6, (t2 - t1) / 1e6);
    }
}
