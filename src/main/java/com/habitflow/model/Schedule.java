package com.habitflow.model;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

/**
 * When a habit is expected (Strategy pattern). Streaks, strength and completion rate are all
 * computed from {@link #outcomes}, so adding a new schedule never touches those algorithms.
 */
public interface Schedule {
    ScheduleType type();

    /** The single number stored in habits.schedule_param (weekday bit mask, N, or times per week). */
    int param();

    /** Should the habit appear on this day? {@code done} holds every day the habit was satisfied. */
    boolean isDue(LocalDate day, LocalDate start, Set<LocalDate> done);

    /**
     * One value per period (a due day, or a week) from start up to today, oldest first.
     * 1.0 = period fully met, 0.0 = missed, fractions = partly met. The current period is
     * included only once it is met, because the user can still finish it.
     */
    List<Double> outcomes(LocalDate start, LocalDate today, Set<LocalDate> done);

    String describe();

    default String streakUnit() { return "days"; }

    /** "1 day", "5 days", "1 week" ... */
    default String formatStreak(int n) {
        return formatStreak(n, streakUnit());
    }

    static String formatStreak(int n, String unit) {
        return n + " " + (n == 1 && unit.endsWith("s") ? unit.substring(0, unit.length() - 1) : unit);
    }

    /** Factory used by the database tier to rebuild a schedule from its two columns. */
    static Schedule of(ScheduleType type, int param) {
        return switch (type) {
            case DAILY -> new DailySchedule();
            case WEEKDAYS -> new WeekdaySchedule(param);
            case TIMES_PER_WEEK -> new TimesPerWeekSchedule(param);
            case EVERY_N_DAYS -> new EveryNDaysSchedule(param);
        };
    }
}
