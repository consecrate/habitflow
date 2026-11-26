package com.habitflow.ui;

import com.habitflow.controller.Session;
import com.habitflow.model.*;
import javafx.scene.control.ButtonType;
import javafx.scene.control.ChoiceDialog;
import javafx.scene.control.Label;
import javafx.scene.layout.*;

import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/** Spend coins on power-ups, use them, and see where every coin came from. */
class ShopPage extends Page {
    ShopPage(AppContext ctx, MainView main) { super(ctx, main); }

    @Override String title() { return "Shop"; }

    @Override
    protected void build(VBox page) {
        DateTimeFormatter f = DateTimeFormatter.ofPattern("d MMM HH:mm", Locale.ENGLISH);
        HBox balanceTop = Ui.row(12,
                Ui.label("Your balance", "h3"),
                Ui.coins(Session.require().getCoins()),
                Ui.spacer());
        ctx.shop.doubleCoinsUntil().ifPresent(t ->
                balanceTop.getChildren().add(Ui.pill("Double Coins until " + t.format(f), "pill-gold")));
        page.getChildren().add(Ui.card(balanceTop,
                Ui.label("Earn 10 coins per habit completed today, up to 20 with a 30-day streak. Achievements pay bonus coins.", "muted", "small")));

        Map<String, Integer> owned = ctx.shop.inventory().stream().collect(Collectors.toMap(i -> i.powerUp().getCode(), InventoryItem::quantity));
        List<PowerUp> catalog = ctx.shop.catalog();
        GridPane grid = Ui.grid(2);

        for (int i = 0; i < catalog.size(); i++) {
            PowerUp p = catalog.get(i);
            int qty = owned.getOrDefault(p.getCode(), 0);
            HBox actions = Ui.row(8, Ui.coins(p.getPrice()), Ui.spacer());
            if (qty > 0) actions.getChildren().add(Ui.button("Use", () -> use(p)));
            actions.getChildren().add(Ui.button("Buy", () -> {
                ctx.shop.buy(p);
                Ui.toast("Bought " + p.getName() + " for " + p.getPrice() + " coins");
                refresh();
            }, "primary"));

            VBox card = Ui.card(
                    Ui.row(10, Ui.iconBadge(p.icon()), Ui.spacer(),
                            Ui.pill("Owned: " + qty, qty > 0 ? "pill-good" : "pill-muted")),
                    Ui.col(4, Ui.label(p.getName(), "h3"), Ui.label(p.getDescription(), "muted", "small")),
                    Ui.vspacer(),
                    Ui.divider(),
                    actions);
            card.setMinHeight(196);
            card.setMaxWidth(Double.MAX_VALUE);
            grid.add(card, i % 2, i / 2);
        }
        page.getChildren().addAll(Ui.label("Power-ups", "h2"), grid);

        VBox ledger = Ui.card(Ui.label("Coin history", "h3"));
        List<CoinTransaction> tx = ctx.shop.ledger(15);
        if (tx.isEmpty()) ledger.getChildren().add(Ui.label("No coins yet. Complete a habit today!", "muted"));
        for (int i = 0; i < tx.size(); i++) {
            CoinTransaction t = tx.get(i);
            if (i > 0) ledger.getChildren().add(Ui.divider());
            Label time = Ui.label(t.time().format(f), "muted", "small");
            time.setMinWidth(100);
            ledger.getChildren().add(Ui.row(12, time, Ui.label(t.reason()), Ui.spacer(),
                    Ui.label((t.delta() > 0 ? "+" : "") + t.delta(), t.delta() > 0 ? "good" : "bad")));
        }
        page.getChildren().add(ledger);
    }

    private void use(PowerUp p) {
        Habit target = null;
        if (p.needsHabit()) {
            List<Habit> habits = ctx.habits.list();
            if (habits.isEmpty()) throw new IllegalStateException("Create a habit first.");
            ChoiceDialog<Habit> d = new ChoiceDialog<>(habits.get(0), habits);
            d.setTitle(p.getName());
            d.setHeaderText("Use " + p.getName() + " on which habit?");
            Ui.styleDialog(d.getDialogPane(), ButtonType.OK);
            target = d.showAndWait().orElse(null);
            if (target == null) return;
        }
        Ui.toast(ctx.shop.use(p, target));
        refresh();
    }
}
