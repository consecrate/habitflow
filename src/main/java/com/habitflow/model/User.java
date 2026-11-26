package com.habitflow.model;

/** The account that is logged in. Holds the coin balance used by the shop. */
public class User extends Person {
    private int coins;

    public User(int id, String username, String displayName, int coins) {
        super(id, username, displayName);
        setCoins(coins);
    }

    public int getCoins() { return coins; }

    public void setCoins(int coins) {
        if (coins < 0) throw new IllegalArgumentException("Coins cannot be negative");
        this.coins = coins;
    }

    @Override
    public String roleLabel() { return "Member"; }
}
