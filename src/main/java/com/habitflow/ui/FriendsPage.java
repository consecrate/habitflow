package com.habitflow.ui;

import com.habitflow.model.FriendRequest;
import com.habitflow.model.Partner;
import javafx.scene.control.TextField;
import javafx.scene.layout.*;

import java.util.List;

/** Accountability partners: requests and friends' shared habits. */
class FriendsPage extends Page {
    FriendsPage(AppContext ctx, MainView main) { super(ctx, main); }

    @Override String title() { return "Friends"; }

    @Override
    protected void build(VBox page) {
        TextField username = new TextField();
        username.setPromptText("Enter friend's username");
        username.setPrefWidth(260);
        page.getChildren().add(Ui.card(
                Ui.col(2, Ui.label("Add an accountability partner", "h3"),
                        Ui.label("They will see only the habits you mark as shared, and you will see theirs.", "muted", "small")),
                Ui.row(8, username, Ui.button("Send request", () -> {
                    ctx.social.sendRequest(username.getText());
                    Ui.toast("Request sent to @" + username.getText().trim().toLowerCase());
                    refresh();
                }, "primary"))));

        List<FriendRequest> incoming = ctx.social.incoming();
        if (!incoming.isEmpty()) {
            VBox box = Ui.card(Ui.row(8, Ui.label("Requests for you", "h3"), Ui.pill(String.valueOf(incoming.size()), "pill-good")));
            for (int i = 0; i < incoming.size(); i++) {
                FriendRequest r = incoming.get(i);
                if (i > 0) box.getChildren().add(Ui.divider());
                box.getChildren().add(Ui.row(10, Ui.avatar(r.displayName()),
                        Ui.col(1, Ui.label(r.displayName(), "h3"), Ui.label("@" + r.username(), "muted", "small")),
                        Ui.spacer(),
                        Ui.button("Accept", () -> { ctx.social.accept(r); refresh(); }, "primary"),
                        Ui.button("Decline", () -> { ctx.social.decline(r); refresh(); })));
            }
            page.getChildren().add(box);
        }

        List<FriendRequest> outgoing = ctx.social.outgoing();
        if (!outgoing.isEmpty()) {
            VBox box = Ui.card(Ui.label("Sent requests", "h3"));
            for (int i = 0; i < outgoing.size(); i++) {
                FriendRequest r = outgoing.get(i);
                if (i > 0) box.getChildren().add(Ui.divider());
                box.getChildren().add(Ui.row(10, Ui.avatar(r.displayName()),
                        Ui.col(1, Ui.label(r.displayName(), "h3"), Ui.label("@" + r.username(), "muted", "small")),
                        Ui.spacer(),
                        Ui.button("Cancel", () -> { ctx.social.decline(r); refresh(); })));
            }
            page.getChildren().add(box);
        }

        List<Partner> partners = ctx.social.partners();
        page.getChildren().add(Ui.row(8, Ui.label("Your partners", "h2"), Ui.pill(String.valueOf(partners.size()), "pill-muted")));
        if (partners.isEmpty()) {
            page.getChildren().add(Ui.card(Ui.label("No partners yet. Habits are easier with someone watching.", "muted")));
            return;
        }

        GridPane grid = Ui.grid(2);

        for (int i = 0; i < partners.size(); i++) {
            Partner p = partners.get(i);
            HBox header = Ui.row(10, Ui.avatar(p.getDisplayName()),
                    Ui.col(1, Ui.row(6, Ui.label(p.getDisplayName(), "h3"), Ui.label("@" + p.getUsername(), "muted", "small")),
                            Ui.label(p.roleLabel(), "muted", "small")),
                    Ui.spacer(),
                    Ui.button("Remove", () -> {
                        if (Ui.confirm("Stop being partners with " + p.getDisplayName() + "?")) {
                            ctx.social.remove(p);
                            refresh();
                        }
                    }, "danger", "compact"));
            VBox card = Ui.card(header);
            if (p.getSharedHabits().isEmpty()) {
                card.getChildren().add(Ui.label("No shared habits yet.", "muted", "small"));
            } else {
                card.getChildren().add(Ui.divider());
                for (Partner.SharedHabit h : p.getSharedHabits()) {
                    card.getChildren().add(Ui.row(10,
                            Ui.dot(h.color(), 5.5),
                            Ui.label(h.name(), "field-label"),
                            Ui.spacer(),
                            Ui.label(h.formatStreak(), "h3"),
                            Ui.label("str " + h.strength(), "muted", "small"),
                            Ui.pill(h.doneToday() ? "✓ Done" : "Pending", h.doneToday() ? "pill-good" : "pill-muted")));
                }
            }
            card.setMaxWidth(Double.MAX_VALUE);
            grid.add(card, i % 2, i / 2);
        }
        page.getChildren().add(grid);
    }
}
