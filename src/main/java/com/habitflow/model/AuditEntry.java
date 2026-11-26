package com.habitflow.model;

import java.time.LocalDateTime;

/** One line of the activity log. */
public record AuditEntry(LocalDateTime time, String action, String details) { }
