package com.habitflow.model;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Due on chosen weekdays. Stored as a bit mask: bit 0 = Monday ... bit 6 = Sunday. */
public class WeekdaySchedule extends DayBasedSchedule {
    private final int mask;

    public WeekdaySchedule(int mask) {
        if (mask <= 0 || mask > 0b1111111) throw new IllegalArgumentException("Pick at least one weekday");
        this.mask = mask;
    }

    public WeekdaySchedule(DayOfWeek... days) {
        this(toMask(days));
    }

    private static int toMask(DayOfWeek... days) {
        int m = 0;
        for (DayOfWeek d : days) m |= 1 << (d.getValue() - 1);
        return m;
    }

    public boolean includes(DayOfWeek day) { return (mask & (1 << (day.getValue() - 1))) != 0; }

    @Override public ScheduleType type() { return ScheduleType.WEEKDAYS; }
    @Override public int param() { return mask; }
    @Override protected boolean isDueDay(LocalDate day, LocalDate start) { return includes(day.getDayOfWeek()); }

    @Override
    public String describe() {
        List<String> names = new ArrayList<>();
        for (DayOfWeek d : DayOfWeek.values()) if (includes(d)) names.add(d.getDisplayName(TextStyle.SHORT, Locale.ENGLISH));
        return String.join(", ", names);
    }
}
