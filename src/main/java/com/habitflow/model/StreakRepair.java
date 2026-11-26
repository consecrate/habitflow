package com.habitflow.model;

import java.time.LocalDate;
import java.util.List;

/** Fills every missed due day in the last 48 hours. */
public class StreakRepair extends PowerUp {
    public static final String CODE = "STREAK_REPAIR";

    public StreakRepair(String name, String description, int price) { super(CODE, name, description, price); }

    @Override public boolean needsHabit() { return true; }
    @Override public String icon() { return "✚"; }

    @Override
    public String apply(PowerUpContext ctx, Habit target) {
        List<LocalDate> missed = ctx.missedDueDays(target, 2);
        if (missed.isEmpty()) throw new IllegalStateException(target.getName() + " has no missed days in the last 48 hours.");
        ctx.protectDays(target, missed);
        return "Repaired " + missed.size() + " day(s) of " + target.getName() + ".";
    }
}
