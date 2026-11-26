# HabitFlow Rubric & Requirements Map

Verified against the codebase (`mvn test`: 29/29 passing — `DatabaseIntegrationTest` 11, `ScheduleStreakTest` 9, `LogicTest` 5, `ArchitectureTest` 4).

## 1. Architecture & Organization

| Requirement | Status | Where in Codebase |
| --- | --- | --- |
| **Java OOP implementation** | Met | Java 17 (`pom.xml:11`), pure OOP domain models, controllers, DAOs, and JavaFX UI under `src/main/java/com/habitflow/`. |
| **3-tier architecture** | Met | **GUI tier:** `com.habitflow.ui` (JavaFX). **Controller tier:** `com.habitflow.controller` + `com.habitflow.controller.logic`. **Database tier:** `com.habitflow.db` (raw JDBC, only package with SQL). **Shared domain model:** `com.habitflow.model`. Enforced automatically by `src/test/java/com/habitflow/ArchitectureTest.java:30-48`. |
| **Package hierarchy & cross-package access control** | Met | 6 packages: `com.habitflow.ui`, `com.habitflow.controller`, `com.habitflow.controller.logic`, `com.habitflow.db`, `com.habitflow.model`, `com.habitflow.tools`. Cross-package boundaries are enforced with package-private (`default`) visibility: `Database.with(SqlWork)` (`db/Database.java:58`) is accessible only inside `com.habitflow.db`; `Session.start(User)` / `Session.end()` (`controller/Session.java:25-33`) and `HabitStats` (`controller/HabitStats.java:13`) are accessible only inside `com.habitflow.controller`; `Page`, `AppContext`, `Ui`, `LoginView`, `MainView`, and all 9 `*Page` classes are package-private inside `com.habitflow.ui` (only `App` is `public`). |
| **Class count (5–7, max 10)** | Exceeds guideline (note) | The full running application contains **81 `.java` files** across 6 packages (30 in `model`, 18 in `controller` + `controller.logic`, 14 in `db`, 18 in `ui`, 1 in `tools`). The design report (`report/build/make-report.js:198-209`) focuses on the **10 core design classes**: `Person`, `User`, `Habit`, `Schedule`, `PowerUp`, `BaseDao<T>`, `Database`, `CheckInController`, `ShopController`, and `StatsController`. |

## 2. Core OOP Features & Techniques

### Abstract Classes (abstract + concrete methods, inherited by subclasses)
1. **`Person`** — `src/main/java/com/habitflow/model/Person.java:4-31`
   - Abstract: `roleLabel()` (`:25`)
   - Concrete: `getId()` (`final`, `:15`), `getUsername()` (`final`, `:16`), `getDisplayName()`, `setDisplayName()` (`:19-22`), `toString()` (`:27-30`)
   - Subclasses: `User` (`model/User.java:4`), `Partner` (`model/Partner.java:6`)
2. **`Habit`** — `src/main/java/com/habitflow/model/Habit.java:9-89`
   - Abstract: `getType()` (`:23`), `isCompleted(double)` (`:26`), `formatValue(double)` (`:29`)
   - Concrete: `progress(double)` (`:32-34`), `completeValue()` (`:37-39`), getters/validating setters (`:41-85`), `toString()` (`:87-88`)
   - Subclasses: `BooleanHabit`, `CountHabit`, `DurationHabit`
3. **`DayBasedSchedule`** — `src/main/java/com/habitflow/model/DayBasedSchedule.java:9-29`
   - Abstract: `isDueDay(LocalDate, LocalDate)` (`:11`)
   - Concrete: `final isDue(...)` (`:13-16`), `outcomes(...)` (`:18-28`, Template Method)
   - Subclasses: `DailySchedule`, `WeekdaySchedule`, `EveryNDaysSchedule`
4. **`PowerUp`** — `src/main/java/com/habitflow/model/PowerUp.java:4-48`
   - Abstract: `needsHabit()` (`:24`), `apply(PowerUpContext, Habit)` (`:30`), `icon()` (`:33`)
   - Concrete: `final` getters (`:18-21`), static factory `create(...)` (`:36-44`), `toString()` (`:46-47`)
   - Subclasses: `StreakFreeze`, `StreakRepair`, `DoubleCoins`, `RestDay`
5. **`BaseDao<T>`** — `src/main/java/com/habitflow/db/BaseDao.java:20-99`
   - Abstract: `mapRow(ResultSet)` (`:23`)
   - Concrete: `queryList`, `queryOne`, `queryRaw`, `scalar`, `update`, `insert`, static helpers (`:25-98`)
   - Subclasses: 11 DAOs (`UserDao`, `HabitDao`, `CheckInDao`, `CategoryDao`, `JournalDao`, `CoinDao`, `PowerUpDao`, `AchievementDao`, `ReminderDao`, `FriendDao`, `AuditDao`)
6. **`Page`** — `src/main/java/com/habitflow/ui/Page.java:9-36`
   - Abstract: `title()` (`:25`), `build(VBox)` (`:28`)
   - Concrete: `final refresh()` (`:30-33`), `final view()` (`:35`)
   - Subclasses: 9 JavaFX pages (`TodayPage`, `HabitsPage`, `HabitDetailPage`, `StatsPage`, `JournalPage`, `AchievementsPage`, `FriendsPage`, `ShopPage`, `SettingsPage`)

### Interfaces (defined and implemented)
1. **`Schedule`** (`model/Schedule.java:11-49`) — implemented by `DayBasedSchedule` (+ 3 subclasses) and `TimesPerWeekSchedule`. Includes `default` methods (`streakUnit()`, `formatStreak(int)`) and `static` methods (`formatStreak(int, String)`, `of(ScheduleType, int)`).
2. **`PowerUpContext`** (`model/PowerUpContext.java:8`) — implemented by private inner class `ShopController.Context` (`controller/ShopController.java:101-135`).
3. **`CheckInListener`** (`controller/CheckInListener.java:9`) — implemented by `AchievementController` (`controller/AchievementController.java`).
4. **`Database.SqlWork<R>`** (`db/Database.java:25-27`, `@FunctionalInterface`) — implemented via lambdas in `BaseDao` and `Database`.
5. **`BaseDao.RowMapper<R>`** (`db/BaseDao.java:70-72`, `@FunctionalInterface`) — implemented via lambdas in DAOs (`UserDao.java:37`, etc.).

### Method Overloading & `call-by-value`
- `CheckInController.checkIn(Habit)`, `checkIn(Habit, double)`, `checkIn(Habit, double, LocalDate, String)` (`controller/CheckInController.java:35,40,45`). Demonstrates Java `call-by-value`: primitive `double value` is passed as a value copy, while `Habit habit` is passed as a copy of the object reference (reads the caller's `Habit` without being able to reassign the caller's reference).
- `StatsController.completionRate(Habit)` and `completionRate(Habit, LocalDate, LocalDate)` (`controller/StatsController.java:40,45`).
- `StrengthScore.compute(List<Double>)` and `compute(List<Double>, double)` (`controller/logic/StrengthScore.java:15,19`).
- `Database.inTransaction(Supplier<R>)` and `inTransaction(Runnable)` (`db/Database.java:69,91`).
- `Schedule.formatStreak(int)` (default) and `Schedule.formatStreak(int, String)` (static) (`model/Schedule.java:32,36`).
- Constructor overloading: `WeekdaySchedule(int mask)` and `WeekdaySchedule(DayOfWeek... days)` (`model/WeekdaySchedule.java:14,19`).

### Method Overriding
97 `@Override` sites across the codebase, including:
- `BooleanHabit`, `CountHabit`, `DurationHabit` overriding `getType()`, `isCompleted(double)`, `formatValue(double)` (`model/BooleanHabit.java:5-13`, `model/CountHabit.java:5-9`, `model/DurationHabit.java:5-11`).
- `DailySchedule`, `WeekdaySchedule`, `EveryNDaysSchedule`, `TimesPerWeekSchedule` overriding `type()`, `param()`, `isDueDay(...)`, `outcomes(...)`, `describe()`, `streakUnit()`.
- `StreakFreeze`, `StreakRepair`, `DoubleCoins`, `RestDay` overriding `needsHabit()`, `icon()`, `apply(...)`.
- `User` (`model/User.java:19-20`) and `Partner` (`model/Partner.java:21-22`) overriding `Person.roleLabel()`.
- All 11 DAOs overriding `BaseDao.mapRow(ResultSet)` (e.g., `db/HabitDao.java:19-35`, `db/UserDao.java:16-19`).
- All 9 UI screens overriding `Page.title()` and `Page.build(VBox)` (e.g., `ui/TodayPage.java:24-27`, `ui/HabitsPage.java:41-44`).

### Access Control & Modifiers (`public`, `private`, `default`, `protected`, `final`, `static`)
- **`public`**: API classes (`Person`, `User`, `Habit`, `Database`, controllers, DAOs, `App`), interfaces (`Schedule`, `PowerUpContext`, `CheckInListener`), controller/model methods, constants (`AuthController.MAX_ATTEMPTS`, `ShopController.MAX_FREEZES`, `StrengthScore.DEFAULT_HALF_LIFE`, `CoinCalculator.BASE`).
- **`private`**: Domain fields (`Person.id`, `User.coins`, `Habit.target`, `PowerUp.price`), DAO/controller fields, utility constructors (`Database`, `Session`, `HabitStats`, `StrengthScore`, `PasswordHasher`, `CoinCalculator`), helper methods (`Database.connection`, `BaseDao.prepare`, `CheckInController.cleanNote`), inner class `ShopController.Context` (`controller/ShopController.java:101`).
- **`default` (package-private)**:
  - Classes: `HabitStats` (`controller/HabitStats.java:13`), `Page` (`ui/Page.java:9`), `AppContext` (`ui/AppContext.java:6`), `Ui` (`ui/Ui.java:16`), `LoginView`, `MainView`, `HabitEditorDialog`, `HeatmapCanvas`, `Screenshots`, and all 9 `*Page` classes.
  - Methods: `Database.with(SqlWork)` (`db/Database.java:58`), `Session.start(User)` / `Session.end()` (`controller/Session.java:25,30`), `HabitStats.doneDays` / `summarize` / `summarizeAll` (`controller/HabitStats.java:17,23,38`), `ImportExportController.csv` / `parse` (`controller/ImportExportController.java:83,88`), `Page.title` / `refresh` / `view` (`ui/Page.java:25,30,35`).
  - Variables: `ImportExportController.HEADER` (`controller/ImportExportController.java:22`), `AppContext` controller fields (`ui/AppContext.java:7-15`), `Ui.STYLESHEET` / `MOODS` / `MOOD_COLORS` / `toaster` (`ui/Ui.java:17-22`).
  - Interface `default` methods: `Schedule.streakUnit()` and `Schedule.formatStreak(int)` (`model/Schedule.java:29,32`).
- **`protected`**: `Person(...)`, `PowerUp(...)`, `DayBasedSchedule.isDueDay(...)`, `BaseDao.mapRow` / `queryList` / `queryOne` / `queryRaw` / `scalar` / `update` / `insert`, `Page.ctx` / `Page.main` / `Page.build`.
- **`final`**:
  - Classes: `Database`, `Session`, `StartupController`, `HabitStats`, `StrengthScore`, `PasswordHasher`, `CoinCalculator`, `StreakCalculator`, `Correlation`, `AppContext`, `Ui`, `Screenshots`, `Seeder`, `ShopController.Context`.
  - Methods: `Person.getId()` / `getUsername()` (`model/Person.java:15-16`), `PowerUp.getCode()` / `getName()` / `getDescription()` / `getPrice()` (`model/PowerUp.java:18-21`), `DayBasedSchedule.isDue(...)` (`model/DayBasedSchedule.java:14`), `Page.refresh()` / `view()` (`ui/Page.java:30,35`).
  - Variables: `Person.id` / `username`, `PowerUp.code` / `name` / `description` / `price`, `WeekdaySchedule.mask`, `Partner.sharedHabits`, `static final` constants.
- **`static`**:
  - Variables: `Database.LOCK` / `CONFIG` / `connection`, `Session.USERS` / `LISTENERS` / `current`, `AuthController.MAX_ATTEMPTS` / `LOCK_TIME`, `PasswordHasher.ITERATIONS` / `KEY_BITS` / `RANDOM`.
  - Methods: `Database.inTransaction` / `with` / `runScript` / `checkConnection`, `Session.*`, `PowerUp.create`, `Schedule.of` / `formatStreak`, `StrengthScore.compute`, `StreakCalculator.*`, `CoinCalculator.reward`, `PasswordHasher.*`, `App.main`.

### Three Pillars of OOP
- **Encapsulation**: Private fields with validating setters (`Person.setDisplayName` at `model/Person.java:19-22`, `User.setCoins` at `model/User.java:14-17`, `Habit.setName`/`setTarget`/`setColor` at `model/Habit.java:51-78`), DB check constraints (`schema.sql:11,29,54,72,78`), transactional invariants in `ShopController.buy` (`controller/ShopController.java:41-56`), and `UserDao.Credentials` kept out of the UI tier.
- **Inheritance**: `Person` -> `User`, `Partner`; `Habit` -> `BooleanHabit`, `CountHabit`, `DurationHabit`; `DayBasedSchedule` -> `DailySchedule`, `WeekdaySchedule`, `EveryNDaysSchedule`; `PowerUp` -> `StreakFreeze`, `StreakRepair`, `DoubleCoins`, `RestDay`; `BaseDao<T>` -> 11 DAOs; `Page` -> 9 UI screens.
- **Polymorphism**: `HabitStats.summarize` (`controller/HabitStats.java:23-36`) dispatches `h.isCompleted(...)` and `h.getSchedule().outcomes(...)` to concrete subtypes; `ShopController.use` (`controller/ShopController.java:59-70`) dispatches `p.apply(new Context(id), target)`; `HabitDao.mapRow` (`db/HabitDao.java:20-35`) constructs concrete `Habit` and `Schedule` subtypes behind abstract/interface references; `MainView` (`ui/MainView.java:30-42,105-112`) manages all screens through `Page`.

## 3. Data Storage

- **Persistent storage**: PostgreSQL 16 via raw JDBC (`org.postgresql:postgresql` 42.7.4 in `pom.xml:28-31`), connection/transactions in `src/main/java/com/habitflow/db/Database.java`, plus CSV export/import in `src/main/java/com/habitflow/controller/ImportExportController.java`.
- **Tables (14 total, minimum 4 required)** — `src/main/resources/schema.sql:3-125`:
  1. `users` (`:3`)
  2. `categories` (`:15`)
  3. `habits` (`:23`)
  4. `check_ins` (`:39`)
  5. `journal_entries` (`:51`)
  6. `coin_ledger` (`:59`)
  7. `power_ups` (`:68`)
  8. `user_power_ups` (`:75`)
  9. `active_effects` (`:82`)
  10. `achievements` (`:89`)
  11. `user_achievements` (`:96`)
  12. `reminders` (`:103`)
  13. `friendships` (`:110`)
  14. `audit_log` (`:119`)

## 4. User Interface & Functionality

- **GUI with at least 4 screens (11 screens/dialogs captured in `docs/screenshots/`)**:
  1. Login / Register — `ui/LoginView.java` (`docs/screenshots/01-login.png`)
  2. Today dashboard — `ui/TodayPage.java` (`docs/screenshots/02-today.png`)
  3. Habits list — `ui/HabitsPage.java` (`docs/screenshots/03-habits.png`)
  4. Statistics & heatmaps — `ui/StatsPage.java` (`docs/screenshots/04-statistics.png`)
  5. Mood journal — `ui/JournalPage.java` (`docs/screenshots/05-journal.png`)
  6. Achievements — `ui/AchievementsPage.java` (`docs/screenshots/06-achievements.png`)
  7. Accountability partners (Friends) — `ui/FriendsPage.java` (`docs/screenshots/07-friends.png`)
  8. Power-up shop — `ui/ShopPage.java` (`docs/screenshots/08-shop.png`)
  9. Settings & activity log — `ui/SettingsPage.java` (`docs/screenshots/09-settings.png`)
  10. Habit detail & backfill — `ui/HabitDetailPage.java` (`docs/screenshots/10-habit-detail.png`)
  11. Habit editor dialog — `ui/HabitEditorDialog.java` (`docs/screenshots/11-habit-editor.png`)
- **Event handling (GUI -> Controller -> DB, including auto-generated IDs)**:
  - **Auto-generated IDs:** PostgreSQL `SERIAL PRIMARY KEY` + `INSERT ... RETURNING id` via `BaseDao.insert(...)` (`db/BaseDao.java:65-67`):
    - `+ New habit` button (`ui/TodayPage.java:36`, `ui/HabitsPage.java:50`) -> `MainView.createHabit()` (`ui/MainView.java:116-123`) -> `HabitEditorDialog` -> `HabitController.create(Habit)` (`controller/HabitController.java:55-64`) -> `HabitDao.insert(Habit)` (`db/HabitDao.java:53-58`).
    - Register button (`ui/LoginView.java`) -> `AuthController.register(...)` -> `UserDao.create(...)` (`db/UserDao.java:21-25`).
    - Category creation (`ui/HabitsPage.java:50`) -> `HabitController.addCategory(...)` (`controller/HabitController.java:91-98`) -> `CategoryDao.create(...)`.
  - **Saving & retrieving data:** Check-in buttons (`ui/TodayPage.java:113-129`) -> `CheckInController.checkIn(...)`; mood buttons (`ui/TodayPage.java:137-150`) -> `CheckInController.saveJournal(...)`; shop buy/use (`ui/ShopPage.java`) -> `ShopController.buy/use(...)`; CSV export/import (`ui/SettingsPage.java`) -> `ImportExportController`.
- **Core business functions**:
  - **Inputting records:** Account registration (`AuthController.register`), habit create/edit (`HabitController.create/update`), check-ins & backfills (`CheckInController.checkIn`), journal entries (`CheckInController.saveJournal`), categories (`HabitController.addCategory`), friend requests (`SocialController.sendRequest`), CSV import (`ImportExportController`).
  - **Searching / filtering / sorting:** `HabitsPage` (`ui/HabitsPage.java:28,37-38,58-66`) -> `HabitController.search(query, category, type, sort, includeArchived)` (`controller/HabitController.java:35-49`).
  - **Displaying details:** `HabitDetailPage` (`ui/HabitDetailPage.java`) for per-habit heatmap, check-in history, and backfill; `StatsPage` (`ui/StatsPage.java`) + `StatsController` (`controller/StatsController.java`) for overview cards, trend/weekday/category charts, 365-day heatmap, and mood correlations.
  - **User roles:** `Visitor` (unauthenticated, `ui/LoginView.java`), `Member` (`User.roleLabel()` = `"Member"`, `model/User.java:19-20`), and `Accountability partner` (`Partner.roleLabel()` = `"Accountability partner"`, `model/Partner.java:21-22`, read-only access to shared habits via `SocialController.partners()` at `controller/SocialController.java:53-65`).
