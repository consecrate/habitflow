package com.habitflow.model;

/** The four kinds of schedule; stored in habits.schedule_type. */
public enum ScheduleType {
    DAILY("Every day"),
    WEEKDAYS("Specific weekdays"),
    TIMES_PER_WEEK("X times per week"),
    EVERY_N_DAYS("Every N days");

    private final String label;

    ScheduleType(String label) { this.label = label; }

    @Override
    public String toString() { return label; }
}
