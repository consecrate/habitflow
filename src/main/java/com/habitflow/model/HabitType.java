package com.habitflow.model;

/** The three ways a habit can be measured. Each constant knows how to create its Habit subclass. */
public enum HabitType {
    BOOLEAN("Yes / No") {
        @Override public Habit newHabit() { return new BooleanHabit(); }
    },
    COUNT("Count") {
        @Override public Habit newHabit() { return new CountHabit(); }
    },
    DURATION("Duration (minutes)") {
        @Override public Habit newHabit() { return new DurationHabit(); }
    };

    private final String label;

    HabitType(String label) { this.label = label; }

    public abstract Habit newHabit();

    @Override
    public String toString() { return label; }
}
