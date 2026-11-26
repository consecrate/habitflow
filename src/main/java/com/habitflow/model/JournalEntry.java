package com.habitflow.model;

import java.time.LocalDate;

/** The mood (1-5) and optional note for one day. */
public record JournalEntry(LocalDate day, int mood, String note) {
    public JournalEntry {
        if (mood < 1 || mood > 5) throw new IllegalArgumentException("Mood must be 1 to 5");
    }
}
