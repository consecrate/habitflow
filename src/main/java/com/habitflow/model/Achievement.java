package com.habitflow.model;

import java.time.LocalDateTime;

/** A badge from the catalog; earnedAt is null while still locked. */
public record Achievement(String code, String name, String description, int reward, LocalDateTime earnedAt) {
    public boolean isEarned() { return earnedAt != null; }
}
