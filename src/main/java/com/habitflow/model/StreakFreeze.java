package com.habitflow.model;

import java.time.LocalDate;
import java.util.List;

/** Protects yesterday if it was missed. Also used automatically at login. */
public class StreakFreeze extends PowerUp {
    public static final String CODE = "STREAK_FREEZE";

    public StreakFreeze(String name, String description, int price) { super(CODE, name, description, price); }

    @Override public boolean needsHabit() { return true; }
    @Override public String icon() { return "❄"; }

    @Override
    public String apply(PowerUpContext ctx, Habit target) {
        List<LocalDate> missed = ctx.missedDueDays(target, 1);
        if (missed.isEmpty()) throw new IllegalStateException(target.getName() + " did not miss yesterday, nothing to freeze.");
        ctx.protectDays(target, missed);
        return "Froze " + missed.get(0) + " for " + target.getName() + ".";
    }
}
