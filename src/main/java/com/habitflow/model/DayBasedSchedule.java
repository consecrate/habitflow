package com.habitflow.model;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** Schedules where each day is simply due or not due. Subclasses only answer that question. */
public abstract class DayBasedSchedule implements Schedule {

    protected abstract boolean isDueDay(LocalDate day, LocalDate start);

    @Override
    public final boolean isDue(LocalDate day, LocalDate start, Set<LocalDate> done) {
        return !day.isBefore(start) && isDueDay(day, start);
    }

    @Override
    public List<Double> outcomes(LocalDate start, LocalDate today, Set<LocalDate> done) {
        List<Double> out = new ArrayList<>();
        for (LocalDate d = start; !d.isAfter(today); d = d.plusDays(1)) {
            if (!isDueDay(d, start)) continue;
            boolean met = done.contains(d);
            if (d.equals(today) && !met) break; // today is still open
            out.add(met ? 1.0 : 0.0);
        }
        return out;
    }
}
