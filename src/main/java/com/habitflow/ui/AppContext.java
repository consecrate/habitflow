package com.habitflow.ui;

import com.habitflow.controller.*;

/** The one set of controllers the GUI talks to. The GUI never touches the database tier. */
final class AppContext {
    final AchievementController achievements = new AchievementController();
    final AuthController auth = new AuthController();
    final HabitController habits = new HabitController(achievements);
    final CheckInController checkIns = new CheckInController(achievements);
    final StatsController stats = new StatsController();
    final ShopController shop = new ShopController(achievements);
    final SocialController social = new SocialController(achievements);
    final ReminderController reminders = new ReminderController();
    final ImportExportController io = new ImportExportController();

    AppContext() {
        // registered once for the whole app run, not once per login
        achievements.addUnlockListener(a -> Ui.toast("Achievement unlocked: " + a.name() + (a.reward() > 0 ? "  +" + a.reward() + " coins" : "")));
    }
}
