package com.habitflow.ui;

import com.habitflow.controller.Session;
import com.habitflow.model.Habit;
import javafx.animation.FadeTransition;
import javafx.animation.PauseTransition;
import javafx.animation.SequentialTransition;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Parent;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.*;
import javafx.util.Duration;

import java.util.LinkedHashMap;
import java.util.Map;

/** Sidebar navigation, header with the coin balance, and a toast layer over the current page. */
class MainView {
    private final AppContext ctx;
    private final BorderPane frame = new BorderPane();
    private final StackPane layers = new StackPane();
    private final VBox toasts = new VBox(8);
    private final Label title = Ui.label("", "h2");
    private final HBox userChip = Ui.row(8);
    private final HBox coinSlot = new HBox();
    private final Map<String, Button> navButtons = new LinkedHashMap<>();
    private final Map<String, Page> pages = new LinkedHashMap<>();
    private Page current;

    MainView(AppContext ctx, Runnable onLogout) {
        this.ctx = ctx;
        pages.put("Today", new TodayPage(ctx, this));
        pages.put("Habits", new HabitsPage(ctx, this));
        pages.put("Journal", new JournalPage(ctx, this));
        pages.put("Statistics", new StatsPage(ctx, this));
        pages.put("Achievements", new AchievementsPage(ctx, this));
        pages.put("Friends", new FriendsPage(ctx, this));
        pages.put("Shop", new ShopPage(ctx, this));
        pages.put("Settings", new SettingsPage(ctx, this));

        VBox sidebar = new VBox();
        sidebar.getStyleClass().add("sidebar");

        HBox brandRow = Ui.brand("brand");
        brandRow.getStyleClass().add("brand-row");
        sidebar.getChildren().add(brandRow);

        addNavGroup(sidebar, "TRACK", "Today", "Habits", "Journal");
        addNavGroup(sidebar, "INSIGHTS", "Statistics", "Achievements");
        addNavGroup(sidebar, "COMMUNITY", "Friends", "Shop");

        Button settingsBtn = navButton("Settings");
        Button logout = new Button("Log out");
        logout.getStyleClass().addAll("nav-button", "nav-logout");
        logout.setOnAction(e -> onLogout.run());
        sidebar.getChildren().addAll(Ui.vspacer(), Ui.divider(), settingsBtn, logout);

        coinSlot.setOnMouseClicked(e -> show(pages.get("Shop")));
        HBox header = Ui.row(14, title, Ui.spacer(), coinSlot, userChip);
        header.getStyleClass().add("header");

        toasts.setAlignment(Pos.TOP_RIGHT);
        toasts.setPickOnBounds(false);
        toasts.setPadding(new Insets(16));
        toasts.setMaxWidth(380);
        StackPane.setAlignment(toasts, Pos.TOP_RIGHT);

        BorderPane content = new BorderPane();
        content.setTop(header);
        content.setCenter(layers);
        frame.setLeft(sidebar);
        frame.setCenter(content);

        Ui.toaster = msg -> Platform.runLater(() -> toast(msg));
        Session.addChangeListener(() -> Platform.runLater(this::updateHeader));
        updateHeader();
    }

    private void addNavGroup(VBox sidebar, String heading, String... names) {
        sidebar.getChildren().add(Ui.label(heading, "section-label"));
        for (String name : names) sidebar.getChildren().add(navButton(name));
    }

    private Button navButton(String name) {
        Button b = new Button(name);
        b.getStyleClass().add("nav-button");
        b.setOnAction(e -> show(pages.get(name)));
        navButtons.put(name, b);
        return b;
    }

    /** After login: spend freezes on missed days, start reminders, announce unlocks. */
    void onLoggedIn() {
        show(pages.get("Today"));
        Ui.attempt(() -> ctx.shop.autoApplyFreezes().forEach(Ui::toast));
        ctx.reminders.start(Ui::toast);
        current.refresh();
    }

    Parent view() { return frame; }

    void show(Page page) {
        current = page;
        title.setText(page.title());
        navButtons.forEach((name, b) -> b.getStyleClass().remove("active"));
        pages.forEach((name, p) -> { if (p == page) navButtons.get(name).getStyleClass().add("active"); });
        page.refresh();
        layers.getChildren().setAll(page.view(), toasts);
    }

    Page page(String name) { return pages.get(name); }

    void createHabit() {
        new HabitEditorDialog(null, ctx.habits.categories(), null).ask().ifPresent(r -> {
            Habit h = ctx.habits.create(r.habit());
            ctx.reminders.save(h, r.reminder());
            Ui.toast("Created " + h.getName());
            if (current != null) current.refresh();
        });
    }

    private void updateHeader() {
        if (!Session.isLoggedIn()) return;
        var user = Session.require();
        userChip.getChildren().setAll(Ui.avatar(user.getDisplayName()), Ui.label(user.getDisplayName(), "field-label"));
        coinSlot.getChildren().setAll(Ui.coins(user.getCoins()));
    }

    private void toast(String message) {
        Label l = Ui.label(message, "toast");
        l.setMaxWidth(360);
        toasts.getChildren().add(l);
        FadeTransition out = new FadeTransition(Duration.millis(400), l);
        out.setToValue(0);
        SequentialTransition seq = new SequentialTransition(new PauseTransition(Duration.seconds(3.5)), out);
        seq.setOnFinished(e -> toasts.getChildren().remove(l));
        seq.play();
    }
}
