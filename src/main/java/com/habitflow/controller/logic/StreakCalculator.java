package com.habitflow.controller.logic;

import java.util.List;

/** Streaks from schedule outcomes (see Schedule.outcomes): a period counts when it is fully met. */
public final class StreakCalculator {
    private static final double MET = 0.999;

    private StreakCalculator() { }

    public static int current(List<Double> outcomes) {
        int streak = 0;
        for (int i = outcomes.size() - 1; i >= 0 && outcomes.get(i) >= MET; i--) streak++;
        return streak;
    }

    public static int longest(List<Double> outcomes) {
        int best = 0, run = 0;
        for (double o : outcomes) {
            run = o >= MET ? run + 1 : 0;
            best = Math.max(best, run);
        }
        return best;
    }

    public static double completionRate(List<Double> outcomes) {
        return outcomes.stream().mapToDouble(Double::doubleValue).average().orElse(0);
    }
}
