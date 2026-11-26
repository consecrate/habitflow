package com.habitflow.ui;

import com.habitflow.model.JournalEntry;
import javafx.scene.control.*;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

/** Daily mood (1-5) and a short note; feeds the mood insights. */
class JournalPage extends Page {
    JournalPage(AppContext ctx, MainView main) { super(ctx, main); }

    @Override String title() { return "Journal"; }

    @Override
    protected void build(VBox page) {
        DatePicker day = Ui.datePicker(LocalDate.now(), null, LocalDate.now());
        day.setPrefWidth(150);
        ToggleGroup moods = new ToggleGroup();
        HBox moodRow = Ui.moodButtons(moods, 0, null);

        TextArea note = new TextArea();
        note.setPromptText("What happened today? (optional, up to 500 characters)");
        note.setPrefRowCount(3);
        note.setWrapText(true);

        Runnable load = () -> {
            var e = ctx.checkIns.journalFor(day.getValue());
            moods.selectToggle(e.map(x -> moods.getToggles().get(x.mood() - 1)).orElse(null));
            note.setText(e.map(JournalEntry::note).orElse(""));
        };
        day.valueProperty().addListener((o, a, b) -> load.run());
        load.run();

        HBox editorHeader = Ui.row(10,
                Ui.col(2, Ui.label("Write an entry", "h3"), Ui.label("Pick a day and mood, then add an optional note.", "muted", "small")),
                Ui.spacer(),
                Ui.label("Date", "field-label"), day);
        page.getChildren().add(Ui.card(editorHeader, moodRow, note,
                Ui.row(8, Ui.button("Save entry", () -> {
                    if (moods.getSelectedToggle() == null) throw new IllegalArgumentException("Pick a mood first");
                    ctx.checkIns.saveJournal(day.getValue(), (int) moods.getSelectedToggle().getUserData(), note.getText());
                    Ui.toast("Journal saved");
                    refresh();
                }, "primary"))));

        List<JournalEntry> entries = ctx.checkIns.journal();
        double avg = entries.stream().limit(30).mapToInt(JournalEntry::mood).average().orElse(0);
        page.getChildren().add(Ui.row(10,
                Ui.label("Past entries", "h2"),
                Ui.pill(entries.size() + " total", "pill-muted"),
                Ui.pill(String.format("30-day avg %.1f / 5", avg), "pill-good"),
                Ui.spacer(),
                Ui.label("Click an entry to edit it", "muted", "small")));

        DateTimeFormatter f = DateTimeFormatter.ofPattern("EEE, d MMM yyyy", Locale.ENGLISH);
        VBox list = new VBox(8);
        for (JournalEntry e : entries.subList(0, Math.min(40, entries.size()))) {
            boolean hasNote = e.note() != null && !e.note().isBlank();
            HBox top = Ui.row(10,
                    Ui.dot(Ui.MOOD_COLORS[e.mood() - 1], 5.5),
                    Ui.label(e.day().format(f), "h3"),
                    Ui.pill(Ui.MOODS[e.mood() - 1], e.mood() >= 4 ? "pill-good" : "pill-muted"),
                    Ui.spacer());
            VBox card = hasNote ? Ui.card(top, Ui.label(e.note())) : Ui.card(top);
            card.setSpacing(6);
            card.getStyleClass().addAll("habit-row", "clickable");
            card.setOnMouseClicked(ev -> { day.setValue(e.day()); note.requestFocus(); });
            list.getChildren().add(card);
        }
        page.getChildren().add(list);
    }
}
