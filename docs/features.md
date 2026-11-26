# HabitFlow Overview: Features and Tech Stack

HabitFlow is a desktop habit-tracking application. This guide explains what the app does, how each feature works from a user's perspective, and the technology it runs on. Authentication is intentionally omitted.

## Features

### 1. Flexible Habits, Schedules, and Categories
HabitFlow lets you track habits in three ways depending on what you are measuring:
- **Yes/No (Boolean) habits** track whether you did something that day, like taking vitamins or making your bed.
- **Count habits** track a numeric target, like drinking 8 glasses of water or reading 20 pages.
- **Duration habits** track time spent in minutes, like meditating for 15 minutes or exercising for 45 minutes.

Each habit uses one of four schedules:
- **Daily** means the habit is due every day.
- **Specific weekdays** means the habit is due only on chosen days of the week, such as Monday, Wednesday, and Friday.
- **Times per week** sets a weekly goal (for example, 3 times a week) rather than fixed days.
- **Every N days** repeats on a rolling interval, such as every 2 or 3 days.

You can organize habits into custom color-coded categories (up to 30 characters per name). On the Habits page, you can search by name, filter by category or habit type, sort by name, current streak, strength, or creation date, and archive habits you want to pause without losing their history. Creating, editing, archiving, restoring, and deleting habits are all recorded in an activity log.

### 2. Today Dashboard, Check-Ins, and Backfilling
The Today dashboard shows the habits due today so you can log progress in one place. For a yes/no habit, a single click marks it complete. For count and duration habits, you enter your current number or minutes and the app tracks partial progress toward the target.

If you forget to log a past day, you can backfill any date from the day the habit was created up to today, optionally adding a note of up to 200 characters. Future dates are blocked. Whenever you edit a past day, the change (old value to new value) is written to your activity log. You can also undo a check-in to clear a day completely.

### 3. Schedule-Aware Streaks and Habit Strength
Streaks follow each habit's actual schedule rather than assuming every habit is daily. Off-days on a weekday or interval schedule do not break your streak, and weekly-target habits measure streaks in consecutive completed weeks instead of days. Both your current streak and longest streak are tracked.

Alongside streaks, HabitFlow computes a **Habit Strength** score from 0 to 100 using an exponential moving average with a 13-period half-life. Consistency builds the score steadily, while a single missed day after a long run only reduces it by a few points instead of resetting your progress to zero.

### 4. Statistics and Year-Long Heatmaps
The Statistics page turns your check-in history into SQL-backed summaries and charts:
- **Overview metrics** show active habits, how many are due and done today, total completed check-ins, best current streak, and average habit strength.
- **Completion rates** calculate how often a habit was met over its lifetime or within a chosen date range.
- **Trends and breakdowns** display daily completion trends, completions by day of the week, and completions by category over a selected window of days.
- **365-day heatmaps** visualize the past year as a color-intensity grid. Viewing one habit shows daily progress toward its target (with protected days shown at full intensity); viewing all habits shows the share of active habits completed each day.

### 5. Mood Journal and Correlation Insights
Each day, you can log a mood rating from 1 to 5 along with an optional journal note (up to 500 characters). Future dates cannot be journaled.

Once you have enough history for a habit (at least 5 due days where you completed it and 5 due days where you skipped it, all with mood entries), HabitFlow calculates the Pearson correlation between doing that habit and your mood. It surfaces plain-language insights comparing your average mood on days you completed the habit versus days you skipped it, sorted by the strongest relationship first.

### 6. Coins and the Power-Up Shop
Completing a habit on the current day earns coins. The base reward is 10 coins and scales linearly up to 20 coins at a 30-period streak. Backfilling past days or importing history does not award coins, and undoing today's check-in refunds the coins earned from it. Every credit and debit is recorded in a coin transaction ledger.

You can spend coins in the Shop on four power-ups, with purchases and usage handled atomically in database transactions:
- **Streak Freeze (50 coins, max 3 held):** Protects a missed due day so your streak stays intact. You can use one manually for yesterday, and the app also applies owned freezes automatically when you sign in to cover missed due days from the last 3 days on active streaks.
- **Streak Repair (120 coins):** Protects all missed due days from the last 48 hours for a single habit to restore its streak.
- **Double Coins (80 coins):** Doubles all check-in coin rewards for 24 hours. It cannot be stacked while already active.
- **Rest Day (60 coins):** Marks today as protected for one habit so you can take the day off without breaking your streak.

### 7. Achievements
HabitFlow includes 11 milestone badges that unlock automatically whenever you complete check-ins, create habits, write journal entries, add friends, or buy power-ups:
- **First Step** (10 coins): Complete your first check-in.
- **One Week Strong** (30 coins), **Monthly Master** (100 coins), and **Centurion** (300 coins): Reach a 7-day, 30-day, or 100-day streak on any daily/day-based habit.
- **Hundred Club** (50 coins) and **Thousand Club** (250 coins): Complete 100 or 1,000 total check-ins.
- **Perfect Day** (20 coins): Complete every habit due today.
- **Collector** (20 coins): Track 5 active habits at once.
- **Better Together** (25 coins): Connect with your first accountability partner.
- **Shopper** (10 coins): Buy your first power-up.
- **Reflective** (30 coins): Write 7 mood journal entries.

Each achievement pays its coin reward once and triggers a toast notification in the app window.

### 8. Accountability Partners (Friends)
You can connect with other users by sending a friend request using their username, and manage incoming or outgoing requests by accepting, declining, or removing partners.

Privacy is opt-in per habit. Partners only see habits you explicitly mark as shared, and the view is read-only. For each shared habit, partners can see the habit name, color, current streak, strength score, and whether it is done today.

### 9. Per-Habit Reminders
You can attach a daily reminder time to any habit and toggle it on or off. While HabitFlow is open, a lightweight background daemon thread checks your enabled reminders every 20 seconds. When a reminder time passes for a habit that is due today and not yet completed, the app displays an in-app toast notification.

### 10. CSV Export and Import
HabitFlow lets you back up your check-in history to a UTF-8 CSV file with five columns: `habit,date,value,note,protected`.

Importing a CSV file loads rows back into existing habits and runs inside a single all-or-nothing database transaction. The importer validates the header, field count, habit name, date format (rejecting future dates), and non-negative numeric values. If any row is invalid, the entire import rolls back and reports the exact line number that failed. Imported rows never grant new coins.

---

## Tech Stack

HabitFlow is built as a standalone desktop application using a **3-tier MVC architecture** (GUI tier, controller tier, and database tier) with no web framework and no ORM.

- **Java 17:** Core language for the entire application, including pure domain models (`model/`) and pure calculation modules (`controller/logic/`) for streaks, strength scores, coin rewards, and Pearson correlation.
- **JavaFX 21.0.5 (`javafx-controls`, `javafx-swing`):** Renders the desktop interface, sidebar navigation, dialogs, charts, custom canvas heatmaps, CSS styling, and toast notifications. The UI layer talks only to controllers through a central `AppContext` and never runs SQL directly.
- **PostgreSQL (targets PostgreSQL 16):** Stores all application data across 14 normalized tables defined in `src/main/resources/schema.sql` (including habits, schedules, categories, check-ins, journal entries, power-ups, inventory, coin transactions, achievements, friends, reminders, and audit logs).
- **Raw JDBC (`org.postgresql:postgresql` 42.7.4):** All database queries are hand-written SQL inside DAO classes under `db/`. A single shared JDBC connection in `Database.java` is guarded by a lock so the UI thread and the background reminder thread never interleave SQL statements, and multi-step operations (like purchases, check-ins, and CSV imports) run in explicit transactions.
- **Apache Maven:** Manages builds, dependencies, running the JavaFX app (`javafx-maven-plugin` 0.0.8), seeding demo data (`exec-maven-plugin` 3.5.0), and executing tests (`maven-surefire-plugin` 3.5.2).
- **JUnit 5 (`junit-jupiter` 5.11.3):** Runs automated tests against a dedicated `habitflow_test` PostgreSQL database so test runs never touch the main application database.
