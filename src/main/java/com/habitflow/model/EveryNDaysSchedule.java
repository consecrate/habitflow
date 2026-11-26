package com.habitflow.model;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/** Due on the start day and every N days after it. */
public class EveryNDaysSchedule extends DayBasedSchedule {
    private final int n;

    public EveryNDaysSchedule(int n) {
        if (n < 2 || n > 30) throw new IllegalArgumentException("N must be between 2 and 30");
        this.n = n;
    }

    @Override public ScheduleType type() { return ScheduleType.EVERY_N_DAYS; }
    @Override public int param() { return n; }

    @Override
    protected boolean isDueDay(LocalDate day, LocalDate start) {
        return ChronoUnit.DAYS.between(start, day) % n == 0;
    }

    @Override public String describe() { return "Every " + n + " days"; }
}
