package com.habitflow.model;

import java.util.List;

/** Marks today as protected for one habit. */
public class RestDay extends PowerUp {
    public static final String CODE = "REST_DAY";

    public RestDay(String name, String description, int price) { super(CODE, name, description, price); }

    @Override public boolean needsHabit() { return true; }
    @Override public String icon() { return "☾"; }

    @Override
    public String apply(PowerUpContext ctx, Habit target) {
        if (ctx.isDoneOn(target, ctx.today())) throw new IllegalStateException(target.getName() + " is already done today.");
        ctx.protectDays(target, List.of(ctx.today()));
        return "Rest day taken for " + target.getName() + ". Enjoy!";
    }
}
