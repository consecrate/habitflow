package com.habitflow.ui;

import javafx.scene.canvas.Canvas;
import javafx.scene.canvas.GraphicsContext;
import javafx.scene.control.Tooltip;
import javafx.scene.paint.Color;
import javafx.scene.text.Font;
import javafx.util.Duration;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.util.Locale;
import java.util.Map;

/** A year of days as a grid of squares (one column per week); darker = more done. */
class HeatmapCanvas extends Canvas {
    private static final double CELL = 12, GAP = 3, LEFT = 30, TOP = 18;
    private static final int WEEKS = 53;
    private static final Color EMPTY = Color.web("#EBEEF0");
    private static final DateTimeFormatter TIP_DATE = DateTimeFormatter.ofPattern("EEE d MMM yyyy", Locale.ENGLISH);

    HeatmapCanvas(Map<LocalDate, Double> values, String colorHex) {
        super(LEFT + WEEKS * (CELL + GAP), TOP + 7 * (CELL + GAP));
        LocalDate today = LocalDate.now();
        LocalDate firstMonday = today.with(DayOfWeek.MONDAY).minusWeeks(WEEKS - 1);
        draw(firstMonday, values, Color.web(colorHex), today);

        Tooltip tip = new Tooltip();
        tip.setShowDelay(Duration.millis(80));
        Tooltip.install(this, tip);
        setOnMouseMoved(e -> {
            int w = (int) ((e.getX() - LEFT) / (CELL + GAP));
            int d = (int) ((e.getY() - TOP) / (CELL + GAP));
            if (e.getX() < LEFT || e.getY() < TOP || w >= WEEKS || d > 6) { tip.setText(""); return; }
            LocalDate day = firstMonday.plusWeeks(w).plusDays(d);
            Double v = values.get(day);
            tip.setText(day.format(TIP_DATE)
                    + (v == null ? "  ·  nothing" : "  ·  " + Math.round(v * 100) + "%"));
        });
    }

    private void draw(LocalDate firstMonday, Map<LocalDate, Double> values, Color base, LocalDate today) {
        GraphicsContext g = getGraphicsContext2D();
        g.setFont(Font.font(10));
        g.setFill(Color.web("#6B7280"));
        String[] rows = {"Mon", "", "Wed", "", "Fri", "", ""};
        for (int d = 0; d < 7; d++) g.fillText(rows[d], 0, TOP + d * (CELL + GAP) + CELL - 2);
        int lastMonth = -1, lastLabelWeek = -4;
        for (int w = 0; w < WEEKS; w++) {
            LocalDate weekStart = firstMonday.plusWeeks(w);
            if (weekStart.getMonthValue() != lastMonth) {
                lastMonth = weekStart.getMonthValue();
                if (w - lastLabelWeek >= 3) {
                    lastLabelWeek = w;
                    g.setFill(Color.web("#6B7280"));
                    g.fillText(weekStart.getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH), LEFT + w * (CELL + GAP), 11);
                }
            }
            for (int d = 0; d < 7; d++) {
                LocalDate day = weekStart.plusDays(d);
                if (day.isAfter(today)) continue;
                Double v = values.get(day);
                g.setFill(v == null || v <= 0 ? EMPTY : Color.WHITE.interpolate(base, 0.3 + 0.7 * Math.min(1, v)));
                g.fillRoundRect(LEFT + w * (CELL + GAP), TOP + d * (CELL + GAP), CELL, CELL, 3, 3);
            }
        }
    }
}
