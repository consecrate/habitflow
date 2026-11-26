package com.habitflow.model;

/** Everything the UI shows about one habit, computed by the controller tier. */
public record HabitSummary(Habit habit, int currentStreak, int longestStreak, int strength,
                           double completionRate, double todayValue, boolean dueToday, int totalDone) {
    public boolean doneToday() { return habit.isCompleted(todayValue); }
}
