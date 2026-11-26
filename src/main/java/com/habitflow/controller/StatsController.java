package com.habitflow.controller;

import com.habitflow.controller.logic.Correlation;
import com.habitflow.controller.logic.StreakCalculator;
import com.habitflow.db.CheckInDao;
import com.habitflow.db.HabitDao;
import com.habitflow.db.JournalDao;
import com.habitflow.model.*;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.*;

/** Read-only numbers for the dashboard, statistics page, heatmap and mood insights. */
public class StatsController {
    /** "On days you do X your mood averages A, otherwise B" with Pearson r. */
    public record MoodInsight(String habitName, double moodWhenDone, double moodWhenSkipped, double r, int days) { }

    public record Overview(int activeHabits, int dueToday, int doneToday, long totalCheckIns, int bestCurrentStreak, int averageStrength) { }

    private final HabitDao habits = new HabitDao();
    private final CheckInDao checkIns = new CheckInDao();
    private final JournalDao journal = new JournalDao();

    private int userId() { return Session.require().getId(); }

    public List<HabitSummary> summaries() {
        return HabitStats.summarizeAll(userId(), false, habits, checkIns);
    }

    public Overview overview(List<HabitSummary> s) {
        List<HabitSummary> due = s.stream().filter(HabitSummary::dueToday).toList();
        return new Overview(s.size(), due.size(), (int) due.stream().filter(HabitSummary::doneToday).count(),
                checkIns.countCompleted(userId()),
                s.stream().mapToInt(HabitSummary::currentStreak).max().orElse(0),
                (int) Math.round(s.stream().mapToInt(HabitSummary::strength).average().orElse(0)));
    }

    /** Completion rate over the habit's whole life. */
    public double completionRate(Habit h) {
        return completionRate(h, h.getCreatedOn(), LocalDate.now());
    }

    /** Completion rate between two days (inclusive). */
    public double completionRate(Habit h, LocalDate from, LocalDate to) {
        LocalDate start = from.isBefore(h.getCreatedOn()) ? h.getCreatedOn() : from;
        if (start.isAfter(to)) return 0;
        Set<LocalDate> done = HabitStats.doneDays(h, checkIns.forHabit(h.getId()));
        return StreakCalculator.completionRate(h.getSchedule().outcomes(start, to, done));
    }

    public LinkedHashMap<LocalDate, Integer> trend(int days) {
        LocalDate today = LocalDate.now();
        return checkIns.completedPerDay(userId(), today.minusDays(days - 1L), today);
    }

    public EnumMap<DayOfWeek, Integer> byWeekday(int days) {
        return checkIns.completedPerWeekday(userId(), LocalDate.now().minusDays(days - 1L));
    }

    public LinkedHashMap<String, Integer> byCategory(int days) {
        return checkIns.completedPerCategory(userId(), LocalDate.now().minusDays(days - 1L));
    }

    /**
     * Intensity 0..1 per day for the last year. For one habit: progress toward its target
     * (protected days count as 1). For all habits (habit = null): share of habits completed that day.
     */
    public Map<LocalDate, Double> heatmap(Habit habit) {
        LocalDate from = LocalDate.now().minusDays(364);
        Map<LocalDate, Double> out = new HashMap<>();
        if (habit != null) {
            for (CheckIn c : checkIns.forHabit(habit.getId())) {
                if (!c.day().isBefore(from)) out.put(c.day(), c.frozen() ? 1.0 : habit.progress(c.value()));
            }
            return out;
        }
        int active = Math.max(1, habits.countActive(userId()));
        checkIns.completedPerDay(userId(), from, LocalDate.now()).forEach((d, n) -> out.put(d, Math.min(1.0, n / (double) active)));
        return out;
    }

    /** For each habit with enough journal days: how mood differs on days it was done. Strongest first. */
    public List<MoodInsight> moodInsights() {
        Map<LocalDate, Integer> mood = new HashMap<>();
        for (JournalEntry e : journal.list(userId())) mood.put(e.day(), e.mood());
        Map<Integer, List<CheckIn>> byHabit = checkIns.allForUser(userId());
        List<MoodInsight> out = new ArrayList<>();
        for (Habit h : habits.list(userId(), false)) {
            Set<LocalDate> done = HabitStats.doneDays(h, byHabit.getOrDefault(h.getId(), List.of()));
            List<double[]> pairs = new ArrayList<>();
            mood.forEach((day, m) -> {
                if (!day.isBefore(h.getCreatedOn()) && h.getSchedule().isDue(day, h.getCreatedOn(), done)) {
                    pairs.add(new double[]{done.contains(day) ? 1 : 0, m});
                }
            });
            long doneDays = pairs.stream().filter(p -> p[0] == 1).count();
            if (doneDays < 5 || pairs.size() - doneDays < 5) continue; // too little data in one group
            double[] x = pairs.stream().mapToDouble(p -> p[0]).toArray();
            double[] y = pairs.stream().mapToDouble(p -> p[1]).toArray();
            double r = Correlation.pearson(x, y);
            if (Double.isNaN(r)) continue;
            double withIt = pairs.stream().filter(p -> p[0] == 1).mapToDouble(p -> p[1]).average().orElse(0);
            double without = pairs.stream().filter(p -> p[0] == 0).mapToDouble(p -> p[1]).average().orElse(0);
            out.add(new MoodInsight(h.getName(), withIt, without, r, pairs.size()));
        }
        out.sort(Comparator.comparingDouble((MoodInsight i) -> Math.abs(i.r())).reversed());
        return out;
    }
}
