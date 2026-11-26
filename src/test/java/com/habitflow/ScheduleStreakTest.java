package com.habitflow;

import com.habitflow.controller.logic.StreakCalculator;
import com.habitflow.model.*;
import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class ScheduleStreakTest {
    // 2026-11-02 is a Monday
    private static final LocalDate MON = LocalDate.of(2026, 11, 2);

    private static Set<LocalDate> days(LocalDate... d) { return new HashSet<>(List.of(d)); }

    @Test
    void dailyStreakCountsBackFromYesterdayWhenTodayIsOpen() {
        Schedule s = new DailySchedule();
        Set<LocalDate> done = days(MON, MON.plusDays(1), MON.plusDays(2));
        List<Double> o = s.outcomes(MON, MON.plusDays(3), done);
        assertEquals(3, StreakCalculator.current(o), "today not done yet must not break the streak");
        assertEquals(3, StreakCalculator.longest(o));
    }

    @Test
    void dailyMissBreaksStreak() {
        Schedule s = new DailySchedule();
        Set<LocalDate> done = days(MON, MON.plusDays(1), MON.plusDays(3), MON.plusDays(4));
        List<Double> o = s.outcomes(MON, MON.plusDays(4), done);
        assertEquals(2, StreakCalculator.current(o));
        assertEquals(2, StreakCalculator.longest(o));
        assertEquals(0.8, StreakCalculator.completionRate(o), 1e-9);
    }

    @Test
    void weekdayScheduleSkipsNonDueDays() {
        Schedule s = new WeekdaySchedule(DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY);
        // Mon, Wed, Fri, next Mon done; Tue/Thu/weekend are not due so they must not break it
        Set<LocalDate> done = days(MON, MON.plusDays(2), MON.plusDays(4), MON.plusDays(7));
        assertEquals(4, StreakCalculator.current(s.outcomes(MON, MON.plusDays(8), done)));
        assertFalse(s.isDue(MON.plusDays(1), MON, done));
        assertEquals("Mon, Wed, Fri", s.describe());
    }

    @Test
    void everyNDaysIsAnchoredToStart() {
        Schedule s = new EveryNDaysSchedule(3);
        assertTrue(s.isDue(MON.plusDays(6), MON, Set.of()));
        assertFalse(s.isDue(MON.plusDays(7), MON, Set.of()));
        Set<LocalDate> done = days(MON, MON.plusDays(3), MON.plusDays(6));
        assertEquals(3, StreakCalculator.current(s.outcomes(MON, MON.plusDays(8), done)));
    }

    @Test
    void timesPerWeekCountsWeeks() {
        Schedule s = new TimesPerWeekSchedule(2);
        // week 1: 2 days, week 2: 2 days, week 3 (current): 1 day -> still open
        Set<LocalDate> done = days(MON, MON.plusDays(3), MON.plusDays(8), MON.plusDays(12), MON.plusDays(14));
        List<Double> o = s.outcomes(MON, MON.plusDays(15), done);
        assertEquals(List.of(1.0, 1.0), o);
        assertEquals(2, StreakCalculator.current(o));
        assertEquals("weeks", s.streakUnit());
        // after reaching the target the habit is no longer due that week
        assertFalse(s.isDue(MON.plusDays(5), MON, done));
        assertTrue(s.isDue(MON.plusDays(15), MON, done));
    }

    @Test
    void timesPerWeekPartialWeekIsFraction() {
        Schedule s = new TimesPerWeekSchedule(4);
        List<Double> o = s.outcomes(MON, MON.plusDays(7), days(MON));
        assertEquals(List.of(0.25), o);
        assertEquals(0, StreakCalculator.current(o));
    }

    @Test
    void frozenDayKeepsStreakAlive() {
        // The controller adds frozen days to the "done" set, so a protected miss looks met
        Schedule s = new DailySchedule();
        Set<LocalDate> done = days(MON, MON.plusDays(1), MON.plusDays(2) /* frozen */, MON.plusDays(3));
        assertEquals(4, StreakCalculator.current(s.outcomes(MON, MON.plusDays(3), done)));
    }

    @Test
    void invalidSchedulesAreRejected() {
        assertThrows(IllegalArgumentException.class, () -> new WeekdaySchedule(0));
        assertThrows(IllegalArgumentException.class, () -> new EveryNDaysSchedule(1));
        assertThrows(IllegalArgumentException.class, () -> new TimesPerWeekSchedule(7));
    }

    @Test
    void scheduleRoundTripsThroughFactory() {
        for (Schedule s : List.of(new DailySchedule(), new WeekdaySchedule(0b0010101), new EveryNDaysSchedule(4), new TimesPerWeekSchedule(3))) {
            Schedule copy = Schedule.of(s.type(), s.param());
            assertEquals(s.describe(), copy.describe());
        }
    }
}
