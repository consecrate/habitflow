package com.habitflow.ui;

import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;

/** One screen in the main window. Subclasses rebuild their content in {@link #build}. */
abstract class Page {
    protected final AppContext ctx;
    protected final MainView main;
    private final VBox content = new VBox();
    private final Node view;

    protected Page(AppContext ctx, MainView main) {
        this.ctx = ctx;
        this.main = main;
        content.getStyleClass().add("page");
        StackPane shell = new StackPane(content);
        shell.getStyleClass().add("page-shell");
        StackPane.setAlignment(content, Pos.TOP_CENTER);
        view = Ui.scroll(shell);
    }

    abstract String title();

    /** Fills the (already cleared) page with fresh data from the controllers. */
    protected abstract void build(VBox page);

    final void refresh() {
        content.getChildren().clear();
        build(content);
    }

    final Node view() { return view; }
}
