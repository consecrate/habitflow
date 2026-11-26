package com.habitflow.controller.logic;

import java.util.List;

/**
 * Habit strength 0-100 as an exponential moving average of outcomes.
 * With a half-life of 13 periods, one miss after a long run costs only a few points,
 * while a long break slowly drains the score.
 */
public final class StrengthScore {
    public static final double DEFAULT_HALF_LIFE = 13.0;

    private StrengthScore() { }

    public static int compute(List<Double> outcomes) {
        return compute(outcomes, DEFAULT_HALF_LIFE);
    }

    public static int compute(List<Double> outcomes, double halfLife) {
        if (halfLife <= 0) throw new IllegalArgumentException("halfLife must be positive");
        double alpha = 1 - Math.pow(0.5, 1 / halfLife);
        double score = 0;
        for (double o : outcomes) score = score * (1 - alpha) + alpha * o;
        return (int) Math.round(score * 100);
    }
}
