package com.habitflow.ui;

import com.habitflow.model.CheckIn;
import com.habitflow.model.Habit;
import com.habitflow.model.HabitSummary;
import com.habitflow.model.HabitType;
import javafx.beans.property.SimpleStringProperty;
import javafx.scene.control.*;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.function.Function;

/** One habit in depth: numbers, year heatmap, history table and editing any past day. */
class HabitDetailPage extends Page {
    private Habit habit;

    HabitDetailPage(AppContext ctx, MainView main, Habit habit) {
        super(ctx, main);
        this.habit = habit;
    }

    @Override String title() { return habit.getName(); }

    @Override
    protected void build(VBox page) {
        HabitSummary s = ctx.habits.summary(habit);
        LocalDate today = LocalDate.now();
        String unit = habit.getSchedule().streakUnit();

        page.getChildren().add(Ui.row(10,
                Ui.button("← Back to habits", () -> main.show(main.page("Habits"))),
                Ui.spacer(),
                Ui.dot(habit.getColor(), 5.5),
                Ui.label(habit.getType() + "  ·  " + habit.getSchedule().describe() + "  ·  since " + habit.getCreatedOn(), "muted", "small"),
                Ui.button("Edit habit", () -> editHabit())));

        page.getChildren().add(Ui.row(14,
                Ui.statCard("Current streak", String.valueOf(s.currentStreak()), unit),
                Ui.statCard("Longest streak", String.valueOf(s.longestStreak()), unit),
                Ui.statCard("Strength", String.valueOf(s.strength()), "out of 100"),
                Ui.statCard("Last 30 days", Ui.pct(ctx.stats.completionRate(habit, today.minusDays(29), today)), "completion"),
                Ui.statCard("All time", Ui.pct(ctx.stats.completionRate(habit)), s.totalDone() + " times done")));

        page.getChildren().add(Ui.card(
                Ui.col(2, Ui.label("Last 12 months", "h3"),
                        Ui.label("Darker squares mean closer to the target. Hover any square for the date.", "muted", "small")),
                new HeatmapCanvas(ctx.stats.heatmap(habit), habit.getColor())));

        // edit any past day (backfill); past edits are written to the activity log
        DatePicker day = Ui.datePicker(today.minusDays(1), habit.getCreatedOn(), today);
        day.setPrefWidth(150);
        boolean isBool = habit.getType() == HabitType.BOOLEAN;
        CheckBox doneCheck = new CheckBox("Completed");
        doneCheck.setSelected(true);
        TextField value = new TextField("");
        value.setPromptText(habit.getType() == HabitType.DURATION ? "Minutes" : "Value");
        value.setPrefWidth(100);
        TextField note = new TextField();
        note.setPromptText("Note (optional)");
        HBox.setHgrow(note, Priority.ALWAYS);

        Runnable syncDay = () -> ctx.checkIns.find(habit, day.getValue()).ifPresentOrElse(c -> {
            if (isBool) doneCheck.setSelected(c.value() >= 1);
            else value.setText(String.valueOf(c.value()));
            note.setText(c.note() == null ? "" : c.note());
        }, () -> {
            if (isBool) doneCheck.setSelected(true);
            else value.clear();
            note.clear();
        });
        day.valueProperty().addListener((o, a, d) -> syncDay.run());
        syncDay.run();

        HBox editRow = Ui.row(10, day, isBool ? doneCheck : value, note,
                Ui.button("Save", () -> {
                    double v;
                    if (isBool) {
                        v = doneCheck.isSelected() ? 1 : 0;
                    } else {
                        try { v = Double.parseDouble(value.getText().trim()); }
                        catch (NumberFormatException e) { throw new IllegalArgumentException("Value must be a number"); }
                    }
                    ctx.checkIns.checkIn(habit, v, day.getValue(), note.getText());
                    Ui.toast("Saved " + day.getValue());
                    refresh();
                }, "primary"),
                Ui.button("Clear day", () -> { ctx.checkIns.undo(habit, day.getValue()); refresh(); }));

        page.getChildren().add(Ui.card(
                Ui.col(2, Ui.label("Edit a day", "h3"),
                        Ui.label("Forgot to check in? Update any past day here. Click a row below to select its date.", "muted", "small")),
                editRow));

        TableView<CheckIn> table = new TableView<>();
        table.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_FLEX_LAST_COLUMN);
        table.getColumns().add(column("Date", c -> c.day().toString(), 120));
        table.getColumns().add(column("Value", c -> c.frozen() ? "Protected" : habit.formatValue(c.value()), 150));
        table.getColumns().add(column("Done", c -> c.frozen() || habit.isCompleted(c.value()) ? "✓" : "", 70));
        table.getColumns().add(column("Coins", c -> c.coinsAwarded() > 0 ? "+" + c.coinsAwarded() : "", 80));
        table.getColumns().add(column("Note", c -> c.note() == null ? "" : c.note(), 300));
        List<CheckIn> history = new ArrayList<>(ctx.checkIns.history(habit));
        Collections.reverse(history);
        table.getItems().setAll(history);
        table.setPrefHeight(300);
        table.setPlaceholder(Ui.label("No check-ins yet", "muted"));
        table.getSelectionModel().selectedItemProperty().addListener((o, a, c) -> { if (c != null) day.setValue(c.day()); });
        page.getChildren().add(Ui.card(Ui.label("History", "h3"), table));
    }

    private void editHabit() {
        new HabitEditorDialog(habit, ctx.habits.categories(), ctx.reminders.timeFor(habit.getId())).ask().ifPresent(r -> {
            ctx.habits.update(r.habit());
            ctx.reminders.save(r.habit(), r.reminder());
            this.habit = r.habit();
            main.show(this);
        });
    }

    private static TableColumn<CheckIn, String> column(String name, Function<CheckIn, String> f, double width) {
        TableColumn<CheckIn, String> c = new TableColumn<>(name);
        c.setCellValueFactory(cell -> new SimpleStringProperty(f.apply(cell.getValue())));
        c.setPrefWidth(width);
        return c;
    }
}
