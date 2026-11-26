package com.habitflow.ui;

import com.habitflow.controller.StatsController;
import com.habitflow.model.HabitSummary;
import javafx.scene.Node;
import javafx.scene.chart.*;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressBar;
import javafx.scene.control.ToggleButton;
import javafx.scene.control.ToggleGroup;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.TextStyle;
import java.util.*;

/** Charts from SQL aggregates, the all-habits heatmap and mood insights. */
class StatsPage extends Page {
    private int trendDays = 30;

    StatsPage(AppContext ctx, MainView main) { super(ctx, main); }

    @Override String title() { return "Statistics"; }

    @Override
    protected void build(VBox page) {
        List<HabitSummary> all = ctx.stats.summaries();
        StatsController.Overview o = ctx.stats.overview(all);
        EnumMap<DayOfWeek, Integer> weekday = ctx.stats.byWeekday(90);
        DayOfWeek best = weekday.entrySet().stream().max(Map.Entry.comparingByValue()).map(Map.Entry::getKey).orElse(DayOfWeek.MONDAY);
        HabitSummary strongest = all.stream().max(Comparator.comparingInt(HabitSummary::strength)).orElse(null);
        page.getChildren().add(Ui.row(14,
                Ui.statCard("Active habits", String.valueOf(o.activeHabits()), String.format("%,d check-ins total", o.totalCheckIns())),
                Ui.statCard("Average strength", String.valueOf(o.averageStrength()), "out of 100"),
                Ui.statCard("Best weekday", best.getDisplayName(TextStyle.FULL, Locale.ENGLISH), "last 90 days"),
                Ui.statCard("Strongest habit", strongest == null ? "-" : strongest.habit().getName(), strongest == null ? "" : strongest.strength() + " strength")));

        page.getChildren().add(trendCard());
        HBox charts = Ui.row(14, weekdayChart(weekday), categoryChart());
        charts.getChildren().forEach(n -> HBox.setHgrow(n, Priority.ALWAYS));
        page.getChildren().add(charts);
        page.getChildren().add(Ui.card(
                Ui.col(2, Ui.label("All habits, last 12 months", "h3"),
                        Ui.label("Share of your active habits completed each day. Hover any square for details.", "muted", "small")),
                new HeatmapCanvas(ctx.stats.heatmap(null), "#1F7A54")));
        page.getChildren().add(moodCard());
        page.getChildren().add(rankingCard(all));
    }

    private Node trendCard() {
        Map<LocalDate, Integer> data = ctx.stats.trend(trendDays);
        int maxVal = data.values().stream().mapToInt(Integer::intValue).max().orElse(4);
        int tick = Math.max(1, (int) Math.ceil(maxVal / 4.0));
        int upper = tick * (int) Math.ceil(Math.max(4, maxVal) / (double) tick);

        CategoryAxis x = new CategoryAxis();
        NumberAxis y = new NumberAxis(0, upper, tick);
        y.setMinorTickVisible(false);
        y.setLabel("Completed");
        LineChart<String, Number> chart = new LineChart<>(x, y);
        chart.setLegendVisible(false);
        chart.setAnimated(false);
        chart.setCreateSymbols(trendDays <= 30);
        chart.setPrefHeight(250);
        XYChart.Series<String, Number> series = new XYChart.Series<>();
        data.forEach((d, n) -> series.getData().add(new XYChart.Data<>(d.getDayOfMonth() + "/" + d.getMonthValue(), n)));
        chart.getData().add(series);

        ToggleGroup g = new ToggleGroup();
        HBox toggles = Ui.row(6);
        for (int days : new int[]{30, 90}) {
            ToggleButton b = new ToggleButton(days + " days");
            b.setToggleGroup(g);
            b.setSelected(days == trendDays);
            b.setOnAction(e -> { trendDays = days; refresh(); });
            toggles.getChildren().add(b);
        }
        return Ui.card(Ui.row(10, Ui.label("Check-ins per day", "h3"), Ui.spacer(), toggles), chart);
    }

    private Node weekdayChart(EnumMap<DayOfWeek, Integer> data) {
        NumberAxis y = new NumberAxis();
        y.setMinorTickVisible(false);
        BarChart<String, Number> chart = new BarChart<>(new CategoryAxis(), y);
        chart.setLegendVisible(false);
        chart.setAnimated(false);
        chart.setCategoryGap(18);
        chart.setPrefHeight(240);
        XYChart.Series<String, Number> s = new XYChart.Series<>();
        data.forEach((d, n) -> s.getData().add(new XYChart.Data<>(d.getDisplayName(TextStyle.SHORT, Locale.ENGLISH), n)));
        chart.getData().add(s);
        return Ui.card(Ui.label("By weekday (90 days)", "h3"), chart);
    }

    private Node categoryChart() {
        PieChart chart = new PieChart();
        chart.setAnimated(false);
        chart.setLegendVisible(false);
        chart.setPrefHeight(240);
        ctx.stats.byCategory(30).forEach((c, n) -> chart.getData().add(new PieChart.Data(c + " (" + n + ")", n)));
        return Ui.card(Ui.label("By category (30 days)", "h3"), chart);
    }

    private Node moodCard() {
        VBox box = Ui.card(Ui.col(2, Ui.label("Mood insights", "h3"),
                Ui.label("How your journal mood differs on days you do each habit (Pearson r; |r| ≥ 0.3 is notable). Correlation is not causation.", "muted", "small")));
        List<StatsController.MoodInsight> insights = ctx.stats.moodInsights();
        if (insights.isEmpty()) box.getChildren().add(Ui.label("Write a few more journal entries to see insights.", "muted"));
        List<StatsController.MoodInsight> shown = insights.subList(0, Math.min(6, insights.size()));
        for (int idx = 0; idx < shown.size(); idx++) {
            StatsController.MoodInsight i = shown.get(idx);
            if (idx > 0) box.getChildren().add(Ui.divider());
            double diff = i.moodWhenDone() - i.moodWhenSkipped();
            String text = String.format("On days you do %s, mood averages %.1f vs %.1f when skipped", i.habitName(), i.moodWhenDone(), i.moodWhenSkipped());
            box.getChildren().add(Ui.row(10, Ui.label(text), Ui.spacer(),
                    Ui.pill(String.format("%+.1f", diff), diff >= 0 ? "pill-good" : "pill-muted"),
                    Ui.label(String.format("r = %.2f  ·  %d days", i.r(), i.days()), "muted", "small")));
        }
        return box;
    }

    private Node rankingCard(List<HabitSummary> all) {
        VBox box = Ui.card(Ui.label("Habit strength ranking", "h3"));
        all.stream().sorted(Comparator.comparingInt(HabitSummary::strength).reversed()).forEach(s -> {
            ProgressBar bar = new ProgressBar(s.strength() / 100.0);
            HBox.setHgrow(bar, Priority.ALWAYS);
            bar.setMaxWidth(Double.MAX_VALUE);
            Label name = Ui.label(s.habit().getName());
            name.setMinWidth(180);
            name.setPrefWidth(180);
            Label score = Ui.label(String.valueOf(s.strength()), "h3");
            score.setMinWidth(32);
            box.getChildren().add(Ui.row(12, Ui.dot(s.habit().getColor(), 6), name, bar, score));
        });
        return box;
    }
}
