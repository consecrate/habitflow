# HabitFlow

A habit tracker desktop app for Java OOP Assignment 3: JavaFX GUI → controllers → hand-written SQL on PostgreSQL (3-tier MVC, no ORM, no Spring).

## Run (macOS)
```bash
brew install openjdk@17 maven postgresql@16
brew services start postgresql@16
createdb habitflow && createdb habitflow_test
mvn -q compile exec:java   # demo data: log in as demo / demo1234 (also sam, kai)
mvn javafx:run             # start the app
mvn test                   # 27 tests (uses habitflow_test, never the real DB)
```
DB connection: `src/main/resources/db.properties`, or `-Dhabitflow.db.url=… -Dhabitflow.db.user=… -Dhabitflow.db.password=…`. A blank user means your OS username (Homebrew default).

## Features
Secure login with lockout · 3 habit types · 4 schedule types · Today dashboard · schedule-aware streaks · habit strength · year heatmaps · SQL-powered statistics · mood journal with correlation insights · achievements · reminders · accountability partners · backfill with activity log · search/filter/sort/archive · CSV export/import (all-or-nothing) · coins · power-up shop (Streak Freeze, Streak Repair, Double Coins, Rest Day).

## Layout
- `src/main/java/com/habitflow/ui`: GUI tier (JavaFX)
- `src/main/java/com/habitflow/controller`: controller tier (+ `logic/` pure algorithms)
- `src/main/java/com/habitflow/db`: database tier, the only place with SQL
- `src/main/java/com/habitflow/model`: domain classes shared by all tiers
- `src/main/resources/schema.sql`: 14 tables
- `docs/diagrams`: PlantUML sources + PNGs · `docs/screenshots`: GUI figures (`mvn javafx:run -Djavafx.args=--screenshots`)
- `report/HabitFlow_Report.docx`: report draft (rebuild: `cd report/build && npm install && node make-report.js`)
