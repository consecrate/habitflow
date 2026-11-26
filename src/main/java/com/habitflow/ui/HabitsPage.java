package com.habitflow.ui;

import com.habitflow.controller.HabitController.SortOrder;
import com.habitflow.model.*;
import javafx.geometry.Insets;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;

import java.util.List;

/** All habits with search, filters, sorting, archive/restore, and the editor. */
class HabitsPage extends Page {
    private final TextField search = new TextField();
    private final ComboBox<Category> category = new ComboBox<>();
    private final ComboBox<HabitType> type = new ComboBox<>();
    private final ComboBox<SortOrder> sort = new ComboBox<>();
    private final CheckBox archived = new CheckBox("Show archived");
    private final VBox list = new VBox(8);

    HabitsPage(AppContext ctx, MainView main) {
        super(ctx, main);
        search.setPromptText("Search habits…");
        HBox.setHgrow(search, Priority.ALWAYS);
        search.textProperty().addListener((o, a, b) -> fillList());

        Ui.nullableCombo(category, "All categories");
        type.getItems().add(null);
        type.getItems().addAll(HabitType.values());
        Ui.nullableCombo(type, "All types");
        sort.getItems().setAll(SortOrder.values());
        sort.setValue(SortOrder.NAME);

        for (ComboBox<?> c : List.of(category, type, sort)) c.setOnAction(e -> fillList());
        archived.setOnAction(e -> fillList());
    }

    @Override String title() { return "Habits"; }

    @Override
    protected void build(VBox page) {
        Category keep = category.getValue();
        category.getItems().setAll((Category) null);
        category.getItems().addAll(ctx.habits.categories());
        category.setValue(keep != null && category.getItems().contains(keep) ? keep : null);

        HBox topRow = Ui.row(10, search, Ui.button("Categories…", this::manageCategories), Ui.button("+ New habit", main::createHabit, "primary"));
        HBox filterRow = Ui.row(10, category, type, Ui.label("Sort by", "muted", "small"), sort, Ui.spacer(), archived);
        VBox toolbar = Ui.card(topRow, filterRow);
        toolbar.setSpacing(10);
        page.getChildren().addAll(toolbar, list);
        fillList();
    }

    private void fillList() {
        List<HabitSummary> found = ctx.habits.search(search.getText(), category.getValue(), type.getValue(), sort.getValue(), archived.isSelected());
        list.getChildren().clear();
        if (found.isEmpty()) {
            list.getChildren().add(Ui.card(Ui.label("No habits match your current filters.", "muted")));
        } else {
            found.forEach(s -> list.getChildren().add(card(s)));
        }
    }

    private Node card(HabitSummary s) {
        Habit h = s.habit();
        HBox titleRow = Ui.row(8, Ui.label(h.getName(), "h3"));
        if (h.isShared()) titleRow.getChildren().add(Ui.pill("Shared", "pill-good"));
        if (h.isArchived()) titleRow.getChildren().add(Ui.pill("Archived", "pill-muted"));

        String sub = h.getType() + "  ·  " + h.getSchedule().describe()
                + (h.getCategoryName() == null ? "" : "  ·  " + h.getCategoryName());
        VBox text = Ui.col(3, titleRow, Ui.label(sub, "muted", "small"));
        HBox info = Ui.row(12, Ui.dot(h.getColor(), 6.5), text);
        info.getStyleClass().add("clickable");
        HBox.setHgrow(info, Priority.ALWAYS);
        info.setOnMouseClicked(e -> main.show(new HabitDetailPage(ctx, main, h)));

        HBox numbers = Ui.row(16,
                metric(h.getSchedule().formatStreak(s.currentStreak()), "streak", 74),
                metric(String.valueOf(s.longestStreak()), "best", 50),
                metric(String.valueOf(s.strength()), "strength", 60),
                metric(Ui.pct(s.completionRate()), "rate", 56));

        MenuItem detailsItem = new MenuItem("View details");
        detailsItem.setOnAction(e -> main.show(new HabitDetailPage(ctx, main, h)));
        MenuItem archiveItem = new MenuItem(h.isArchived() ? "Restore" : "Archive");
        archiveItem.setOnAction(e -> Ui.attempt(() -> {
            ctx.habits.setArchived(h, !h.isArchived());
            Ui.toast(h.getName() + (h.isArchived() ? " restored" : " archived"));
            refresh();
        }));
        MenuItem deleteItem = new MenuItem("Delete…");
        deleteItem.getStyleClass().add("danger-item");
        deleteItem.setOnAction(e -> Ui.attempt(() -> {
            if (Ui.confirm("Delete " + h.getName() + " and all of its history? This cannot be undone. Archive keeps the history.")) {
                ctx.habits.delete(h);
                refresh();
            }
        }));
        MenuButton more = new MenuButton("⋯", null, detailsItem, archiveItem, new SeparatorMenuItem(), deleteItem);
        more.getStyleClass().add("icon-menu");

        HBox actions = Ui.row(6, Ui.button("Edit", () -> edit(h), "compact"), more);
        HBox row = Ui.row(14, info, numbers, actions);
        row.getStyleClass().addAll("card", "habit-row");
        if (h.isArchived()) row.getStyleClass().add("locked");
        return row;
    }

    private static Node metric(String value, String caption, double width) {
        VBox v = Ui.col(1, Ui.label(value, "h3"), Ui.label(caption, "muted", "small"));
        v.setMinWidth(width);
        v.setPrefWidth(width);
        return v;
    }

    private void edit(Habit h) {
        new HabitEditorDialog(h, ctx.habits.categories(), ctx.reminders.timeFor(h.getId())).ask().ifPresent(r -> {
            ctx.habits.update(r.habit());
            ctx.reminders.save(r.habit(), r.reminder());
            refresh();
        });
    }

    private void manageCategories() {
        Dialog<Void> d = new Dialog<>();
        d.setTitle("Categories");
        d.setHeaderText("Manage categories");
        d.getDialogPane().getButtonTypes().add(ButtonType.CLOSE);
        Ui.styleDialog(d.getDialogPane(), ButtonType.CLOSE);
        VBox box = new VBox(10);
        box.setPadding(new Insets(4, 0, 4, 0));
        box.setPrefWidth(380);
        Runnable[] fill = new Runnable[1];
        TextField name = new TextField();
        name.setPromptText("New category name");
        HBox.setHgrow(name, Priority.ALWAYS);
        ColorPicker color = new ColorPicker(Color.web("#4F7CAC"));
        color.setPrefWidth(110);
        fill[0] = () -> {
            box.getChildren().clear();
            for (Category c : ctx.habits.categories()) {
                box.getChildren().add(Ui.row(10, Ui.dot(c.color(), 6), Ui.label(c.name()), Ui.spacer(),
                        Ui.button("Remove", () -> { ctx.habits.deleteCategory(c); fill[0].run(); }, "danger", "compact")));
            }
            box.getChildren().addAll(Ui.divider(), Ui.row(8, name, color, Ui.button("Add", () -> {
                ctx.habits.addCategory(name.getText(), Ui.toHex(color.getValue()));
                name.clear();
                fill[0].run();
            }, "primary")));
        };
        fill[0].run();
        d.getDialogPane().setContent(box);
        d.showAndWait();
        refresh();
    }
}
