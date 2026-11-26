package com.habitflow.model;

import java.time.LocalDate;

/** One habit on one day. frozen = protected by a power-up instead of done for real. */
public record CheckIn(int habitId, LocalDate day, double value, String note, boolean frozen, int coinsAwarded) { }
