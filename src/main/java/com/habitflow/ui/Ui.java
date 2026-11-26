package com.habitflow.ui;

import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.scene.paint.Color;
import javafx.scene.shape.Circle;

import java.time.LocalDate;
import java.util.function.Consumer;
import java.util.function.IntConsumer;

/** Small factory helpers so every page looks the same. */
final class Ui {
    static final String STYLESHEET = Ui.class.getResource("/styles.css").toExternalForm();
    static final String[] MOODS = {"Awful", "Bad", "Okay", "Good", "Great"};
    static final String[] MOOD_COLORS = {"#DC2626", "#D97706", "#9CA3AF", "#3B9B6D", "#1F7A54"};

    /** Set by MainView; shows a short message in the corner. */
    static Consumer<String> toaster = msg -> { };

    private Ui() { }

    static Label label(String text, String... styleClasses) {
        Label l = new Label(text);
        l.getStyleClass().addAll(styleClasses);
        l.setWrapText(true);
        return l;
    }

    static Label pill(String text, String... styleClasses) {
        Label l = new Label(text);
        l.getStyleClass().add("pill");
        l.getStyleClass().addAll(styleClasses);
        return l;
    }

    static Button button(String text, Runnable action, String... styleClasses) {
        Button b = new Button(text);
        b.getStyleClass().addAll(styleClasses);
        b.setOnAction(e -> attempt(action));
        return b;
    }

    static HBox row(double spacing, Node... nodes) {
        HBox h = new HBox(spacing, nodes);
        h.setAlignment(Pos.CENTER_LEFT);
        return h;
    }

    static VBox col(double spacing, Node... nodes) {
        return new VBox(spacing, nodes);
    }

    static Region spacer() {
        Region r = new Region();
        HBox.setHgrow(r, Priority.ALWAYS);
        return r;
    }

    static Region vspacer() {
        Region r = new Region();
        VBox.setVgrow(r, Priority.ALWAYS);
        return r;
    }

    static GridPane grid(int cols) {
        GridPane g = new GridPane();
        g.setHgap(14);
        g.setVgap(14);
        for (int c = 0; c < cols; c++) {
            ColumnConstraints cc = new ColumnConstraints();
            cc.setPercentWidth(100.0 / cols);
            cc.setHgrow(Priority.ALWAYS);
            g.getColumnConstraints().add(cc);
        }
        return g;
    }

    static HBox brand(String titleStyle) {
        StackPane mark = new StackPane(label("H", "brand-mark-text"));
        mark.getStyleClass().add("brand-mark");
        return row(10, mark, label("HabitFlow", titleStyle));
    }

    static <T> void nullableCombo(ComboBox<T> box, String emptyLabel) {
        box.setButtonCell(new ListCell<>() {
            @Override protected void updateItem(T item, boolean empty) {
                super.updateItem(item, empty);
                setText(item == null ? emptyLabel : item.toString());
            }
        });
        box.setCellFactory(l -> new ListCell<>() {
            @Override protected void updateItem(T item, boolean empty) {
                super.updateItem(item, empty);
                setText(empty ? null : item == null ? emptyLabel : item.toString());
            }
        });
    }

    static Region divider() {
        Region r = new Region();
        r.getStyleClass().add("divider");
        r.setMaxWidth(Double.MAX_VALUE);
        return r;
    }

    static VBox card(Node... nodes) {
        VBox v = new VBox(12, nodes);
        v.getStyleClass().add("card");
        return v;
    }

    static VBox statCard(String title, String value, String sub) {
        VBox c = card(label(title, "muted", "small"), label(value, "big-number"), label(sub, "muted", "small"));
        c.setSpacing(4);
        c.getStyleClass().add("stat-card");
        HBox.setHgrow(c, Priority.ALWAYS);
        c.setMaxWidth(Double.MAX_VALUE);
        return c;
    }

    static StackPane avatar(String name) {
        String letter = (name == null || name.isBlank()) ? "?" : name.trim().substring(0, 1).toUpperCase();
        StackPane badge = new StackPane(label(letter, "avatar-text"));
        badge.getStyleClass().add("avatar");
        return badge;
    }

    static StackPane iconBadge(String symbol) {
        StackPane badge = new StackPane(label(symbol, "power-icon"));
        badge.getStyleClass().add("icon-badge");
        return badge;
    }

    static Circle dot(String hex, double radius) {
        return new Circle(radius, Color.web(hex));
    }

    static HBox coins(int amount) {
        Circle c = new Circle(7);
        c.getStyleClass().add("coin");
        HBox h = row(6, c, label(String.format("%,d", amount), "gold"));
        h.getStyleClass().add("coin-chip");
        return h;
    }

    static HBox moodButtons(ToggleGroup group, int selected, IntConsumer onPick) {
        HBox box = row(8);
        for (int i = 1; i <= 5; i++) {
            int mood = i;
            ToggleButton b = new ToggleButton(MOODS[i - 1], dot(MOOD_COLORS[i - 1], 4.5));
            b.setGraphicTextGap(7);
            b.setUserData(mood);
            b.setToggleGroup(group);
            b.setSelected(mood == selected);
            if (onPick != null) b.setOnAction(e -> attempt(() -> onPick.accept(mood)));
            box.getChildren().add(b);
        }
        return box;
    }

    static String pct(double fraction) {
        return Math.round(fraction * 100) + "%";
    }

    static String toHex(Color c) {
        return String.format("#%02X%02X%02X", Math.round(c.getRed() * 255), Math.round(c.getGreen() * 255), Math.round(c.getBlue() * 255));
    }

    static DatePicker datePicker(LocalDate initial, LocalDate min, LocalDate max) {
        DatePicker dp = new DatePicker(initial);
        dp.setDayCellFactory(p -> new DateCell() {
            @Override public void updateItem(LocalDate d, boolean empty) {
                super.updateItem(d, empty);
                setDisable(empty || (max != null && d.isAfter(max)) || (min != null && d.isBefore(min)));
            }
        });
        return dp;
    }

    /** Runs a user action; validation problems become an error dialog instead of a crash. */
    static boolean attempt(Runnable action) {
        try {
            action.run();
            return true;
        } catch (RuntimeException e) {
            error(e.getMessage() == null ? e.toString() : e.getMessage());
            return false;
        }
    }

    static void error(String message) {
        Alert a = new Alert(Alert.AlertType.ERROR, message, ButtonType.OK);
        a.setHeaderText(null);
        a.setTitle("HabitFlow");
        styleDialog(a.getDialogPane(), ButtonType.OK);
        a.showAndWait();
    }

    static boolean confirm(String message) {
        Alert a = new Alert(Alert.AlertType.CONFIRMATION, message, ButtonType.CANCEL, ButtonType.OK);
        a.setHeaderText(null);
        a.setTitle("HabitFlow");
        styleDialog(a.getDialogPane(), ButtonType.OK);
        return a.showAndWait().filter(b -> b == ButtonType.OK).isPresent();
    }

    static void styleDialog(DialogPane pane, ButtonType primaryType) {
        if (!pane.getStylesheets().contains(STYLESHEET)) pane.getStylesheets().add(STYLESHEET);
        Node primary = pane.lookupButton(primaryType);
        if (primary != null) primary.getStyleClass().add("primary");
    }

    static void toast(String message) {
        toaster.accept(message);
    }

    static ScrollPane scroll(Node content) {
        ScrollPane s = new ScrollPane(content);
        s.setFitToWidth(true);
        s.getStyleClass().add("scroll");
        s.setPadding(Insets.EMPTY);
        return s;
    }
}
