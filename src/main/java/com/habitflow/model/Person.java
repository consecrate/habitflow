package com.habitflow.model;

/** Common identity of anyone shown in the app: the logged-in user or a friend. */
public abstract class Person {
    private final int id;
    private final String username;
    private String displayName;

    protected Person(int id, String username, String displayName) {
        this.id = id;
        this.username = username;
        setDisplayName(displayName);
    }

    public final int getId() { return id; }
    public final String getUsername() { return username; }
    public String getDisplayName() { return displayName; }

    public void setDisplayName(String displayName) {
        if (displayName == null || displayName.isBlank()) throw new IllegalArgumentException("Display name is required");
        this.displayName = displayName.trim();
    }

    /** Short label for the role this person plays in the UI. */
    public abstract String roleLabel();

    @Override
    public String toString() {
        return displayName + " (@" + username + ")";
    }
}
