package com.habitflow.ui;

import javafx.embed.swing.SwingFXUtils;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.image.WritableImage;

import javax.imageio.ImageIO;
import java.io.File;
import java.io.IOException;
import java.util.List;

/** Renders each screen to docs/screenshots/*.png for the report (run with --screenshots after seeding). */
final class Screenshots {
    private static final File DIR = new File("docs/screenshots");

    private Screenshots() { }

    static void capture(AppContext ctx) {
        DIR.mkdirs();
        LoginView login = new LoginView(ctx, () -> { });
        login.username.setText("demo");
        login.password.setText("demo1234");
        save(login.view(), "01-login");

        ctx.auth.login("demo", "demo1234");
        ctx.shop.autoApplyFreezes(); // same as a real login
        MainView main = new MainView(ctx, () -> { });
        int i = 2;
        for (String name : List.of("Today", "Habits", "Statistics", "Journal", "Achievements", "Friends", "Shop", "Settings")) {
            main.show(main.page(name));
            save(main.view(), String.format("%02d-%s", i++, name.toLowerCase()));
        }
        var habit = ctx.habits.list().get(0);
        main.show(new HabitDetailPage(ctx, main, habit));
        save(main.view(), String.format("%02d-habit-detail", i++));

        HabitEditorDialog editor = new HabitEditorDialog(ctx.habits.list().get(1), ctx.habits.categories(), java.time.LocalTime.of(10, 0));
        save(editor.getDialogPane(), String.format("%02d-habit-editor", i));
        ctx.auth.logout();
        System.out.println("Screenshots written to " + DIR.getAbsolutePath());
    }

    private static void save(Parent root, String name) {
        Scene scene = root.getScene() != null ? root.getScene() : new Scene(root, 1280, 860);
        if (!scene.getStylesheets().contains(Ui.STYLESHEET)) scene.getStylesheets().add(Ui.STYLESHEET);
        root.applyCss();
        root.layout();
        WritableImage img = scene.snapshot(null);
        try {
            ImageIO.write(SwingFXUtils.fromFXImage(img, null), "png", new File(DIR, name + ".png"));
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
