package com.habitflow.model;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** Any X days in each Monday-Sunday week. Streaks count whole weeks that met the target. */
public class TimesPerWeekSchedule implements Schedule {
    private final int times;

    public TimesPerWeekSchedule(int times) {
        if (times < 1 || times > 6) throw new IllegalArgumentException("Times per week must be between 1 and 6");
        this.times = times;
    }

    @Override public ScheduleType type() { return ScheduleType.TIMES_PER_WEEK; }
    @Override public int param() { return times; }
    @Override public String describe() { return times + "× per week"; }
    @Override public String streakUnit() { return "weeks"; }

    private static LocalDate weekStart(LocalDate d) { return d.with(DayOfWeek.MONDAY); }

    private static int countInWeek(LocalDate weekStart, LocalDate upToExclusive, Set<LocalDate> done) {
        int n = 0;
        for (LocalDate d = weekStart; d.isBefore(upToExclusive) && d.isBefore(weekStart.plusDays(7)); d = d.plusDays(1)) {
            if (done.contains(d)) n++;
        }
        return n;
    }

    /** Due until this week's target is reached; a day already done stays visible. */
    @Override
    public boolean isDue(LocalDate day, LocalDate start, Set<LocalDate> done) {
        if (day.isBefore(start)) return false;
        return done.contains(day) || countInWeek(weekStart(day), day, done) < times;
    }

    @Override
    public List<Double> outcomes(LocalDate start, LocalDate today, Set<LocalDate> done) {
        List<Double> out = new ArrayList<>();
        LocalDate currentWeek = weekStart(today);
        for (LocalDate w = weekStart(start); !w.isAfter(currentWeek); w = w.plusWeeks(1)) {
            double ratio = Math.min(1.0, countInWeek(w, w.plusDays(7), done) / (double) times);
            if (w.equals(currentWeek) && ratio < 1.0) break; // this week is still open
            out.add(ratio);
        }
        return out;
    }
}
