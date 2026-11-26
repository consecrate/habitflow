package com.habitflow.controller;

import com.habitflow.controller.logic.StreakCalculator;
import com.habitflow.controller.logic.StrengthScore;
import com.habitflow.db.CheckInDao;
import com.habitflow.db.HabitDao;
import com.habitflow.model.*;

import java.time.LocalDate;
import java.util.*;

/** Shared calculations used by several controllers. Package-private: not part of the API to the UI. */
final class HabitStats {
    private HabitStats() { }

    /** Days the habit counts as met: really completed, or protected by a power-up. */
    static Set<LocalDate> doneDays(Habit h, List<CheckIn> checkIns) {
        Set<LocalDate> out = new HashSet<>();
        for (CheckIn c : checkIns) if (c.frozen() || h.isCompleted(c.value())) out.add(c.day());
        return out;
    }

    static HabitSummary summarize(Habit h, List<CheckIn> checkIns, LocalDate today) {
        Set<LocalDate> done = doneDays(h, checkIns);
        List<Double> outcomes = h.getSchedule().outcomes(h.getCreatedOn(), today, done);
        boolean weekly = h.getSchedule().streakUnit().equals("weeks");
        int strength = weekly ? StrengthScore.compute(outcomes, 3) : StrengthScore.compute(outcomes);
        double todayValue = 0;
        int totalDone = 0;
        for (CheckIn c : checkIns) {
            if (!c.frozen() && h.isCompleted(c.value())) totalDone++;
            if (c.day().equals(today)) todayValue = c.frozen() ? h.completeValue() : c.value();
        }
        return new HabitSummary(h, StreakCalculator.current(outcomes), StreakCalculator.longest(outcomes), strength,
                StreakCalculator.completionRate(outcomes), todayValue, h.getSchedule().isDue(today, h.getCreatedOn(), done), totalDone);
    }

    static List<HabitSummary> summarizeAll(int userId, boolean includeArchived, HabitDao habits, CheckInDao checkIns) {
        Map<Integer, List<CheckIn>> byHabit = checkIns.allForUser(userId);
        LocalDate today = LocalDate.now();
        List<HabitSummary> out = new ArrayList<>();
        for (Habit h : habits.list(userId, includeArchived)) {
            out.add(summarize(h, byHabit.getOrDefault(h.getId(), List.of()), today));
        }
        return out;
    }
}
