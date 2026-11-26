package com.habitflow.model;

import java.time.LocalTime;

/** The time at which to remind the user about one habit. */
public record Reminder(int habitId, String habitName, LocalTime time, boolean enabled) { }
