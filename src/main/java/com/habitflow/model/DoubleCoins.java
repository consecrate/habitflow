package com.habitflow.model;

import java.time.Duration;

/** Doubles coin rewards for 24 hours. */
public class DoubleCoins extends PowerUp {
    public static final String CODE = "DOUBLE_COINS";

    public DoubleCoins(String name, String description, int price) { super(CODE, name, description, price); }

    @Override public boolean needsHabit() { return false; }
    @Override public String icon() { return "×2"; }

    @Override
    public String apply(PowerUpContext ctx, Habit target) {
        if (ctx.isEffectActive(CODE)) throw new IllegalStateException("Double Coins is already active.");
        ctx.activateEffect(CODE, Duration.ofHours(24));
        return "Double Coins is active for 24 hours.";
    }
}
