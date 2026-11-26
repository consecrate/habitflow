package com.habitflow.ui;

import com.habitflow.model.*;
import javafx.event.ActionEvent;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.ColumnConstraints;
import javafx.scene.layout.GridPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.paint.Color;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.time.format.TextStyle;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/** Create or edit a habit, including its schedule and reminder. */
class HabitEditorDialog extends Dialog<ButtonType> {
    /** What the user entered: the habit plus the reminder time (null = no reminder). */
    record Result(Habit habit, LocalTime reminder) { }

    private final TextField name = new TextField();
    private final ComboBox<HabitType> type = new ComboBox<>();
    private final TextField target = new TextField();
    private final TextField unit = new TextField();
    private final ComboBox<ScheduleType> schedule = new ComboBox<>();
    private final CheckBox[] weekdays = new CheckBox[7];
    private final Spinner<Integer> param = new Spinner<>(1, 30, 3);
    private final ComboBox<Category> category = new ComboBox<>();
    private final ColorPicker color = new ColorPicker();
    private final CheckBox shared = new CheckBox("Show to my accountability partners");
    private final CheckBox remind = new CheckBox("Remind me at");
    private final TextField remindAt = new TextField("09:00");
    private final Label paramLabel = Ui.label("", "field-label");
    private final HBox weekdayBox = new HBox(8);
    private final HBox paramRow = Ui.row(8, param, weekdayBox);
    private Result result;

    HabitEditorDialog(Habit existing, List<Category> categories, LocalTime existingReminder) {
        setTitle(existing == null ? "New habit" : "Edit habit");
        setHeaderText(existing == null ? "Create a new habit" : "Edit " + existing.getName());
        ButtonType saveBtn = new ButtonType(existing == null ? "Create habit" : "Save changes", ButtonBar.ButtonData.OK_DONE);
        getDialogPane().getButtonTypes().addAll(ButtonType.CANCEL, saveBtn);
        Ui.styleDialog(getDialogPane(), saveBtn);
        getDialogPane().setMinWidth(480);

        type.getItems().setAll(HabitType.values());
        type.setMaxWidth(Double.MAX_VALUE);
        schedule.getItems().setAll(ScheduleType.values());
        schedule.setMaxWidth(Double.MAX_VALUE);
        category.getItems().add(null);
        category.getItems().addAll(categories);
        category.setMaxWidth(Double.MAX_VALUE);
        Ui.nullableCombo(category, "No category");
        for (DayOfWeek d : DayOfWeek.values()) {
            weekdays[d.getValue() - 1] = new CheckBox(d.getDisplayName(TextStyle.SHORT, Locale.ENGLISH));
            weekdayBox.getChildren().add(weekdays[d.getValue() - 1]);
        }
        param.setEditable(true);
        param.setPrefWidth(100);
        name.setPromptText("e.g. Drink water");
        unit.setPromptText("e.g. glasses");
        color.setPrefWidth(150);
        remindAt.setPrefWidth(95);

        Habit h = existing != null ? existing : HabitType.BOOLEAN.newHabit();
        name.setText(existing == null ? "" : h.getName());
        type.setValue(h.getType());
        target.setText(trim(h.getTarget()));
        unit.setText(h.getType() == HabitType.COUNT ? h.getUnit() : "");
        schedule.setValue(h.getSchedule().type());
        if (h.getSchedule() instanceof WeekdaySchedule w) {
            for (DayOfWeek d : DayOfWeek.values()) weekdays[d.getValue() - 1].setSelected(w.includes(d));
        } else {
            for (int i = 0; i < 5; i++) weekdays[i].setSelected(true);
        }
        if (h.getSchedule().type() == ScheduleType.TIMES_PER_WEEK || h.getSchedule().type() == ScheduleType.EVERY_N_DAYS) {
            param.getValueFactory().setValue(h.getSchedule().param());
        }
        category.setValue(categories.stream().filter(c -> h.getCategoryId() != null && c.id() == h.getCategoryId()).findFirst().orElse(null));
        color.setValue(Color.web(h.getColor()));
        shared.setSelected(h.isShared());
        remind.setSelected(existingReminder != null);
        if (existingReminder != null) remindAt.setText(existingReminder.toString());

        GridPane g = new GridPane();
        g.setHgap(16);
        g.setVgap(12);
        ColumnConstraints labelCol = new ColumnConstraints(104);
        ColumnConstraints inputCol = new ColumnConstraints();
        inputCol.setHgrow(Priority.ALWAYS);
        g.getColumnConstraints().addAll(labelCol, inputCol);

        HBox targetRow = Ui.row(8, target, unit);
        HBox.setHgrow(target, Priority.ALWAYS);
        HBox.setHgrow(unit, Priority.ALWAYS);

        HBox reminderRow = Ui.row(10, remind, remindAt);
        reminderRow.setAlignment(Pos.CENTER_LEFT);

        int r = 0;
        g.addRow(r++, Ui.label("Name", "field-label"), name);
        g.addRow(r++, Ui.label("Measured as", "field-label"), type);
        g.addRow(r++, Ui.label("Daily target", "field-label"), targetRow);
        g.addRow(r++, Ui.label("Schedule", "field-label"), schedule);
        g.addRow(r++, paramLabel, paramRow);
        g.addRow(r++, Ui.label("Category", "field-label"), category);
        g.addRow(r++, Ui.label("Color", "field-label"), color);
        g.addRow(r++, Ui.label("Sharing", "field-label"), shared);
        g.addRow(r, Ui.label("Reminder", "field-label"), reminderRow);
        getDialogPane().setContent(g);

        type.valueProperty().addListener((o, a, b) -> syncFields());
        schedule.valueProperty().addListener((o, a, b) -> syncFields());
        remind.selectedProperty().addListener((o, a, b) -> syncFields());
        syncFields();

        // keep the dialog open while the input is invalid
        Button ok = (Button) getDialogPane().lookupButton(saveBtn);
        ok.addEventFilter(ActionEvent.ACTION, e -> {
            if (!Ui.attempt(() -> result = new Result(read(existing), readReminder()))) e.consume();
        });
    }

    private void syncFields() {
        HabitType t = type.getValue();
        target.setDisable(t == HabitType.BOOLEAN);
        unit.setDisable(t != HabitType.COUNT);
        if (t == HabitType.BOOLEAN) target.setText("1");
        target.setPromptText(t == HabitType.DURATION ? "minutes" : "amount");
        ScheduleType s = schedule.getValue();
        weekdayBox.setVisible(s == ScheduleType.WEEKDAYS);
        weekdayBox.setManaged(s == ScheduleType.WEEKDAYS);
        boolean needsParam = s == ScheduleType.TIMES_PER_WEEK || s == ScheduleType.EVERY_N_DAYS;
        param.setVisible(needsParam);
        param.setManaged(needsParam);
        paramLabel.setVisible(s != ScheduleType.DAILY);
        paramLabel.setManaged(s != ScheduleType.DAILY);
        paramRow.setVisible(s != ScheduleType.DAILY);
        paramRow.setManaged(s != ScheduleType.DAILY);
        paramLabel.setText(switch (s) {
            case WEEKDAYS -> "On";
            case TIMES_PER_WEEK -> "Times / week";
            case EVERY_N_DAYS -> "Every N days";
            case DAILY -> "";
        });
        remindAt.setDisable(!remind.isSelected());
    }

    private Habit read(Habit existing) {
        Habit h = type.getValue().newHabit();
        if (existing != null) {
            h.setId(existing.getId());
            h.setUserId(existing.getUserId());
            h.setCreatedOn(existing.getCreatedOn());
            h.setArchived(existing.isArchived());
        }
        h.setName(name.getText());
        try {
            h.setTarget(Double.parseDouble(target.getText().trim()));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Target must be a number");
        }
        h.setUnit(unit.getText());
        h.setSchedule(switch (schedule.getValue()) {
            case DAILY -> new DailySchedule();
            case WEEKDAYS -> {
                int mask = 0;
                for (int i = 0; i < 7; i++) if (weekdays[i].isSelected()) mask |= 1 << i;
                yield new WeekdaySchedule(mask);
            }
            case TIMES_PER_WEEK -> new TimesPerWeekSchedule(param.getValue());
            case EVERY_N_DAYS -> new EveryNDaysSchedule(param.getValue());
        });
        h.setCategoryId(category.getValue() == null ? null : category.getValue().id());
        h.setColor(Ui.toHex(color.getValue()));
        h.setShared(shared.isSelected());
        return h;
    }

    private LocalTime readReminder() {
        if (!remind.isSelected()) return null;
        try {
            return LocalTime.parse(remindAt.getText().trim());
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("Reminder time must look like 09:30");
        }
    }

    Optional<Result> ask() {
        return showAndWait().filter(b -> b.getButtonData() == ButtonBar.ButtonData.OK_DONE).map(b -> result);
    }

    private static String trim(double v) {
        return v == Math.rint(v) ? String.valueOf((long) v) : String.valueOf(v);
    }
}
