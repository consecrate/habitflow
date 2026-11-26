package com.habitflow.ui;

import com.habitflow.controller.CheckInController;
import com.habitflow.controller.Session;
import com.habitflow.controller.StatsController;
import com.habitflow.model.*;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

/** What is due today, with one-click check-ins and a quick mood entry. */
class TodayPage extends Page {
    TodayPage(AppContext ctx, MainView main) { super(ctx, main); }

    @Override String title() { return "Today"; }

    @Override
    protected void build(VBox page) {
        List<HabitSummary> all = ctx.stats.summaries();
        StatsController.Overview o = ctx.stats.overview(all);
        int hour = LocalTime.now().getHour();
        String greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

        VBox heading = Ui.col(2,
                Ui.label(greeting + ", " + Session.require().getDisplayName(), "h1"),
                Ui.label(LocalDate.now().format(DateTimeFormatter.ofPattern("EEEE, d MMMM yyyy", Locale.ENGLISH)), "muted"));
        page.getChildren().add(Ui.row(12, heading, Ui.spacer(), Ui.button("+ New habit", main::createHabit, "primary")));

        double pctDone = o.dueToday() == 0 ? 1 : o.doneToday() / (double) o.dueToday();
        ProgressBar dayBar = new ProgressBar(pctDone);
        dayBar.setMaxWidth(Double.MAX_VALUE);
        VBox doneCard = Ui.statCard("Done today", o.doneToday() + " / " + o.dueToday(),
                o.dueToday() == 0 ? "Nothing due today" : Ui.pct(pctDone) + " complete");
        doneCard.getChildren().add(dayBar);

        HBox stats = Ui.row(14,
                doneCard,
                Ui.statCard("Best current streak", String.valueOf(o.bestCurrentStreak()), "periods in a row"),
                Ui.statCard("Average strength", String.valueOf(o.averageStrength()), "out of 100"),
                Ui.statCard("Total check-ins", String.format("%,d", o.totalCheckIns()), "completed all time"));
        page.getChildren().add(stats);

        List<HabitSummary> due = all.stream().filter(HabitSummary::dueToday).toList();
        List<HabitSummary> notDue = all.stream().filter(s -> !s.dueToday()).toList();
        long remaining = due.stream().filter(s -> !s.doneToday()).count();
        String statusText = due.isEmpty() ? "0 due" : remaining == 0 ? "All done!" : remaining + " remaining";
        page.getChildren().add(Ui.row(10,
                Ui.label("Due today", "h2"),
                Ui.pill(statusText, remaining == 0 && !due.isEmpty() ? "pill-good" : "pill-muted"),
                Ui.spacer(),
                Ui.label("Click a habit to view history", "muted", "small")));

        if (due.isEmpty()) {
            page.getChildren().add(Ui.card(Ui.label("Nothing due today. Click + New habit to get started.", "muted")));
        } else {
            VBox list = new VBox(8);
            due.stream().sorted((a, b) -> Boolean.compare(a.doneToday(), b.doneToday()))
                    .forEach(s -> list.getChildren().add(habitRow(s)));
            page.getChildren().add(list);
        }

        if (!notDue.isEmpty()) {
            VBox rest = new VBox(8);
            notDue.forEach(s -> rest.getChildren().add(habitRow(s)));
            TitledPane tp = new TitledPane("Not due today (" + notDue.size() + ")", rest);
            tp.setExpanded(false);
            page.getChildren().add(tp);
        }
        page.getChildren().add(moodCard());
    }

    private Node habitRow(HabitSummary s) {
        Habit h = s.habit();
        String sub = h.getSchedule().describe() + (h.getCategoryName() == null ? "" : "  ·  " + h.getCategoryName());
        VBox text = Ui.col(2, Ui.label(h.getName(), "h3"), Ui.label(sub, "muted", "small"));
        HBox info = Ui.row(12, Ui.dot(h.getColor(), 6), text);
        info.getStyleClass().add("clickable");
        HBox.setHgrow(info, Priority.ALWAYS);
        info.setOnMouseClicked(e -> main.show(new HabitDetailPage(ctx, main, h)));

        VBox streakBox = Ui.col(1,
                Ui.label(h.getSchedule().formatStreak(s.currentStreak()), "h3"),
                Ui.label("streak", "muted", "small"));
        streakBox.setMinWidth(78);
        streakBox.setPrefWidth(78);

        ProgressBar bar = new ProgressBar(h.progress(s.todayValue()));
        bar.setPrefWidth(136);
        VBox progress = Ui.col(4, bar, Ui.label(h.formatValue(s.todayValue()), "muted", "small"));
        progress.setMinWidth(144);
        progress.setPrefWidth(144);

        HBox actionSlot = Ui.row(6, controls(s));
        actionSlot.setAlignment(Pos.CENTER_RIGHT);
        actionSlot.setMinWidth(184);
        actionSlot.setPrefWidth(184);

        HBox row = Ui.row(14, info, streakBox, progress, actionSlot);
        row.getStyleClass().addAll("card", "habit-row");
        if (s.doneToday()) row.getStyleClass().add("done");
        return row;
    }

    private Node controls(HabitSummary s) {
        Habit h = s.habit();
        double v = s.todayValue();
        return switch (h.getType()) {
            case BOOLEAN -> s.doneToday()
                    ? Ui.button("Done ✓", () -> act(ctx.checkIns.undo(h, LocalDate.now())), "done-button")
                    : Ui.button("Mark done", () -> act(ctx.checkIns.checkIn(h)), "primary");
            case COUNT -> Ui.row(6,
                    Ui.button("−", () -> act(ctx.checkIns.checkIn(h, Math.max(0, v - 1))), "compact"),
                    Ui.button("+1", () -> act(ctx.checkIns.checkIn(h, v + 1)), "primary", "compact"));
            case DURATION -> Ui.row(6,
                    Ui.button("+5m", () -> act(ctx.checkIns.checkIn(h, v + 5)), "compact"),
                    Ui.button("+15m", () -> act(ctx.checkIns.checkIn(h, v + 15)), "compact"),
                    s.doneToday() ? Ui.button("Reset", () -> act(ctx.checkIns.undo(h, LocalDate.now())), "compact")
                            : Ui.button("Done", () -> act(ctx.checkIns.checkIn(h)), "primary", "compact"));
        };
    }

    private void act(CheckInController.Result r) {
        if (r.coinsDelta() > 0) Ui.toast("+" + r.coinsDelta() + " coins");
        else if (r.coinsDelta() < 0) Ui.toast(r.coinsDelta() + " coins (undone)");
        refresh();
    }

    private Node moodCard() {
        int current = ctx.checkIns.journalFor(LocalDate.now()).map(JournalEntry::mood).orElse(0);
        ToggleGroup group = new ToggleGroup();
        HBox buttons = Ui.moodButtons(group, current, mood -> {
            String note = ctx.checkIns.journalFor(LocalDate.now()).map(JournalEntry::note).orElse(null);
            ctx.checkIns.saveJournal(LocalDate.now(), mood, note);
            Ui.toast("Mood saved: " + Ui.MOODS[mood - 1]);
            refresh();
        });
        return Ui.card(
                Ui.col(2, Ui.label("How is your day going?", "h3"),
                        Ui.label("Your mood is matched against your habits on the Statistics page.", "muted", "small")),
                buttons);
    }
}
