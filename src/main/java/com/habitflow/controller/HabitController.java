package com.habitflow.controller;

import com.habitflow.db.*;
import com.habitflow.model.*;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/** Creating, editing, archiving and searching habits and categories. */
public class HabitController {
    public enum SortOrder {
        NAME("Name"), STREAK("Current streak"), STRENGTH("Strength"), NEWEST("Newest");
        private final String label;
        SortOrder(String label) { this.label = label; }
        @Override public String toString() { return label; }
    }

    private final HabitDao habits = new HabitDao();
    private final CheckInDao checkIns = new CheckInDao();
    private final CategoryDao categories = new CategoryDao();
    private final AuditDao audit = new AuditDao();
    private final AchievementController achievements;

    public HabitController(AchievementController achievements) {
        this.achievements = achievements;
    }

    public List<Habit> list() {
        return habits.list(Session.require().getId(), false);
    }

    /** Search by name, filter by category and type, sort; all optional (null = any). */
    public List<HabitSummary> search(String query, Category category, HabitType type, SortOrder sort, boolean includeArchived) {
        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        Comparator<HabitSummary> order = switch (sort == null ? SortOrder.NAME : sort) {
            case NAME -> Comparator.comparing(s -> s.habit().getName().toLowerCase(Locale.ROOT));
            case STREAK -> Comparator.comparingInt(HabitSummary::currentStreak).reversed();
            case STRENGTH -> Comparator.comparingInt(HabitSummary::strength).reversed();
            case NEWEST -> Comparator.comparing((HabitSummary s) -> s.habit().getCreatedOn()).reversed();
        };
        return HabitStats.summarizeAll(Session.require().getId(), includeArchived, habits, checkIns).stream()
                .filter(s -> q.isEmpty() || s.habit().getName().toLowerCase(Locale.ROOT).contains(q))
                .filter(s -> category == null || Integer.valueOf(category.id()).equals(s.habit().getCategoryId()))
                .filter(s -> type == null || s.habit().getType() == type)
                .sorted(order)
                .toList();
    }

    public HabitSummary summary(Habit h) {
        return HabitStats.summarize(h, checkIns.forHabit(h.getId()), LocalDate.now());
    }

    public Habit create(Habit h) {
        User u = Session.require();
        h.setUserId(u.getId());
        h.setCreatedOn(LocalDate.now());
        if (habits.findByName(u.getId(), h.getName()).isPresent()) throw new IllegalArgumentException("You already have a habit called '" + h.getName() + "'");
        habits.insert(h);
        audit.log(u.getId(), "HABIT_CREATE", h.getName() + " (" + h.getType() + ", " + h.getSchedule().describe() + ")");
        achievements.evaluate();
        return h;
    }

    public void update(Habit h) {
        User u = Session.require();
        if (h.getUserId() != u.getId()) throw new IllegalArgumentException("Not your habit");
        habits.findByName(u.getId(), h.getName()).filter(o -> o.getId() != h.getId())
                .ifPresent(o -> { throw new IllegalArgumentException("You already have a habit called '" + h.getName() + "'"); });
        habits.update(h);
        audit.log(u.getId(), "HABIT_EDIT", h.getName());
    }

    public void setArchived(Habit h, boolean archived) {
        h.setArchived(archived);
        update(h);
        audit.log(h.getUserId(), archived ? "HABIT_ARCHIVE" : "HABIT_RESTORE", h.getName());
    }

    public void delete(Habit h) {
        User u = Session.require();
        habits.delete(u.getId(), h.getId());
        audit.log(u.getId(), "HABIT_DELETE", h.getName() + " and all its history");
    }

    public List<Category> categories() {
        return categories.list(Session.require().getId());
    }

    public Category addCategory(String name, String color) {
        if (name == null || name.isBlank() || name.trim().length() > 30) throw new IllegalArgumentException("Category name: 1-30 characters");
        int userId = Session.require().getId();
        if (categories.list(userId).stream().anyMatch(c -> c.name().equalsIgnoreCase(name.trim()))) {
            throw new IllegalArgumentException("Category '" + name.trim() + "' already exists");
        }
        return categories.create(userId, name.trim(), color);
    }

    public void deleteCategory(Category c) {
        categories.delete(Session.require().getId(), c.id());
    }

    public List<AuditEntry> activityLog(int limit) {
        return audit.recent(Session.require().getId(), limit);
    }
}
