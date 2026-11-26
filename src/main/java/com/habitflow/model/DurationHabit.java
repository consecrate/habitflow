package com.habitflow.model;

/** Spend a number of minutes, e.g. "Read 30 minutes". Values are stored in minutes. */
public class DurationHabit extends Habit {
    @Override public HabitType getType() { return HabitType.DURATION; }

    @Override public boolean isCompleted(double minutes) { return minutes >= getTarget(); }

    @Override public String formatValue(double minutes) { return format(minutes) + " / " + format(getTarget()); }

    @Override public String getUnit() { return "min"; }

    static String format(double minutes) {
        long m = Math.round(minutes);
        return m >= 60 ? (m / 60) + "h " + String.format("%02dm", m % 60) : m + "m";
    }
}
