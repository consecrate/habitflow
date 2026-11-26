package com.habitflow;

import com.habitflow.controller.*;
import com.habitflow.db.Database;
import com.habitflow.model.*;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** Runs the controllers against a real PostgreSQL database (habitflow_test). */
class DatabaseIntegrationTest {
    private static final String PW = "password1";
    private final AuthController auth = new AuthController();
    private final AchievementController achievements = new AchievementController();
    private final HabitController habits = new HabitController(achievements);
    private final CheckInController checkIns = new CheckInController(achievements);
    private final ShopController shop = new ShopController(achievements);
    private final SocialController social = new SocialController(achievements);
    private final StatsController stats = new StatsController();
    private final ReminderController reminders = new ReminderController();
    private final ImportExportController io = new ImportExportController();

    @BeforeAll
    static void schema() {
        assertTrue(Database.url().endsWith("habitflow_test"), "tests must never touch the real database");
        Database.runScript("/schema.sql");
    }

    @BeforeEach
    void clean() {
        TestDb.truncateUsers();
        auth.register("tester", "Tester", PW, PW);
    }

    private Habit daily(String name, int daysAgo) {
        Habit h = HabitType.BOOLEAN.newHabit();
        h.setName(name);
        habits.create(h);
        h.setCreatedOn(LocalDate.now().minusDays(daysAgo));
        TestDb.setCreatedOn(h.getId(), h.getCreatedOn());
        return h;
    }

    private long ledgerSum() { return TestDb.ledgerSum(Session.require().getId()); }

    @Test
    void loginLocksAfterFiveFailures() {
        auth.logout();
        for (int i = 0; i < 4; i++) assertThrows(IllegalArgumentException.class, () -> auth.login("tester", "wrong"));
        IllegalStateException locked = assertThrows(IllegalStateException.class, () -> auth.login("tester", "wrong"));
        assertTrue(locked.getMessage().contains("locked"));
        assertThrows(IllegalStateException.class, () -> auth.login("tester", PW), "correct password is refused while locked");
        assertThrows(IllegalArgumentException.class, () -> auth.register("tester", "Again", PW, PW), "duplicate username");
        assertThrows(IllegalArgumentException.class, () -> auth.register("newbie", "N", "short", "short"));
    }

    @Test
    void checkInEarnsCoinsAndUndoRefundsThem() {
        Habit h = daily("Meditate", 0);
        int before = shop.balance();
        CheckInController.Result r = checkIns.checkIn(h);
        assertTrue(r.completed());
        assertTrue(r.coinsDelta() >= 10);
        // checking in again the same day must not pay twice
        assertEquals(0, checkIns.checkIn(h).coinsDelta());
        CheckInController.Result undo = checkIns.undo(h, LocalDate.now());
        assertEquals(-r.coinsDelta(), undo.coinsDelta());
        assertEquals(ledgerSum(), shop.balance(), "ledger must always explain the balance");
        assertTrue(shop.balance() >= before, "achievement rewards stay, check-in coins are gone");
    }

    @Test
    void backfillEarnsNoCoinsAndIsAudited() {
        Habit h = daily("Read", 10);
        checkIns.checkIn(h, 1, LocalDate.now().minusDays(3), "late entry");
        assertEquals(0, TestDb.checkInCoins(Session.require().getId()), "backfilled days pay no coins");
        assertTrue(habits.activityLog(5).stream().anyMatch(a -> a.action().equals("BACKFILL")));
        assertThrows(IllegalArgumentException.class, () -> checkIns.checkIn(h, 1, LocalDate.now().plusDays(1), null));
        assertThrows(IllegalArgumentException.class, () -> checkIns.checkIn(h, 1, LocalDate.now().minusDays(30), null));
    }

    @Test
    void purchaseWithoutEnoughCoinsRollsBack() {
        PowerUp freeze = shop.catalog().stream().filter(p -> p instanceof StreakFreeze).findFirst().orElseThrow();
        assertEquals(0, shop.balance());
        assertThrows(IllegalStateException.class, () -> shop.buy(freeze));
        assertEquals(0, shop.balance());
        assertTrue(shop.inventory().isEmpty());
        assertEquals(0, ledgerSum());
    }

    @Test
    void boughtFreezeSavesAStreakAutomatically() {
        Habit h = daily("Walk", 6);
        for (int d = 6; d >= 2; d--) checkIns.checkIn(h, 1, LocalDate.now().minusDays(d), null); // yesterday missed
        TestDb.giveCoins(Session.require().getId(), 200);
        PowerUp freeze = shop.catalog().stream().filter(p -> p instanceof StreakFreeze).findFirst().orElseThrow();
        shop.buy(freeze);
        assertEquals(0, habits.summary(h).currentStreak(), "streak is broken before the freeze");

        List<String> saved = shop.autoApplyFreezes();
        assertEquals(1, saved.size());
        assertEquals(5 + 1, habits.summary(h).currentStreak(), "5 real days + 1 frozen day");
        assertTrue(shop.inventory().isEmpty(), "freeze was consumed");
        assertTrue(shop.autoApplyFreezes().isEmpty(), "running again does nothing");
        assertEquals(ledgerSum(), shop.balance());
    }

    @Test
    void powerUpWithNoEffectIsNotConsumed() {
        Habit h = daily("Stretch", 0);
        TestDb.giveCoins(Session.require().getId(), 500);
        PowerUp repair = shop.catalog().stream().filter(p -> p instanceof StreakRepair).findFirst().orElseThrow();
        shop.buy(repair);
        assertThrows(IllegalStateException.class, () -> shop.use(repair, h), "nothing missed yet");
        assertEquals(1, shop.inventory().get(0).quantity(), "rolled back, still owned");

        PowerUp doubler = shop.catalog().stream().filter(p -> p instanceof DoubleCoins).findFirst().orElseThrow();
        shop.buy(doubler);
        shop.use(doubler, null);
        assertTrue(shop.doubleCoinsUntil().isPresent());
        CheckInController.Result r = checkIns.checkIn(h);
        assertEquals(20, r.coinsDelta(), "streak 1 -> 10 coins, doubled");
    }

    @Test
    void importIsAllOrNothing() throws Exception {
        Habit h = daily("Water", 20);
        Path good = Files.createTempFile("hf", ".csv");
        Files.writeString(good, "habit,date,value,note,protected\nWater," + LocalDate.now().minusDays(2) + ",1,\"hi, there\",false\n");
        assertEquals(1, io.importCsv(good));
        Path bad = Files.createTempFile("hf", ".csv");
        Files.writeString(bad, "habit,date,value,note,protected\nWater," + LocalDate.now().minusDays(1) + ",1,,false\nNope,2026-01-01,1,,false\n");
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> io.importCsv(bad));
        assertTrue(e.getMessage().startsWith("Line 3"), e.getMessage());
        assertEquals(1, checkIns.history(h).size(), "first row of the bad file was rolled back");
        assertEquals("hi, there", checkIns.history(h).get(0).note());

        Path out = Files.createTempFile("hf", ".csv");
        assertEquals(1, io.exportCsv(out));
        assertTrue(Files.readString(out).contains("\"hi, there\""));
    }

    @Test
    void friendsSeeOnlySharedHabits() {
        Habit secret = daily("Secret", 0);
        Habit open = daily("Run", 0);
        open.setShared(true);
        habits.update(open);
        checkIns.checkIn(open);
        auth.logout();
        auth.register("buddy", "Buddy", PW, PW);
        social.sendRequest("tester");
        assertThrows(IllegalArgumentException.class, () -> social.sendRequest("tester"), "no duplicate requests");
        auth.logout();
        auth.login("tester", PW);
        FriendRequest req = social.incoming().get(0);
        social.accept(req);
        auth.logout();
        auth.login("buddy", PW);
        List<Partner> partners = social.partners();
        assertEquals(1, partners.size());
        assertEquals(List.of("Run"), partners.get(0).getSharedHabits().stream().map(Partner.SharedHabit::name).toList());
        assertTrue(partners.get(0).getSharedHabits().get(0).doneToday());
        assertNotNull(secret);
    }

    @Test
    void achievementsPayOnce() {
        Habit h = daily("Floss", 0);
        checkIns.checkIn(h);
        assertTrue(achievements.list().stream().anyMatch(a -> a.code().equals("FIRST_CHECKIN") && a.isEarned()));
        int after = shop.balance();
        assertTrue(achievements.evaluate().isEmpty(), "nothing new to unlock");
        assertEquals(after, shop.balance());
        assertEquals(ledgerSum(), shop.balance());
    }

    @Test
    void statsQueriesFillGapsAndMatchCompletion() {
        Habit h = daily("Journal", 9);
        for (int d = 9; d >= 0; d -= 2) checkIns.checkIn(h, 1, LocalDate.now().minusDays(d), null);
        var trend = stats.trend(10);
        assertEquals(10, trend.size(), "generate_series fills days without check-ins");
        assertEquals(5, trend.values().stream().mapToInt(Integer::intValue).sum());
        assertEquals(5.0 / 9, stats.completionRate(h), 1e-9, "days 9..1 are closed (5 done); today is still open");
        // check-ins were on days 9, 7, 5, 3, 1 ago
        assertEquals(1.0, stats.completionRate(h, LocalDate.now().minusDays(3), LocalDate.now().minusDays(3)), 1e-9);
        assertEquals(0.5, stats.completionRate(h, LocalDate.now().minusDays(4), LocalDate.now().minusDays(1)), 1e-9);
    }

    @Test
    void remindersCanBeSetToggledAndRemoved() {
        Habit h = daily("Stretch", 0);
        java.time.LocalTime nine = java.time.LocalTime.of(9, 0);
        reminders.save(h, nine);
        assertEquals(nine, reminders.timeFor(h.getId()));
        assertEquals(1, reminders.list().size());
        assertTrue(reminders.list().get(0).enabled());

        reminders.setEnabled(reminders.list().get(0), false);
        assertFalse(reminders.list().get(0).enabled());
        assertNull(reminders.timeFor(h.getId()));

        reminders.save(h, null);
        assertTrue(reminders.list().isEmpty());
    }
}
