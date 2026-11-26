package com.habitflow.ui;

import com.habitflow.controller.StartupController;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.Alert;
import javafx.stage.Stage;

/** Entry point. Run with: mvn javafx:run  (add -Djavafx.args=--screenshots to export report figures). */
public class App extends Application {
    private Stage stage;
    private final AppContext ctx = new AppContext();

    @Override
    public void start(Stage stage) {
        this.stage = stage;
        stage.setTitle("HabitFlow");
        stage.setMinWidth(1000);
        stage.setMinHeight(680);
        try {
            StartupController.initDatabase();
        } catch (RuntimeException e) {
            Alert a = new Alert(Alert.AlertType.ERROR, e.getMessage());
            a.setHeaderText("Database not available");
            a.showAndWait();
            Platform.exit();
            return;
        }
        if (getParameters().getRaw().contains("--screenshots")) {
            Screenshots.capture(ctx);
            Platform.exit();
            return;
        }
        showLogin();
        stage.show();
    }

    private void showLogin() {
        setRoot(new LoginView(ctx, this::showMain).view());
    }

    private void showMain() {
        MainView main = new MainView(ctx, this::logout);
        setRoot(main.view());
        main.onLoggedIn();
    }

    private void logout() {
        ctx.reminders.stop();
        ctx.auth.logout();
        showLogin();
    }

    private void setRoot(Parent root) {
        if (stage.getScene() == null) {
            Scene scene = new Scene(root, 1200, 800);
            scene.getStylesheets().add(Ui.STYLESHEET);
            stage.setScene(scene);
        } else {
            stage.getScene().setRoot(root);
        }
    }

    @Override
    public void stop() {
        ctx.reminders.stop();
    }

    public static void main(String[] args) {
        launch(args);
    }
}
