package com.habitflow.model;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;

/** What a power-up is allowed to do to the user's data. Implemented by the controller tier. */
public interface PowerUpContext {
    LocalDate today();

    /** Due days of this habit in the last {@code daysBack} days (not today) that were not met. */
    List<LocalDate> missedDueDays(Habit habit, int daysBack);

    boolean isDoneOn(Habit habit, LocalDate day);

    /** Marks the days as protected so streaks treat them as met. */
    void protectDays(Habit habit, List<LocalDate> days);

    boolean isEffectActive(String code);

    void activateEffect(String code, Duration length);
}
