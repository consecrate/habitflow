package com.habitflow.model;

import java.time.LocalDate;

/** Due every day. */
public class DailySchedule extends DayBasedSchedule {
    @Override public ScheduleType type() { return ScheduleType.DAILY; }
    @Override public int param() { return 0; }
    @Override protected boolean isDueDay(LocalDate day, LocalDate start) { return true; }
    @Override public String describe() { return "Every day"; }
}
