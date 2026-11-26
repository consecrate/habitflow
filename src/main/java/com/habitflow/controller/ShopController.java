package com.habitflow.controller;

import com.habitflow.controller.logic.StreakCalculator;
import com.habitflow.db.*;
import com.habitflow.model.*;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/** Coin balance, buying power-ups, using them, and automatic streak freezes. */
public class ShopController {
    public static final int MAX_FREEZES = 3;

    private final PowerUpDao powerUps = new PowerUpDao();
    private final UserDao users = new UserDao();
    private final CoinDao coins = new CoinDao();
    private final HabitDao habits = new HabitDao();
    private final CheckInDao checkIns = new CheckInDao();
    private final AuditDao audit = new AuditDao();
    private final AchievementController achievements;

    public ShopController(AchievementController achievements) {
        this.achievements = achievements;
    }

    public List<PowerUp> catalog() { return powerUps.catalog(); }

    public List<InventoryItem> inventory() { return powerUps.inventory(Session.require().getId()); }

    public int balance() { return users.coins(Session.require().getId()); }

    public List<CoinTransaction> ledger(int limit) { return coins.recent(Session.require().getId(), limit); }

    public Optional<LocalDateTime> doubleCoinsUntil() {
        return powerUps.activeUntil(Session.require().getId(), DoubleCoins.CODE);
    }

    /** Buys one item. Balance check, payment and delivery happen in one transaction. */
    public void buy(PowerUp p) {
        int id = Session.require().getId();
        Database.inTransaction(() -> {
            if (p.getCode().equals(StreakFreeze.CODE) && powerUps.quantity(id, p.getCode()) >= MAX_FREEZES) {
                throw new IllegalStateException("You can hold at most " + MAX_FREEZES + " streak freezes.");
            }
            if (!users.addCoins(id, -p.getPrice())) {
                throw new IllegalStateException("Not enough coins: " + p.getName() + " costs " + p.getPrice() + ", you have " + users.coins(id) + ".");
            }
            coins.log(id, -p.getPrice(), "Bought " + p.getName());
            powerUps.addQuantity(id, p.getCode(), 1);
            audit.log(id, "PURCHASE", p.getName() + " for " + p.getPrice() + " coins");
        });
        Session.refresh();
        achievements.evaluate();
    }

    /** Uses one owned item. If it would have no effect, nothing is consumed. */
    public String use(PowerUp p, Habit target) {
        int id = Session.require().getId();
        if (p.needsHabit() && target == null) throw new IllegalArgumentException("Pick a habit to use " + p.getName() + " on.");
        String message = Database.inTransaction(() -> {
            if (!powerUps.addQuantity(id, p.getCode(), -1)) throw new IllegalStateException("You don't own a " + p.getName() + ".");
            String msg = p.apply(new Context(id), target);
            audit.log(id, "POWER_UP", msg);
            return msg;
        });
        Session.refresh();
        return message;
    }

    /**
     * Run at login: for each habit that had a streak going, spend owned Streak Freezes on due days
     * missed in the last 3 days. Returns one message per day saved.
     */
    public List<String> autoApplyFreezes() {
        int id = Session.require().getId();
        Context ctx = new Context(id);
        List<String> saved = new ArrayList<>();
        Database.inTransaction(() -> {
            for (Habit h : habits.list(id, false)) {
                List<LocalDate> missed = ctx.missedDueDays(h, 3);
                if (missed.isEmpty()) continue;
                Set<LocalDate> done = ctx.done(h);
                LocalDate before = missed.get(0).minusDays(1);
                if (before.isBefore(h.getCreatedOn())) continue;
                if (StreakCalculator.current(h.getSchedule().outcomes(h.getCreatedOn(), before, done)) == 0) continue;
                for (LocalDate day : missed) {
                    if (!powerUps.addQuantity(id, StreakFreeze.CODE, -1)) return;
                    ctx.protectDays(h, List.of(day));
                    String msg = "Streak Freeze saved " + h.getName() + " on " + day;
                    audit.log(id, "AUTO_FREEZE", msg);
                    saved.add(msg);
                }
            }
        });
        return saved;
    }

    /** The only door power-ups have into the user's data. */
    private final class Context implements PowerUpContext {
        private final int userId;

        Context(int userId) { this.userId = userId; }

        Set<LocalDate> done(Habit h) { return HabitStats.doneDays(h, checkIns.forHabit(h.getId())); }

        @Override public LocalDate today() { return LocalDate.now(); }

        @Override
        public List<LocalDate> missedDueDays(Habit h, int daysBack) {
            if (!(h.getSchedule() instanceof DayBasedSchedule)) return List.of(); // weekly targets have no single missed day
            Set<LocalDate> done = done(h);
            List<LocalDate> out = new ArrayList<>();
            for (LocalDate d = today().minusDays(daysBack); d.isBefore(today()); d = d.plusDays(1)) {
                if (h.getSchedule().isDue(d, h.getCreatedOn(), done) && !done.contains(d)) out.add(d);
            }
            return out;
        }

        @Override public boolean isDoneOn(Habit h, LocalDate day) { return done(h).contains(day); }

        @Override
        public void protectDays(Habit h, List<LocalDate> days) {
            for (LocalDate d : days) {
                Optional<CheckIn> prev = checkIns.find(h.getId(), d);
                checkIns.upsert(new CheckIn(h.getId(), d, prev.map(CheckIn::value).orElse(0.0),
                        prev.map(CheckIn::note).orElse("Protected by power-up"), true, prev.map(CheckIn::coinsAwarded).orElse(0)));
            }
        }

        @Override public boolean isEffectActive(String code) { return powerUps.activeUntil(userId, code).isPresent(); }

        @Override public void activateEffect(String code, Duration length) { powerUps.addEffect(userId, code, LocalDateTime.now().plus(length)); }
    }
}
