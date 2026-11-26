package com.habitflow.model;

import java.time.LocalDate;

/**
 * A habit the user tracks. Subclasses decide what a check-in value means
 * (done / not done, a count, a number of minutes).
 */
public abstract class Habit {
    private int id;
    private int userId;
    private Integer categoryId;
    private String categoryName;
    private String name = "New habit";
    private double target = 1;
    private String unit = "";
    private Schedule schedule = new DailySchedule();
    private String color = "#3A7D5C";
    private boolean shared;
    private boolean archived;
    private LocalDate createdOn = LocalDate.now();

    public abstract HabitType getType();

    /** True when a check-in with this value counts as completing the habit for that day. */
    public abstract boolean isCompleted(double value);

    /** Human readable value, e.g. "5 / 8 glasses" or "25m / 30m". */
    public abstract String formatValue(double value);

    /** Fraction 0..1 of the target reached. */
    public double progress(double value) {
        return Math.max(0, Math.min(1, value / target));
    }

    /** The value that marks the habit fully done in one click. */
    public double completeValue() {
        return target;
    }

    public int getId() { return id; }
    public void setId(int id) { this.id = id; }
    public int getUserId() { return userId; }
    public void setUserId(int userId) { this.userId = userId; }
    public Integer getCategoryId() { return categoryId; }
    public void setCategoryId(Integer categoryId) { this.categoryId = categoryId; }
    public String getCategoryName() { return categoryName; }
    public void setCategoryName(String categoryName) { this.categoryName = categoryName; }
    public String getName() { return name; }

    public void setName(String name) {
        if (name == null || name.isBlank()) throw new IllegalArgumentException("Habit name is required");
        if (name.trim().length() > 60) throw new IllegalArgumentException("Habit name must be at most 60 characters");
        this.name = name.trim();
    }

    public double getTarget() { return target; }

    public void setTarget(double target) {
        if (target <= 0) throw new IllegalArgumentException("Target must be greater than 0");
        this.target = target;
    }

    public String getUnit() { return unit; }
    public void setUnit(String unit) { this.unit = unit == null ? "" : unit.trim(); }
    public Schedule getSchedule() { return schedule; }

    public void setSchedule(Schedule schedule) {
        if (schedule == null) throw new IllegalArgumentException("Schedule is required");
        this.schedule = schedule;
    }

    public String getColor() { return color; }

    public void setColor(String color) {
        if (color == null || !color.matches("#[0-9A-Fa-f]{6}")) throw new IllegalArgumentException("Color must look like #RRGGBB");
        this.color = color;
    }

    public boolean isShared() { return shared; }
    public void setShared(boolean shared) { this.shared = shared; }
    public boolean isArchived() { return archived; }
    public void setArchived(boolean archived) { this.archived = archived; }
    public LocalDate getCreatedOn() { return createdOn; }
    public void setCreatedOn(LocalDate createdOn) { this.createdOn = createdOn; }

    @Override
    public String toString() { return name; }
}
