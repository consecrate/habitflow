package com.habitflow.model;

/** Reach a number of repetitions, e.g. "Drink 8 glasses of water". */
public class CountHabit extends Habit {
    @Override public HabitType getType() { return HabitType.COUNT; }

    @Override public boolean isCompleted(double value) { return value >= getTarget(); }

    @Override
    public String formatValue(double value) {
        return trim(value) + " / " + trim(getTarget()) + (getUnit().isEmpty() ? "" : " " + getUnit());
    }

    private static String trim(double v) {
        return v == Math.rint(v) ? String.valueOf((long) v) : String.valueOf(v);
    }
}
