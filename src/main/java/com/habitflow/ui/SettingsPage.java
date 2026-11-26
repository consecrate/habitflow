package com.habitflow.ui;

import com.habitflow.controller.Session;
import com.habitflow.model.AuditEntry;
import com.habitflow.model.Reminder;
import javafx.scene.control.CheckBox;
import javafx.scene.control.Label;
import javafx.scene.control.PasswordField;
import javafx.scene.control.TextField;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;
import javafx.stage.FileChooser;

import java.io.File;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

/** Profile, password, reminders, CSV backup and the activity log. */
class SettingsPage extends Page {
    SettingsPage(AppContext ctx, MainView main) { super(ctx, main); }

    @Override String title() { return "Settings"; }

    @Override
    protected void build(VBox page) {
        TextField display = new TextField(Session.require().getDisplayName());
        display.setPrefWidth(260);
        page.getChildren().add(Ui.card(
                Ui.row(10, Ui.avatar(Session.require().getDisplayName()),
                        Ui.col(1, Ui.label("Profile", "h3"), Ui.label("@" + Session.require().getUsername(), "muted", "small"))),
                Ui.col(5, Ui.label("Display name", "field-label"),
                        Ui.row(8, display, Ui.button("Save name", () -> {
                            ctx.auth.changeDisplayName(display.getText());
                            Ui.toast("Name saved");
                            refresh();
                        }, "primary")))));

        PasswordField old = new PasswordField(), pw = new PasswordField(), confirm = new PasswordField();
        old.setPromptText("Current password");
        pw.setPromptText("New password");
        confirm.setPromptText("Repeat new password");
        HBox.setHgrow(old, Priority.ALWAYS);
        HBox.setHgrow(pw, Priority.ALWAYS);
        HBox.setHgrow(confirm, Priority.ALWAYS);
        page.getChildren().add(Ui.card(
                Ui.label("Password", "h3"),
                Ui.row(10,
                        Ui.col(5, Ui.label("Current password", "field-label"), old),
                        Ui.col(5, Ui.label("New password", "field-label"), pw),
                        Ui.col(5, Ui.label("Confirm password", "field-label"), confirm)),
                Ui.row(8, Ui.button("Change password", () -> {
                    ctx.auth.changePassword(old.getText(), pw.getText(), confirm.getText());
                    old.clear(); pw.clear(); confirm.clear();
                    Ui.toast("Password changed");
                }, "primary"))));

        VBox reminders = Ui.card(Ui.col(2, Ui.label("Reminders", "h3"),
                Ui.label("Shown while HabitFlow is open if the habit is due and not done yet. Set times in the habit editor.", "muted", "small")));
        List<Reminder> list = ctx.reminders.list();
        if (list.isEmpty()) reminders.getChildren().add(Ui.label("No reminders yet.", "muted", "small"));
        for (int i = 0; i < list.size(); i++) {
            Reminder r = list.get(i);
            if (i > 0) reminders.getChildren().add(Ui.divider());
            CheckBox on = new CheckBox("Enabled");
            on.setSelected(r.enabled());
            on.setOnAction(e -> Ui.attempt(() -> ctx.reminders.setEnabled(r, on.isSelected())));
            Label time = Ui.pill(r.time().toString(), "pill-good");
            reminders.getChildren().add(Ui.row(12, time, Ui.label(r.habitName(), "field-label"), Ui.spacer(), on,
                    Ui.button("Remove", () -> { ctx.reminders.remove(r.habitId()); refresh(); }, "danger", "compact")));
        }
        page.getChildren().add(reminders);

        page.getChildren().add(Ui.card(
                Ui.col(2, Ui.label("Backup", "h3"),
                        Ui.label("Export all check-ins to CSV, or import a CSV into habits with the same names. A bad row cancels the whole import.", "muted", "small")),
                Ui.row(8, Ui.button("Export CSV…", this::export), Ui.button("Import CSV…", this::importCsv))));

        DateTimeFormatter f = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm", Locale.ENGLISH);
        VBox log = Ui.card(Ui.label("Activity log", "h3"));
        List<AuditEntry> entries = ctx.habits.activityLog(25);
        for (int i = 0; i < entries.size(); i++) {
            AuditEntry a = entries.get(i);
            if (i > 0) log.getChildren().add(Ui.divider());
            Label time = Ui.label(a.time().format(f), "muted", "small");
            time.setMinWidth(135);
            log.getChildren().add(Ui.row(10, time, Ui.pill(formatAction(a.action()), "pill-muted"), Ui.label(a.details())));
        }
        page.getChildren().add(log);
    }

    private static String formatAction(String raw) {
        if (raw == null || raw.isBlank()) return "";
        String lower = raw.replace('_', ' ').toLowerCase(Locale.ENGLISH);
        return Character.toUpperCase(lower.charAt(0)) + lower.substring(1);
    }

    private void export() {
        FileChooser fc = new FileChooser();
        fc.setInitialFileName("habitflow-backup.csv");
        File file = fc.showSaveDialog(view().getScene().getWindow());
        if (file == null) return;
        try {
            Ui.toast("Exported " + ctx.io.exportCsv(file.toPath()) + " check-ins");
        } catch (IOException e) {
            throw new UncheckedIOException("Could not write the file: " + e.getMessage(), e);
        }
        refresh();
    }

    private void importCsv() {
        FileChooser fc = new FileChooser();
        fc.getExtensionFilters().add(new FileChooser.ExtensionFilter("CSV", "*.csv"));
        File file = fc.showOpenDialog(view().getScene().getWindow());
        if (file == null) return;
        try {
            Ui.toast("Imported " + ctx.io.importCsv(file.toPath()) + " check-ins");
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read the file: " + e.getMessage(), e);
        }
        refresh();
    }
}
