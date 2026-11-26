package com.habitflow.model;

/** An item bought with coins. Each subclass decides what using it does. */
public abstract class PowerUp {
    private final String code;
    private final String name;
    private final String description;
    private final int price;

    protected PowerUp(String code, String name, String description, int price) {
        if (price <= 0) throw new IllegalArgumentException("Price must be positive");
        this.code = code;
        this.name = name;
        this.description = description;
        this.price = price;
    }

    public final String getCode() { return code; }
    public final String getName() { return name; }
    public final String getDescription() { return description; }
    public final int getPrice() { return price; }

    /** Does the user have to pick a habit before using it? */
    public abstract boolean needsHabit();

    /**
     * Uses the power-up. Returns a message for the user, or throws IllegalStateException
     * when it would have no effect (so the item is not wasted).
     */
    public abstract String apply(PowerUpContext ctx, Habit target);

    /** One glyph for the shop card. */
    public abstract String icon();

    /** Builds the right subclass for a catalog row. */
    public static PowerUp create(String code, String name, String description, int price) {
        return switch (code) {
            case StreakFreeze.CODE -> new StreakFreeze(name, description, price);
            case StreakRepair.CODE -> new StreakRepair(name, description, price);
            case DoubleCoins.CODE -> new DoubleCoins(name, description, price);
            case RestDay.CODE -> new RestDay(name, description, price);
            default -> throw new IllegalArgumentException("Unknown power-up " + code);
        };
    }

    @Override
    public String toString() { return name; }
}
