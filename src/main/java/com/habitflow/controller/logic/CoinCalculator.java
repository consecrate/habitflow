package com.habitflow.controller.logic;

/** Coins for completing a habit today: 10 base, growing to 20 at a 30-period streak, doubled by Double Coins. */
public final class CoinCalculator {
    public static final int BASE = 10;
    public static final int MAX_STREAK_BONUS_AT = 30;

    private CoinCalculator() { }

    public static int reward(int streakAfterCheckIn, boolean doubleCoins) {
        double multiplier = 1 + Math.min(Math.max(streakAfterCheckIn, 0), MAX_STREAK_BONUS_AT) / (double) MAX_STREAK_BONUS_AT;
        int coins = (int) Math.round(BASE * multiplier);
        return doubleCoins ? coins * 2 : coins;
    }
}
