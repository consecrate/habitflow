package com.habitflow.model;

import java.util.List;

/** A friend seen read-only: only the habits they chose to share. */
public class Partner extends Person {
    /** One shared habit as the friend sees it. */
    public record SharedHabit(String name, String color, int currentStreak, String streakUnit, int strength, boolean doneToday) {
        public String formatStreak() { return Schedule.formatStreak(currentStreak, streakUnit); }
    }

    private final List<SharedHabit> sharedHabits;

    public Partner(int id, String username, String displayName, List<SharedHabit> sharedHabits) {
        super(id, username, displayName);
        this.sharedHabits = List.copyOf(sharedHabits);
    }

    public List<SharedHabit> getSharedHabits() { return sharedHabits; }

    @Override
    public String roleLabel() { return "Accountability partner"; }
}
