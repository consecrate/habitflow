package com.habitflow.ui;

import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.Parent;
import javafx.scene.control.*;
import javafx.scene.layout.HBox;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;

/** Log in and create-account forms on one card. */
class LoginView {
    private final AppContext ctx;
    private final Runnable onSuccess;
    private final StackPane root = new StackPane();
    final TextField username = new TextField();
    final PasswordField password = new PasswordField();

    LoginView(AppContext ctx, Runnable onSuccess) {
        this.ctx = ctx;
        this.onSuccess = onSuccess;
        showLogin();
    }

    Parent view() { return root; }

    private void showLogin() {
        username.setPromptText("Enter your username");
        password.setPromptText("Enter your password");
        Label error = errorLabel();
        Button login = new Button("Log in");
        login.getStyleClass().add("primary");
        login.setMaxWidth(Double.MAX_VALUE);
        login.setDefaultButton(true);
        login.setOnAction(e -> {
            try {
                ctx.auth.login(username.getText(), password.getText());
                onSuccess.run();
            } catch (RuntimeException ex) {
                showError(error, ex.getMessage());
                password.clear();
            }
        });
        Hyperlink toRegister = new Hyperlink("No account yet? Create one");
        toRegister.setOnAction(e -> showRegister());
        HBox linkRow = Ui.row(0, toRegister);
        linkRow.setAlignment(Pos.CENTER);

        HBox demoHint = Ui.row(6, Ui.label("Demo account:", "muted", "small"), Ui.pill("demo / demo1234", "pill-muted"));
        demoHint.setAlignment(Pos.CENTER);

        setCard(Ui.col(4, Ui.label("Welcome back", "h2"), Ui.label("Log in to keep your streaks going.", "muted")),
                field("Username", username),
                field("Password", password),
                error, login, linkRow, Ui.divider(), demoHint);
    }

    private void showRegister() {
        TextField user = new TextField();
        user.setPromptText("3–20 letters, digits, or _");
        TextField display = new TextField();
        display.setPromptText("Your display name");
        PasswordField pw = new PasswordField();
        pw.setPromptText("8+ chars, a letter and a digit");
        PasswordField confirm = new PasswordField();
        confirm.setPromptText("Repeat password");
        Label error = errorLabel();
        Button create = new Button("Create account");
        create.getStyleClass().add("primary");
        create.setMaxWidth(Double.MAX_VALUE);
        create.setDefaultButton(true);
        create.setOnAction(e -> {
            try {
                ctx.auth.register(user.getText(), display.getText(), pw.getText(), confirm.getText());
                onSuccess.run();
            } catch (RuntimeException ex) {
                showError(error, ex.getMessage());
            }
        });
        Hyperlink back = new Hyperlink("I already have an account");
        back.setOnAction(e -> showLogin());
        HBox linkRow = Ui.row(0, back);
        linkRow.setAlignment(Pos.CENTER);

        setCard(Ui.col(4, Ui.label("Create your account", "h2"), Ui.label("Start building better habits today.", "muted")),
                field("Username", user),
                field("Name", display),
                field("Password", pw),
                field("Confirm password", confirm),
                error, create, linkRow);
    }

    private static VBox field(String caption, Control input) {
        return Ui.col(5, Ui.label(caption, "field-label"), input);
    }

    private static Label errorLabel() {
        Label l = Ui.label("", "error-label");
        l.setVisible(false);
        l.setManaged(false);
        return l;
    }

    private static void showError(Label l, String msg) {
        l.setText(msg);
        l.setVisible(true);
        l.setManaged(true);
    }

    private void setCard(Node... nodes) {
        HBox brandRow = Ui.brand("h1");
        brandRow.setAlignment(Pos.CENTER);
        Label tagline = Ui.label("Small habits, tracked honestly.", "muted");
        VBox card = Ui.card(nodes);
        card.getStyleClass().add("login-card");
        VBox box = new VBox(12, brandRow, tagline, card);
        box.setAlignment(Pos.CENTER);
        box.setMaxWidth(390);
        root.getChildren().setAll(box);
        StackPane.setAlignment(box, Pos.CENTER);
    }
}
