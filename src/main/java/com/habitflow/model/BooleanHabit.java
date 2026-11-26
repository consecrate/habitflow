package com.habitflow.model;

/** Done or not done, e.g. "Meditate". */
public class BooleanHabit extends Habit {
    @Override public HabitType getType() { return HabitType.BOOLEAN; }

    @Override public boolean isCompleted(double value) { return value >= 1; }

    @Override public String formatValue(double value) { return isCompleted(value) ? "Done" : "Not done"; }

    @Override public double getTarget() { return 1; }

    @Override public double completeValue() { return 1; }
}
