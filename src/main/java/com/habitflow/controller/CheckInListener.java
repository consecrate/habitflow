package com.habitflow.controller;

import com.habitflow.model.Habit;

import java.time.LocalDate;

/** Observer: told after every check-in change has been saved. */
@FunctionalInterface
public interface CheckInListener {
    void onCheckIn(Habit habit, LocalDate day, boolean completed);
}
