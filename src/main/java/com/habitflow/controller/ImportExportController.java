package com.habitflow.controller;

import com.habitflow.db.AuditDao;
import com.habitflow.db.CheckInDao;
import com.habitflow.db.Database;
import com.habitflow.db.HabitDao;
import com.habitflow.model.CheckIn;
import com.habitflow.model.Habit;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/** CSV backup of check-in history. Import is all-or-nothing. */
public class ImportExportController {
    static final String HEADER = "habit,date,value,note,protected";

    private final HabitDao habits = new HabitDao();
    private final CheckInDao checkIns = new CheckInDao();
    private final AuditDao audit = new AuditDao();

    public int exportCsv(Path file) throws IOException {
        int userId = Session.require().getId();
        var byHabit = checkIns.allForUser(userId);
        List<String> lines = new ArrayList<>();
        lines.add(HEADER);
        for (Habit h : habits.list(userId, true)) {
            for (CheckIn c : byHabit.getOrDefault(h.getId(), List.of())) {
                lines.add(String.join(",", csv(h.getName()), c.day().toString(), String.valueOf(c.value()),
                        csv(c.note() == null ? "" : c.note()), String.valueOf(c.frozen())));
            }
        }
        Files.write(file, lines, StandardCharsets.UTF_8);
        audit.log(userId, "EXPORT", (lines.size() - 1) + " check-ins to " + file.getFileName());
        return lines.size() - 1;
    }

    /** Imports rows into existing habits. Any bad row aborts the whole import with its line number. */
    public int importCsv(Path file) throws IOException {
        int userId = Session.require().getId();
        List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
        if (lines.isEmpty() || !lines.get(0).trim().equalsIgnoreCase(HEADER)) {
            throw new IllegalArgumentException("Line 1: expected header '" + HEADER + "'");
        }
        int count = Database.inTransaction(() -> {
            int n = 0;
            for (int i = 1; i < lines.size(); i++) {
                if (lines.get(i).isBlank()) continue;
                int lineNo = i + 1;
                List<String> f = parse(lines.get(i));
                if (f.size() != 5) throw new IllegalArgumentException("Line " + lineNo + ": expected 5 fields, found " + f.size());
                Habit h = habits.findByName(userId, f.get(0))
                        .orElseThrow(() -> new IllegalArgumentException("Line " + lineNo + ": unknown habit '" + f.get(0) + "'"));
                LocalDate day;
                double value;
                try {
                    day = LocalDate.parse(f.get(1));
                    value = Double.parseDouble(f.get(2));
                } catch (DateTimeParseException | NumberFormatException e) {
                    throw new IllegalArgumentException("Line " + lineNo + ": bad date or value");
                }
                if (value < 0) throw new IllegalArgumentException("Line " + lineNo + ": value cannot be negative");
                if (day.isAfter(LocalDate.now())) throw new IllegalArgumentException("Line " + lineNo + ": date is in the future");
                Optional<CheckIn> prev = checkIns.find(h.getId(), day);
                String note = f.get(3).isBlank() ? null : f.get(3);
                checkIns.upsert(new CheckIn(h.getId(), day, value, note, Boolean.parseBoolean(f.get(4)),
                        prev.map(CheckIn::coinsAwarded).orElse(0))); // imports never create coins
                n++;
            }
            audit.log(userId, "IMPORT", n + " check-ins from " + file.getFileName());
            return n;
        });
        Session.refresh();
        return count;
    }

    static String csv(String s) {
        return s.contains(",") || s.contains("\"") || s.contains("\n") ? "\"" + s.replace("\"", "\"\"") + "\"" : s;
    }

    /** Splits one CSV line, honouring quotes and doubled quotes. */
    static List<String> parse(String line) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (quoted) {
                if (ch == '"' && i + 1 < line.length() && line.charAt(i + 1) == '"') { cur.append('"'); i++; }
                else if (ch == '"') quoted = false;
                else cur.append(ch);
            } else if (ch == '"') quoted = true;
            else if (ch == ',') { out.add(cur.toString()); cur.setLength(0); }
            else cur.append(ch);
        }
        out.add(cur.toString());
        return out;
    }
}
