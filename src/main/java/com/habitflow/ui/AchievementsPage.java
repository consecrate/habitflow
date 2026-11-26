package com.habitflow.ui;

import com.habitflow.model.Achievement;
import javafx.scene.control.ProgressBar;
import javafx.scene.layout.*;

import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

/** Earned and locked badges. */
class AchievementsPage extends Page {
    AchievementsPage(AppContext ctx, MainView main) { super(ctx, main); }

    @Override String title() { return "Achievements"; }

    @Override
    protected void build(VBox page) {
        List<Achievement> list = ctx.achievements.list();
        long earned = list.stream().filter(Achievement::isEarned).count();
        ProgressBar progress = new ProgressBar(list.isEmpty() ? 0 : earned / (double) list.size());
        progress.setPrefWidth(180);
        page.getChildren().add(Ui.row(12,
                Ui.label(earned + " of " + list.size() + " unlocked", "h2"),
                Ui.pill(list.isEmpty() ? "0%" : Ui.pct(earned / (double) list.size()), "pill-good"),
                Ui.spacer(), progress));

        GridPane grid = Ui.grid(3);

        DateTimeFormatter f = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);
        for (int i = 0; i < list.size(); i++) {
            Achievement a = list.get(i);
            VBox tile = Ui.card(
                    Ui.row(10, Ui.iconBadge(a.isEarned() ? "★" : "☆"), Ui.spacer(),
                            Ui.pill(a.isEarned() ? "Earned " + a.earnedAt().format(f) : "Locked",
                                    a.isEarned() ? "pill-good" : "pill-muted")),
                    Ui.col(4, Ui.label(a.name(), "h3"), Ui.label(a.description(), "muted", "small")),
                    Ui.vspacer(),
                    Ui.row(6, Ui.coins(a.reward()), Ui.spacer()));
            tile.setMinHeight(168);
            tile.setMaxWidth(Double.MAX_VALUE);
            if (!a.isEarned()) tile.getStyleClass().add("locked");
            grid.add(tile, i % 3, i / 3);
        }
        page.getChildren().add(grid);
    }
}
