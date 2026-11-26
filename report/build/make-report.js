// Builds report/HabitFlow_Report.docx following the course's report guideline.
// Run from report/build:  node make-report.js
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, HeadingLevel,
  AlignmentType, WidthType, ShadingType, BorderStyle, LevelFormat, PageBreak, TableOfContents,
  Footer, PageNumber,
} = require("docx");

const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "src/main/java/com/habitflow");
const FONT = "Times New Roman";
const SIZE = 26; // 13 pt
const CONTENT_W = 9026; // A4 minus 1" margins, in DXA

// ---------- helpers ----------
const figures = [], tables = [];

function runs(text, base = {}) {
  // **bold** and `code` inline markup
  const out = [];
  text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).forEach((part) => {
    if (!part) return;
    if (part.startsWith("**")) out.push(new TextRun({ text: part.slice(2, -2), bold: true, font: FONT, size: SIZE, ...base }));
    else if (part.startsWith("`")) out.push(new TextRun({ text: part.slice(1, -1), font: "Courier New", size: 22, ...base }));
    else out.push(new TextRun({ text: part, font: FONT, size: SIZE, ...base }));
  });
  return out;
}
const P = (text, opts = {}) => new Paragraph({ children: runs(text), alignment: AlignmentType.JUSTIFIED, spacing: { after: 120, line: 300 }, ...opts });
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t, font: FONT })] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t, font: FONT })] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: t, font: FONT })] });
const B = (text, level = 0) => new Paragraph({ children: runs(text), numbering: { reference: "bullets", level }, alignment: AlignmentType.JUSTIFIED, spacing: { after: 60 } });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

function caption(text) {
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 200 }, children: [new TextRun({ text, italics: true, font: FONT, size: 24 })] });
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function figure(file, title, maxWidthPx = 600) {
  const n = figures.length + 1;
  const cap = `Figure ${n}: ${title}`;
  figures.push(cap);
  const { w, h } = pngSize(file);
  const width = Math.min(maxWidthPx, w);
  const height = Math.round((h * width) / w);
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, children: [new ImageRun({ type: "png", data: fs.readFileSync(file), transformation: { width, height } })] }),
    caption(cap),
  ];
}

const border = { style: BorderStyle.SINGLE, size: 4, color: "999999" };
const borders = { top: border, bottom: border, left: border, right: border };

function cell(content, width, header = false) {
  const lines = Array.isArray(content) ? content : [content];
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading: header ? { fill: "DCEBE2", type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: lines.map((l) => new Paragraph({ children: runs(String(l), { size: 22, bold: header || undefined }) })),
  });
}

/** widths are relative weights; they are scaled to the content width. */
function table(title, headers, rows, weights, numbered = true) {
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => Math.floor((w / total) * CONTENT_W));
  widths[widths.length - 1] += CONTENT_W - widths.reduce((a, b) => a + b, 0);
  const cap = numbered ? `Table ${tables.length + 1}: ${title}` : title;
  if (numbered) tables.push(cap);
  return [
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths,
      rows: [
        new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, widths[i], true)) }),
        ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, widths[i])) })),
      ],
    }),
    caption(cap),
  ];
}

/** Code block in a shaded single-cell table, keeping indentation. */
function code(lines, file) {
  const paras = lines.map((l) => new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: l.replace(/\t/g, "    ") || " ", font: "Courier New", size: 18 })] }));
  const out = [new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [CONTENT_W],
    rows: [new TableRow({ children: [new TableCell({ borders, width: { size: CONTENT_W, type: WidthType.DXA }, shading: { fill: "F4F6F8", type: ShadingType.CLEAR, color: "auto" }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: paras })] })],
  })];
  if (file) out.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: "Source: " + file, italics: true, font: FONT, size: 20 })] }));
  return out;
}

/** Pulls a block from a real source file: from the line containing `start` until its braces close. */
function snippet(rel, start, { maxLines = 60, withDocLines = 0 } = {}) {
  const lines = fs.readFileSync(path.join(SRC, rel), "utf8").split("\n");
  let i = lines.findIndex((l) => l.includes(start));
  if (i < 0) throw new Error(`"${start}" not found in ${rel}`);
  const from = Math.max(0, i - withDocLines);
  let depth = 0, seen = false, end = i;
  for (let j = i; j < lines.length; j++) {
    for (const ch of lines[j]) { if (ch === "{") { depth++; seen = true; } if (ch === "}") depth--; }
    end = j;
    if ((seen && depth <= 0) || (!seen && lines[j].trim().endsWith(";"))) break;
  }
  let block = lines.slice(from, end + 1);
  const indent = Math.min(...block.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  block = block.map((l) => l.slice(indent));
  if (block.length > maxLines) block = [...block.slice(0, maxLines), "    // ... (shortened)"];
  return code(block, "src/main/java/com/habitflow/" + rel);
}

const shot = (n) => path.join(ROOT, "docs/screenshots", n);
const diag = (n) => path.join(ROOT, "docs/diagrams", n);

// ---------- content ----------
const body = [];
const add = (...xs) => xs.flat().forEach((x) => body.push(x));

// I. INTRODUCTION
add(H1("I. INTRODUCTION"));
add(P("Many people try to build better habits such as drinking enough water, exercising, reading or meditating, but most give up within a few weeks. A paper checklist does not show progress over time, does not forgive one bad day, and gives no reason to come back tomorrow. As the customer of this project, we ordered a desktop application called **HabitFlow** that helps a person track daily habits honestly, see real progress in numbers and charts, and stay motivated through rewards and friends."));
add(P("In this project we investigate the business functions of a personal habit tracking system and provide a desktop application (JavaFX) backed by a PostgreSQL database. The customer's requirements are:"));
[
  "A user can create an account and log in securely. Passwords must never be stored in plain text and repeated wrong passwords must lock the account for a short time.",
  "A habit can be measured in three ways: done / not done (e.g. Meditate), a count (e.g. 8 glasses of water) or a duration in minutes (e.g. Read 30 minutes).",
  "A habit can follow a flexible schedule: every day, chosen weekdays, X times per week, or every N days. Days on which a habit is not due must never break a streak.",
  "The Today screen shows only the habits due today and lets the user check in with one click.",
  "The application computes current and longest streaks, a habit strength score (0-100) and the completion rate for every habit.",
  "The user can see a year heatmap per habit and for all habits, trend charts, a weekday chart and a category chart.",
  "The user can keep a mood journal; the system finds which habits go together with a better mood.",
  "The user earns coins for completing habits and can spend them in a shop on power-ups (Streak Freeze, Streak Repair, Double Coins, Rest Day).",
  "Achievements (badges) unlock automatically and pay bonus coins once.",
  "Reminders show inside the application at a chosen time if the habit is still not done.",
  "Users can become accountability partners and see each other's shared habits only.",
  "The user can fill in forgotten past days; every such change is written to an activity log.",
  "Habits can be searched, filtered, sorted, archived and restored.",
  "All check-ins can be exported to CSV and imported back; a bad file must not change any data.",
].forEach((t) => add(B(t)));
add(P("Table 1 lists the user roles and Figure 1 shows the use cases. There is no administrator role: every account manages only its own data, and partners can only read what the other person chose to share."));
add(table("User roles", ["No", "Role", "Description", "Main use cases"], [
  ["1", "Visitor", "A person who is not logged in.", "Register an account, log in."],
  ["2", "Member", "A logged-in user who owns habits, check-ins, a journal, coins and power-ups.", "Manage habits, check in, backfill, view statistics, journal, shop, reminders, CSV backup, send friend requests."],
  ["3", "Accountability partner", "Another member who accepted a friend request.", "Accept / decline requests, view the shared habits (streak, strength, done today) of the friend."],
], [1, 3, 6, 8]));
add(figure(diag("usecase.png"), "Use case diagram of HabitFlow", 560));
add(P("In this project we use Java object-oriented programming to design the classes and apply encapsulation, inheritance, abstraction, polymorphism and interfaces. The project follows the MVC 3-tier model required by the assignment: the GUI tier (JavaFX) calls only the controller tier, the controller tier calls only the database tier, and only the database tier contains SQL. No ORM and no Spring framework are used: every query is written by hand and executed with JDBC PreparedStatements."));

// II. CLASS ANALYSIS
add(pageBreak(), H1("II. CLASS ANALYSIS"));
add(H2("1. Objects"));
add(P("We first list concrete objects from the problem domain with their state and behaviour (Table 2). The values come from the demo data of the running application."));
add(table("List of objects", ["No", "Object name", "State", "Behaviours"], [
  ["1", "User Linh Tran", "username demo, display name Linh Tran, 2,413 coins", "logs in, earns coins, spends coins, changes password"],
  ["2", "Partner Sam Carter", "username sam, shares Cycling and Practice guitar", "accepts requests, shows shared habits"],
  ["3", "Habit Morning run", "Yes / No, Mon-Wed-Fri, Health, green, shared", "is completed by value 1, reports progress"],
  ["4", "Habit Drink water", "Count, target 8, unit glasses, every day", "is completed when value ≥ 8, formats \"5 / 8 glasses\""],
  ["5", "Habit Read", "Duration, target 30 minutes, every day", "is completed when minutes ≥ 30, formats \"25m / 30m\""],
  ["6", "Schedule Mon, Wed, Fri", "weekday mask 0010101", "says if a day is due, produces outcomes for streaks"],
  ["7", "Schedule 3× per week", "times = 3", "is due until the weekly target is met, counts weeks"],
  ["8", "Check-in Drink water 13 Nov", "value 5, not frozen, 0 coins", "is stored, is edited, is undone"],
  ["9", "Power-up Streak Freeze", "code STREAK_FREEZE, price 50 coins", "protects a missed day when applied"],
  ["10", "Power-up Double Coins", "price 80 coins, lasts 24 hours", "activates a timed effect"],
  ["11", "Achievement One Week Strong", "reward 30 coins, earned 13 Nov", "unlocks once when a 7-day streak exists"],
  ["12", "Journal entry 12 Nov", "mood 4 (Good), note \"Slept well.\"", "is saved, is correlated with habits"],
  ["13", "Reminder Drink water", "10:00, enabled", "fires a notification if the habit is not done"],
], [1, 4, 6, 6]));
add(P("Objects with the same kind of state and behaviour are grouped: User and Partner are both people with an id, a username and a display name; Morning run, Drink water and Read are all habits that differ only in how a value is interpreted; the two schedules both answer \"is this day due?\"; Streak Freeze and Double Coins are both items with a name and price but a different effect when used. These groups become the class hierarchies below."));
add(H2("2. Classes"));
add(table("Objects and their classes", ["No", "Group of objects", "Class", "Kind"], [
  ["1", "Linh Tran, Sam Carter", "Person → User, Partner", "abstract class + 2 subclasses"],
  ["2", "Morning run, Drink water, Read", "Habit → BooleanHabit, CountHabit, DurationHabit", "abstract class + 3 subclasses"],
  ["3", "Every day, Mon-Wed-Fri, every 3 days, 3× per week", "Schedule → DayBasedSchedule → DailySchedule, WeekdaySchedule, EveryNDaysSchedule; TimesPerWeekSchedule", "interface, abstract class, 4 classes"],
  ["4", "Streak Freeze, Streak Repair, Double Coins, Rest Day", "PowerUp → StreakFreeze, StreakRepair, DoubleCoins, RestDay", "abstract class + 4 subclasses"],
  ["5", "Check-ins, journal entries, achievements, reminders, categories, coin transactions", "CheckIn, JournalEntry, Achievement, Reminder, Category, CoinTransaction (records)", "immutable data classes"],
  ["6", "Data access for each table", "BaseDao<T> → UserDao, HabitDao, CheckInDao, … (11 DAOs)", "generic abstract class"],
  ["7", "Business rules", "AuthController, HabitController, CheckInController, StatsController, ShopController, …", "controller classes"],
  ["8", "Screens", "Page → TodayPage, HabitsPage, StatsPage, …", "abstract class + 9 pages"],
], [1, 5, 8, 4]));
add(P("Inheritance is used where objects share state and differ in behaviour. `Person`, `Habit`, `PowerUp`, `DayBasedSchedule`, `BaseDao<T>` and `Page` are abstract because an object of these types alone makes no sense: there is no \"habit\" that is neither Yes/No, count nor duration. `Schedule` is an interface because the weekly schedule shares no state with the day-based ones, only the contract. Figure 2 shows the inheritance at analysis level, without data types or parameters."));
add(figure(diag("class-analysis.png"), "Inheritance among classes (analysis level)", 600));

// III. CLASS DESIGN
add(pageBreak(), H1("III. CLASS DESIGN"));
add(H2("1. Classes"));
add(P("Figure 3 shows the relationships among the core classes: inheritance, interface realisation, the aggregation between Habit and Schedule, the Observer link between CheckInController and CheckInListener, and the dependencies from controllers to DAOs."));
add(figure(diag("class-design.png"), "Class diagram of HabitFlow", 620));
add(P("Table 4 gives the details of the most important classes. All instance variables are private (encapsulation); constructors and setters validate their input, so an object can never hold an invalid state such as a negative coin balance or an empty habit name."));
add(table("Details of classes", ["No", "Class", "Instance variables", "Methods", "Description"], [
  ["1", "Person (abstract)", ["- final int id", "- final String username", "- String displayName"], ["+ final getId(), getUsername()", "+ setDisplayName(String): rejects blank", "+ abstract roleLabel()"], "Common identity of the logged-in user and of a friend. id and username are final because they never change."],
  ["2", "User", ["- int coins", "- final LocalDateTime createdAt"], ["+ getCoins()", "+ setCoins(int): rejects < 0", "+ roleLabel()"], "The account that is logged in; holds the coin balance."],
  ["3", "Habit (abstract)", ["- int id, userId", "- String name, unit, color", "- double target", "- Schedule schedule", "- boolean shared, archived"], ["+ abstract isCompleted(double)", "+ abstract formatValue(double)", "+ abstract getType()", "+ progress(double)", "+ setTarget(double): rejects ≤ 0"], "A tracked habit; subclasses decide what a value means."],
  ["4", "Schedule (interface)", "none", ["+ isDue(day, start, done)", "+ outcomes(start, today, done)", "+ default streakUnit()", "+ static of(type, param)"], "Strategy that decides when a habit is expected."],
  ["5", "PowerUp (abstract)", ["- final String code, name, description", "- final int price"], ["+ final getters", "+ abstract needsHabit()", "+ abstract apply(ctx, habit)", "+ static create(...)"], "An item bought with coins; each subclass has its own effect."],
  ["6", "BaseDao<T> (abstract)", "none (stateless)", ["# abstract mapRow(ResultSet)", "# queryList / queryOne / update / insert"], "Template for all DAOs; binds parameters with PreparedStatement."],
  ["7", "Database (final)", ["- static Connection connection", "- static final Properties CONFIG"], ["+ static inTransaction(Supplier)", "+ static inTransaction(Runnable)", "~ static with(SqlWork)"], "Owns the JDBC connection and transactions."],
  ["8", "CheckInController", ["- CheckInDao, UserDao, CoinDao, …", "- List<CheckInListener> listeners"], ["+ checkIn(Habit) / (Habit, double) / (Habit, double, LocalDate, String)", "+ undo(Habit, LocalDate)", "+ saveJournal(...)"], "Records progress; pays and refunds coins; notifies observers."],
  ["9", "ShopController", ["- PowerUpDao, UserDao, CoinDao, …"], ["+ buy(PowerUp)", "+ use(PowerUp, Habit)", "+ autoApplyFreezes()"], "Coin economy; purchases are one transaction."],
  ["10", "StatsController", ["- HabitDao, CheckInDao, JournalDao"], ["+ summaries(), overview()", "+ completionRate(Habit) / (Habit, from, to)", "+ trend, byWeekday, heatmap, moodInsights"], "Read-only numbers for screens."],
], [1, 3, 5, 6, 5]));
add(P("**Choice of modifiers.** Fields are `private` so that only the class can change them, through validating setters. Identity fields (`id`, `username`, `code`, `price`) are also `final` because they must not change after creation. Getters of `PowerUp` are `public final` so a subclass cannot pretend to have a different price. Helper methods used by subclasses only, such as `BaseDao.queryList` and `DayBasedSchedule.isDueDay`, are `protected`. `Database.with(...)` has default (package) access so that only the DAOs in the same package can run raw SQL work; the controllers can only use `inTransaction`. Utility classes such as `PasswordHasher` and `StreakCalculator` are `final` with a private constructor and `static` methods, because they have no state. Constants such as `PasswordHasher.ITERATIONS` are `private static final`."));

add(H2("2. Abstract classes"));
add(table("Abstract classes", ["No", "Abstract class", "Abstract methods", "Concrete methods", "Description"], [
  ["1", "Person", "roleLabel()", "getId(), getUsername(), getDisplayName(), setDisplayName(), toString()", "Used by User and Partner (Figure 2)."],
  ["2", "Habit", "getType(), isCompleted(double), formatValue(double)", "progress(double), completeValue(), all getters/validating setters", "Used by BooleanHabit, CountHabit, DurationHabit."],
  ["3", "DayBasedSchedule", "isDueDay(LocalDate, LocalDate)", "isDue(...) (final), outcomes(...)", "Template method: outcomes() walks the days and asks the subclass isDueDay(). Used by DailySchedule, WeekdaySchedule, EveryNDaysSchedule."],
  ["4", "PowerUp", "needsHabit(), apply(PowerUpContext, Habit), icon()", "getCode(), getName(), getPrice() (final), create(...) (static factory)", "Used by StreakFreeze, StreakRepair, DoubleCoins, RestDay."],
  ["5", "BaseDao<T>", "mapRow(ResultSet)", "queryList, queryOne, queryRaw, scalar, update, insert", "Used by all 11 DAO classes."],
  ["6", "Page (GUI)", "title(), build(VBox)", "refresh() (final), view() (final)", "Used by the 9 screens of the main window."],
], [1, 3, 5, 6, 5]));
add(P("The abstract classes hold the state and code that every subclass needs, and leave open exactly the step that differs. For example every DAO opens a statement, binds parameters and loops over the result set the same way; only the conversion of one row into an object (`mapRow`) is different, so that is the single abstract method."));
add(...snippet("db/BaseDao.java", "public abstract class BaseDao<T>", { maxLines: 22, withDocLines: 4 }));

add(H2("3. Some OOP techniques"));
add(H3("3.1. Overloading methods"));
add(B("`CheckInController.checkIn(Habit)`, `checkIn(Habit, double)` and `checkIn(Habit, double, LocalDate, String)`: one click, today's value, or any past day with a note. The shorter versions call the longest one, so the rules live in one place."));
add(B("`StatsController.completionRate(Habit)` and `completionRate(Habit, LocalDate, LocalDate)`: whole life of the habit or a date range."));
add(B("`StrengthScore.compute(List<Double>)` and `compute(List<Double>, double halfLife)`: default half-life of 13 periods, or a custom one (3 weeks for weekly habits)."));
add(B("Constructors `WeekdaySchedule(int mask)` and `WeekdaySchedule(DayOfWeek... days)`; `Database.inTransaction(Supplier<R>)` and `inTransaction(Runnable)`."));
add(...snippet("controller/CheckInController.java", "/** One click: mark the habit fully done today. */", { maxLines: 14 }));
add(P("Java passes arguments by value: the `double value` is a copy, while `Habit habit` is a copy of the reference, so the controller reads the same habit object that the GUI shows but cannot replace the GUI's variable."));
add(H3("3.2. Overriding methods"));
add(B("`isCompleted(double)`, `formatValue(double)` and `getType()` in BooleanHabit, CountHabit and DurationHabit."));
add(B("`isDueDay(LocalDate, LocalDate)` in DailySchedule, WeekdaySchedule and EveryNDaysSchedule; `outcomes(...)` and `streakUnit()` in TimesPerWeekSchedule."));
add(B("`apply(PowerUpContext, Habit)` in the four power-ups; `mapRow(ResultSet)` in every DAO; `roleLabel()` in User and Partner; `toString()` in Person, Habit and PowerUp."));
add(...code([
  ...fs.readFileSync(path.join(SRC, "model/CountHabit.java"), "utf8").split("\n").slice(2, 14),
], "src/main/java/com/habitflow/model/CountHabit.java"));
add(...snippet("model/DurationHabit.java", "public class DurationHabit", { maxLines: 16, withDocLines: 1 }));

add(H2("4. Inheritance"));
add(P("The following inheritance techniques are used:"));
add(B("**Calling the parent constructor** with `super(...)`: `User` and `Partner` pass id, username and display name to `Person`; each power-up passes its code to `PowerUp`."));
add(B("**Template Method**: `DayBasedSchedule.outcomes()` contains the loop over days and calls the abstract `isDueDay()`; `BaseDao.queryList()` calls the abstract `mapRow()`; `Page.refresh()` calls the abstract `build()`."));
add(B("**final methods** stop subclasses from changing rules that must hold: `DayBasedSchedule.isDue()` always rejects days before the start date; `PowerUp.getPrice()` cannot be overridden."));
add(B("**Interface default methods**: `Schedule.streakUnit()` returns \"days\" and only `TimesPerWeekSchedule` overrides it with \"weeks\"."));
add(B("**Enum constants with their own method body**: each `HabitType` constant overrides `newHabit()` to create its own subclass (a small factory)."));
add(...snippet("model/DayBasedSchedule.java", "public abstract class DayBasedSchedule", { maxLines: 26, withDocLines: 1 }));
add(...snippet("model/EveryNDaysSchedule.java", "public class EveryNDaysSchedule", { maxLines: 20, withDocLines: 1 }));

add(H2("5. 3-tier model"));
add(H3("5.1. Package design"));
add(figure(diag("three-tier.png"), "Packages of the 3-tier MVC architecture", 600));
add(table("Package hierarchy", ["No", "Package", "Tier", "Content"], [
  ["1", "com.habitflow.ui", "GUI (View)", "App, LoginView, MainView, 9 Page subclasses, HabitEditorDialog, HeatmapCanvas, Screenshots, Ui helpers"],
  ["2", "com.habitflow.controller", "Controller", "9 controllers, Session, CheckInListener, StartupController, HabitStats (package-private)"],
  ["3", "com.habitflow.controller.logic", "Controller", "Pure algorithms: StreakCalculator, StrengthScore, Correlation, PasswordHasher, CoinCalculator"],
  ["4", "com.habitflow.db", "Database", "Database, BaseDao<T>, 11 DAOs, DataAccessException — the only package with SQL"],
  ["5", "com.habitflow.model", "Shared model", "Domain classes passed between tiers: Person, Habit, Schedule, PowerUp, records"],
  ["6", "com.habitflow.tools", "Tool", "Seeder: creates a year of demo data and measures query speed"],
], [1, 5, 3, 9]));
add(P("Each tier provides an API to the tier next to it. A GUI button calls a controller method (for example `ctx.shop.buy(powerUp)`); the controller checks the rules and calls DAO methods inside a transaction; the DAO runs SQL. The rule is checked automatically by `ArchitectureTest`, which scans the source code and fails if the `ui` package mentions `java.sql` or the `db` package, or if a controller contains SQL or JDBC types."));
add(H3("5.2. Interface design"));
add(table("Interfaces", ["No", "Interface", "Methods", "Implemented by", "Purpose"], [
  ["1", "Schedule", "type(), param(), isDue(), outcomes(), describe(), streakUnit() (default), of() (static)", "DayBasedSchedule (3 subclasses), TimesPerWeekSchedule", "Strategy pattern: streak, strength and completion code never changes when a schedule is added."],
  ["2", "PowerUpContext", "today(), missedDueDays(), isDoneOn(), protectDays(), isEffectActive(), activateEffect()", "ShopController.Context (private inner class)", "The only door a power-up has into the user's data; keeps the model free of SQL."],
  ["3", "CheckInListener", "onCheckIn(Habit, LocalDate, boolean)", "AchievementController", "Observer pattern: achievements react to every check-in without the check-in code knowing about them."],
  ["4", "Database.SqlWork<R>, BaseDao.RowMapper<R>", "run(Connection), map(ResultSet)", "lambdas in the DAOs", "Functional interfaces that let JDBC code throw SQLException inside lambdas."],
], [1, 3, 6, 4, 6]));
add(...snippet("model/PowerUpContext.java", "public interface PowerUpContext", { maxLines: 20, withDocLines: 1 }));
add(H3("5.3. Access control"));
add(table("Data access control", ["No", "Member", "Class", "Modifier", "Description"], [
  ["1", "id, username", "Person", "private final", "Identity never changes after loading; read through public final getters."],
  ["2", "displayName", "Person", "private", "Public name; can change only through setDisplayName(), which rejects blank names."],
  ["3", "coins", "User", "private", "Money-like value; the setter rejects negative numbers. The database also has CHECK (coins >= 0)."],
  ["4", "target, name, color", "Habit", "private", "Validated by setters (target > 0, name 1-60 chars, color #RRGGBB)."],
  ["5", "code, price", "PowerUp", "private final", "Set once from the catalog; nobody can change a price in memory."],
  ["6", "password_hash, salt", "UserDao.Credentials", "record, package db", "Only read by AuthController to verify a password; never reaches the GUI."],
  ["7", "connection", "Database", "private static", "One shared JDBC connection, only reachable through Database methods under a lock."],
  ["8", "ITERATIONS, KEY_BITS", "PasswordHasher", "private static final", "Security constants, not visible or changeable from outside."],
  ["9", "listeners", "CheckInController", "private final", "The list object cannot be replaced; observers are added through addListener()."],
], [1, 3, 3, 3, 8]));
add(table("Method access control", ["No", "Method", "Class", "Modifier", "Description"], [
  ["1", "checkIn(...), buy(...), login(...)", "controllers", "public", "The API that the GUI tier is allowed to use."],
  ["2", "mapRow(ResultSet)", "BaseDao and DAOs", "protected abstract", "Only the DAO hierarchy needs it."],
  ["3", "queryList, update, insert", "BaseDao", "protected", "Subclasses run SQL; other classes cannot."],
  ["4", "with(SqlWork)", "Database", "package-private static", "Raw connection access only inside the db package."],
  ["5", "summarize, doneDays", "HabitStats", "package-private static", "Shared by controllers, hidden from the GUI."],
  ["6", "isDue(...)", "DayBasedSchedule", "public final", "Subclasses must not skip the start-date rule."],
  ["7", "start(User), end()", "Session", "package-private static", "Only AuthController can log a user in or out."],
  ["8", "hash, verify", "PasswordHasher", "public static", "Stateless utility used by AuthController."],
], [1, 4, 3, 3, 7]));
add(P("The tables show that the project opens as little as possible: everything that can break a rule (balance, password data, the connection) is private or package-private, and the public surface is the controller API plus read-only getters."));

add(H2("6. Encapsulation vs Inheritance vs Polymorphism"));
add(H3("6.1. Encapsulation"));
add(P("The coin balance shows encapsulation at three levels. In the model, `User.coins` is private and `setCoins` rejects negative values. In the database tier, `UserDao.addCoins` only updates the row if the new balance stays ≥ 0 and reports false otherwise. In the controller, a purchase checks the balance, takes the coins, writes the ledger and delivers the item inside one transaction, so the GUI can never see half of a purchase."));
add(...snippet("controller/ShopController.java", "public void buy(PowerUp p)", { maxLines: 20, withDocLines: 1 }));
add(H3("6.2. Inheritance"));
add(P("The three habit types inherit name, target, schedule, colour, validation and `progress()` from `Habit` and only add what is different. The four schedules inherit the day-walking algorithm from `DayBasedSchedule`. Without inheritance, every subclass would repeat about 80 lines of the same fields and checks."));
add(...snippet("model/Habit.java", "public abstract class Habit", { maxLines: 30, withDocLines: 4 }));
add(H3("6.3. Polymorphism"));
add(P("`HabitStats.summarize` works with any `Habit` and any `Schedule`. At run time `isCompleted` and `outcomes` are dispatched to the real subclass, so the same few lines compute a daily streak in days and a 3-times-per-week streak in weeks. The shop also uses polymorphism: `ShopController.use` calls `p.apply(ctx, target)` without knowing which power-up it is."));
add(...snippet("controller/HabitStats.java", "static HabitSummary summarize", { maxLines: 20 }));

// IV. EXPERIMENT
add(pageBreak(), H1("IV. EXPERIMENT"));
add(H2("1. Environment and tools"));
add(P("**Environment:** one computer: Apple MacBook with an Apple M2 CPU (8 cores), 16 GB RAM, macOS 26.5. The database server (PostgreSQL) runs locally on the same machine; the application needs no network."));
add(table("Tools and libraries", ["No", "Tool / library", "Version", "Used for"], [
  ["1", "OpenJDK", "17.0.20", "Java language and runtime"],
  ["2", "JavaFX (openjfx)", "21.0.5", "Desktop GUI, charts, canvas heatmap"],
  ["3", "PostgreSQL", "16.16", "Relational database (14 tables)"],
  ["4", "PostgreSQL JDBC driver", "42.7.4", "Running hand-written SQL from Java"],
  ["5", "Apache Maven", "3.10.0", "Build, dependencies, running the app and tests"],
  ["6", "JUnit Jupiter", "5.11.3", "27 unit, integration and architecture tests"],
  ["7", "PlantUML", "1.2026.10", "Use case, class, package and ER diagrams"],
], [1, 5, 3, 8]));
add(P("Installation steps for macOS and Windows are in Appendix B."));
add(H2("2. Project functions"));
add(table("Functions of the project", ["No", "Function", "Description", "Main class / method"], [
  ["1", "Secure sign-up and login", "PBKDF2-SHA256 with 120,000 iterations and a random salt; 5 wrong passwords lock the account for 5 minutes.", "AuthController.register / login"],
  ["2", "Three habit types", "Yes/No, count with unit, duration in minutes, each with its own completion rule and display.", "Habit subclasses"],
  ["3", "Flexible schedules", "Every day, chosen weekdays, X times per week, every N days.", "Schedule implementations"],
  ["4", "Today dashboard", "Only habits due today; one-click check-in, +1, +5m/+15m; day progress.", "TodayPage, CheckInController.checkIn"],
  ["5", "Schedule-aware streaks", "Current and longest streak; non-due days never break a streak; weekly habits count weeks.", "Schedule.outcomes, StreakCalculator"],
  ["6", "Streak protection", "Owned Streak Freezes are spent automatically at login on missed due days of the last 3 days.", "ShopController.autoApplyFreezes"],
  ["7", "Habit strength", "Exponential moving average 0-100 with a 13-period half-life.", "StrengthScore.compute"],
  ["8", "Year heatmap", "53 × 7 grid drawn on a JavaFX Canvas with tooltips.", "HeatmapCanvas, StatsController.heatmap"],
  ["9", "Statistics", "Trend (30/90 days), weekday and category charts computed in SQL with GROUP BY and generate_series.", "CheckInDao.completedPerDay / PerWeekday / PerCategory"],
  ["10", "Mood journal and insights", "Mood 1-5 and note per day; Pearson correlation between doing a habit and mood.", "StatsController.moodInsights, Correlation.pearson"],
  ["11", "Achievements", "11 badges checked after every check-in (Observer); each pays its coins once.", "AchievementController.evaluate"],
  ["12", "Reminders", "Background thread checks every 20 seconds and shows a notification for undone habits.", "ReminderController.start"],
  ["13", "Accountability partners", "Friend requests by username; partners see only shared habits.", "SocialController"],
  ["14", "Backfill and activity log", "Edit any past day; each change written to audit_log.", "CheckInController.checkIn(…, day, note), AuditDao"],
  ["15", "Search, filter, sort, archive", "By name, category, type; sort by name, streak, strength, newest; archive/restore.", "HabitController.search / setArchived"],
  ["16", "CSV export / import", "Import is one transaction; a bad row cancels everything and reports its line number.", "ImportExportController"],
  ["17", "Coin economy", "10 coins per habit completed today, up to 20 at a 30-period streak; undo refunds; every change in coin_ledger.", "CoinCalculator, CheckInController"],
  ["18", "Power-up shop", "Buy and use Streak Freeze, Streak Repair, Double Coins and Rest Day; an item with no effect is not consumed.", "ShopController.buy / use, PowerUp.apply"],
], [1, 4, 9, 5]));
add(H2("3. Database"));
add(P("The project uses a PostgreSQL relational database with 14 tables (Figure 5). Foreign keys use ON DELETE CASCADE, so deleting a user or a habit also removes its rows. Data rules are enforced by the database as well as by Java: `CHECK (coins >= 0)`, `CHECK (qty >= 0)`, `UNIQUE (habit_id, day)` (one check-in per habit per day), `CHECK (mood BETWEEN 1 AND 5)` and `CHECK (requester_id <> addressee_id)`."));
add(figure(diag("erd.png"), "Entity relationship diagram", 620));
add(table("Database tables", ["No", "Table", "Purpose"], [
  ["1", "users", "Accounts, password hash and salt, failed logins, lock time, coin balance"],
  ["2", "categories", "User-defined groups of habits with a colour"],
  ["3", "habits", "Habit definition: type, target, unit, schedule type and parameter, shared, archived"],
  ["4", "check_ins", "One row per habit per day: value, note, frozen (protected), coins awarded"],
  ["5", "journal_entries", "Mood (1-5) and note per user per day"],
  ["6", "coin_ledger", "Every coin change with a reason; its sum always equals users.coins"],
  ["7", "power_ups", "Shop catalog (code, name, description, price)"],
  ["8", "user_power_ups", "Inventory: how many of each power-up a user owns"],
  ["9", "active_effects", "Timed effects such as Double Coins with an expiry time"],
  ["10", "achievements", "Badge catalog and coin reward"],
  ["11", "user_achievements", "Which user earned which badge and when"],
  ["12", "reminders", "Reminder time per habit"],
  ["13", "friendships", "Requests and accepted partners"],
  ["14", "audit_log", "Activity log: logins, backfills, purchases, imports"],
], [1, 4, 12]));
add(P("All SQL is written by hand. The trend chart uses `generate_series` so that days without any check-in still appear with zero, and the SQL repeats the completion rule of `Habit.isCompleted` so the counting happens inside PostgreSQL:"));
add(...snippet("db/CheckInDao.java", "public LinkedHashMap<LocalDate, Integer> completedPerDay", { maxLines: 12, withDocLines: 1 }));
add(P("**Testing and measurements.** Correctness is checked by 27 automated JUnit tests (`mvn test`): 14 unit tests of the algorithms (streaks for every schedule, strength, Pearson correlation against known values, hashing, coin rewards, habit types), 10 integration tests that run the controllers against a separate real database `habitflow_test`, and 3 architecture tests. The integration tests check the important rules: the coin ledger always sums to the balance, a check-in pays once and undo refunds it, backfilled days pay nothing, a purchase without enough coins changes nothing, a bought Streak Freeze restores a broken streak exactly once, a power-up with no effect is not consumed, a CSV with one bad row is fully rolled back, and partners see only shared habits. All 27 tests pass. With the demo data (1,683 check-ins over a year, 12 habits) the Today dashboard data loads in about 9 ms and all Statistics page queries in about 23-44 ms, below our target of 100 ms."));
add(table("Automated test results", ["No", "Test class", "Tests", "Result"], [
  ["1", "ScheduleStreakTest", "9", "Passed"],
  ["2", "LogicTest", "5", "Passed"],
  ["3", "DatabaseIntegrationTest (real PostgreSQL)", "10", "Passed"],
  ["4", "ArchitectureTest (3-tier rule)", "3", "Passed"],
], [1, 8, 2, 3]));

add(H2("4. GUI"));
add(P(`Table ${tables.length + 1} lists the user interfaces in the order a user meets them. All figures were exported from the running application with demo data (\`mvn javafx:run -Djavafx.args=--screenshots\`).`));
add(table("User interfaces", ["No", "Interface", "Figure"], [
  ["1", "Login / Register", "Figure 6"], ["2", "Today", "Figure 7"], ["3", "Habits", "Figure 8"], ["4", "Habit editor dialog", "Figure 9"],
  ["5", "Habit details", "Figure 10"], ["6", "Statistics", "Figure 11"], ["7", "Journal", "Figure 12"], ["8", "Achievements", "Figure 13"],
  ["9", "Friends", "Figure 14"], ["10", "Shop", "Figure 15"], ["11", "Settings", "Figure 16"],
], [1, 8, 4]));
const gui = [
  ["01-login.png", "Login screen", "The user types a username and password and presses **Log in** (or Enter). `AuthController.login` loads the stored salt and hash, hashes the typed password and compares in constant time. A wrong password shows how many attempts are left; the fifth failure locks the account for 5 minutes. **No account yet? Create one** switches the card to the registration form (username, name, password, repeat password), which is validated by `AuthController.register`. After login, owned Streak Freezes are applied automatically and the reminder thread starts.", 520],
  ["02-today.png", "Today screen", "The header shows the coin balance, which updates by itself after every change (Observer on `Session`). Four cards summarise the day. Each due habit is a row with its streak, today's progress and buttons that fit its type: **Mark done** for Yes/No, **−** and **+1** for counts, **+5m**, **+15m** and **Done** for durations. Pressing a button calls `CheckInController.checkIn`; the first completion of the day pays coins, shown as a \"+12 coins\" notification. Double-clicking a row opens its details. At the bottom, the five mood buttons save today's journal mood.", 600],
  ["03-habits.png", "Habits screen", "Lists all habits with streak, best streak, strength and completion rate. The search box, category, type and **Sort** boxes filter the list immediately through `HabitController.search`. **Show archived** includes archived habits. **+ New habit** and **Edit** open the editor (Figure 9); **Archive** hides a habit but keeps its history; **Delete** asks for confirmation and removes the habit and all its check-ins. **Categories…** opens a dialog to add or remove categories.", 600],
  ["11-habit-editor.png", "Habit editor dialog", "The user enters a name, chooses how the habit is measured, the target and unit, and the schedule. The extra fields change with the schedule: weekday check boxes for \"Specific weekdays\" and a number for \"X times per week\" or \"Every N days\". Category, colour, sharing with partners and an optional reminder time complete the habit. When **OK** is pressed, the dialog builds the right `Habit` subclass and `Schedule`; if a value is invalid (e.g. target 0 or no weekday) an error is shown and the dialog stays open.", 380],
  ["10-habit-detail.png", "Habit details screen", "Shows current and longest streak, strength, the completion rate of the last 30 days and of all time (the two overloaded `completionRate` methods), and the 12-month heatmap where darker squares mean closer to the target. In **Edit a day** the user picks a past date, types a value and an optional note and presses **Save**; this calls `checkIn(habit, value, day, note)`, which pays no coins and writes the change to the activity log. **Clear day** removes the entry. The history table lists every check-in with the coins it earned.", 600],
  ["04-statistics.png", "Statistics screen", "Shows the trend of completed check-ins per day (buttons **30 days** / **90 days**), the weekday bar chart, the category pie chart, the heatmap of all habits, mood insights and the strength ranking. Every chart is filled from one SQL aggregate query.", 600],
  ["05-journal.png", "Journal screen", "The user picks a day, chooses a mood from 1 (Awful) to 5 (Great), writes an optional note and presses **Save entry**. Choosing another date loads the entry of that day for editing. Below, past entries are listed with a coloured mood dot. The entries feed the mood insights on the Statistics screen.", 600],
  ["06-achievements.png", "Achievements screen", "Shows all 11 badges. Earned badges show the date; locked ones are faded. Badges are unlocked automatically by `AchievementController.evaluate` and their coin reward is paid once.", 600],
  ["07-friends.png", "Friends screen", "The user types a friend's username and presses **Send request**. Incoming requests can be accepted or declined; outgoing ones can be cancelled. Each partner card shows only the habits the partner marked as shared, with streak, strength and whether they were done today. **Remove** ends the partnership after confirmation.", 600],
  ["08-shop.png", "Shop screen", "Shows the balance and, if active, until when Double Coins lasts. Each power-up card has a **Buy** button (one transaction: check balance, pay, deliver) and, when owned, a **Use** button. If the power-up needs a habit, a dialog asks which one. A power-up that would have no effect (for example Streak Repair when nothing was missed) shows an explanation and is not consumed. The coin history lists every ledger entry.", 600],
  ["09-settings.png", "Settings screen", "Change display name and password, turn reminders on or off, **Export CSV…** and **Import CSV…** with a file chooser, and read the activity log (logins, backfills, purchases, imports).", 600],
];
gui.forEach(([file, title, text, w]) => {
  add(figure(shot(file), title, w));
  add(P(text));
});

// V. CONCLUSION
add(pageBreak(), H1("V. CONCLUSION"));
add(H2("1. Strengths"));
[
  "The 3-tier rule is not only described but enforced by an automated test, and no SQL exists outside the database package.",
  "Important rules are protected twice, in Java and in the database (CHECK, UNIQUE, foreign keys), and multi-step operations (purchase, check-in with coins, CSV import, achievement rewards) run in transactions.",
  "The OOP design does real work: adding a new schedule or power-up means adding one class, without changing streak, strength or shop code.",
  "Correctness is shown by 27 passing tests, including tests against a real PostgreSQL database, and query speed was measured (well under 100 ms with a year of data).",
  "Passwords are stored with salted PBKDF2 and the account locks after repeated failures.",
].forEach((t) => add(B(t)));
add(H2("2. Weaknesses"));
[
  "The application uses one shared JDBC connection guarded by a lock. This is simple and correct for one desktop user, but a server version would need a connection pool.",
  "Reminders work only while the application is open; there are no operating system notifications.",
  "Accountability partners only work when both users use the same database (same computer or a shared PostgreSQL server).",
  "Pages rebuild their whole content on refresh. This is fast enough for hundreds of habits but is not the most efficient approach.",
  "The interface has only a light theme and English text.",
].forEach((t) => add(B(t)));
add(H2("3. Self-assessment"));
add(P("We think the project deserves about **9 / 10**. It meets every required point (3-tier MVC, PostgreSQL without ORM, JavaFX, more than 4 tables, many OOP techniques) and goes further with 18 functions, real algorithms and automated tests. We remove one point because of the weaknesses above, mainly the in-app-only reminders and the single-connection design."));
add(H2("4. Future work"));
["Operating system notifications and a system tray icon.", "A dark theme and Vietnamese translation.", "A connection pool and a server so partners on different computers can connect.", "Habit templates and weekly e-mail reports.", "More power-ups and seasonal challenges between partners."].forEach((t) => add(B(t)));

// DUTY ROSTER
add(pageBreak(), H1("DUTY ROSTER"));
add(P("[Students: replace the placeholders with your team members and real dates.]"));
add(table("Duty roster", ["ID", "Task", "In charge", "Start", "End", "State"], [
  ["1", "Requirements, use cases, user roles (Section I)", "[Member 1]", "[date]", "[date]", "Done"],
  ["2", "Class analysis and design, UML diagrams (Sections II-III)", "[Member 1], [Member 2]", "[date]", "[date]", "Done"],
  ["3", "Database schema, ERD, DAOs (db package)", "[Member 2]", "[date]", "[date]", "Done"],
  ["4", "Controllers and algorithms (streaks, strength, coins, shop)", "[Member 3]", "[date]", "[date]", "Done"],
  ["5", "JavaFX GUI (all screens, heatmap, charts)", "[Member 4]", "[date]", "[date]", "Done"],
  ["6", "Tests, demo data seeder, measurements", "[Member 3]", "[date]", "[date]", "Done"],
  ["7", "Report writing and review", "All members", "[date]", "[date]", "In progress"],
], [1, 7, 4, 2, 2, 2]));

// REFERENCES
add(H1("REFERENCES"));
[
  "Oracle, \"The Java Tutorials: Object-Oriented Programming Concepts\", https://docs.oracle.com/javase/tutorial/java/concepts/",
  "Oracle, \"JDBC Basics\", https://docs.oracle.com/javase/tutorial/jdbc/basics/",
  "OpenJFX, \"JavaFX 21 documentation\", https://openjfx.io/",
  "The PostgreSQL Global Development Group, \"PostgreSQL 16 Documentation\", https://www.postgresql.org/docs/16/",
  "PostgreSQL JDBC Driver documentation, https://jdbc.postgresql.org/documentation/",
  "K. Moriarty, B. Kaliski, A. Rusch, \"PKCS #5: Password-Based Cryptography Specification Version 2.1\", RFC 8018, 2017.",
  "OWASP, \"Password Storage Cheat Sheet\", https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html",
  "E. Gamma, R. Helm, R. Johnson, J. Vlissides, \"Design Patterns: Elements of Reusable Object-Oriented Software\", Addison-Wesley, 1994 (Strategy, Observer, Template Method, Factory Method).",
  "PlantUML, \"PlantUML Language Reference Guide\", https://plantuml.com/",
].forEach((t, i) => add(P(`[${i + 1}] ${t}`, { alignment: AlignmentType.LEFT })));

// APPENDIX A
add(pageBreak(), H1("APPENDIX A: CLASS DESCRIPTION"));
const appendix = [];
for (const pkg of ["model", "controller", "controller/logic", "db", "ui", "tools"]) {
  const dir = path.join(SRC, pkg);
  fs.readdirSync(dir).filter((f) => f.endsWith(".java")).sort().forEach((f) => {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    const m = text.match(/\/\*\*\s*\n?\s*\*?\s*([^*][^\n]*?)(\n|\*\/)/);
    const decl = (text.match(/^(public |abstract |final )*(class|interface|enum|record) \w+/m) || [""])[0].replace(/^public /, "");
    appendix.push([String(appendix.length + 1), decl.replace(/^(abstract |final )*(class|interface|enum|record) /, "") + (decl.includes("abstract") ? " (abstract)" : decl.includes("interface") ? " (interface)" : decl.includes("record") ? " (record)" : decl.includes("enum") ? " (enum)" : ""), `src/main/java/com/habitflow/${pkg}/${f}`, m ? m[1].trim() : ""]);
  });
}
add(table("All classes of the project", ["No", "Class", "Source file", "Description"], appendix, [1, 4, 7, 7]));

// APPENDIX B
add(H1("APPENDIX B: INSTALLATION AND RUNNING"));
add(P("**macOS (Homebrew):**"));
add(...code([
  "brew install openjdk@17 maven postgresql@16",
  "brew services start postgresql@16",
  "createdb habitflow",
  "createdb habitflow_test          # only needed for mvn test",
  "cd java_proj",
  "mvn -q compile exec:java         # optional: load the demo data (demo / demo1234)",
  "mvn javafx:run                   # start HabitFlow",
  "mvn test                         # run the 27 tests",
]));
add(P("**Windows:** install JDK 17, Apache Maven and PostgreSQL 16 from their official installers. Create the databases with pgAdmin or `createdb -U postgres habitflow`. Put the user name and password into `src/main/resources/db.properties` (or pass `-Dhabitflow.db.user=postgres -Dhabitflow.db.password=...`), then run the same Maven commands. The application creates its tables automatically on first start."));

// ---------- front matter (needs the caption lists) ----------
const front = [];
front.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 2400, after: 200 }, children: [new TextRun({ text: "JAVA OBJECT-ORIENTED PROGRAMMING", font: FONT, size: 32, bold: true })] }));
front.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "Assignment 3 Report", font: FONT, size: 28 })] }));
front.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: "HabitFlow: a Habit Tracker with JavaFX and PostgreSQL", font: FONT, size: 40, bold: true, color: "2F7A55" })] }));
front.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Team members: [Name - Student ID], [Name - Student ID], …", font: FONT, size: SIZE })] }));
front.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "Lecturer: [Name]          Class: [Class]", font: FONT, size: SIZE })] }));
front.push(pageBreak());
front.push(...table("Versions", ["Version", "Date", "In charge", "Description"], [
  ["V1.0", "13-Nov-2026", "[Team]", "First complete report: Sections I-V, Appendix A and B"],
], [2, 3, 3, 8], false));
front.push(new Paragraph({ children: [new TextRun({ text: "Abbreviations", font: FONT, size: 28, bold: true })], spacing: { before: 240, after: 120 } }));
front.push(...table("Abbreviations", ["Abbreviation", "Meaning"], [
  ["DMS", "Database Management System"], ["DAO", "Data Access Object (a class that runs SQL for one table)"], ["ERD", "Entity Relationship Diagram"],
  ["GUI", "Graphical User Interface"], ["JDBC", "Java Database Connectivity"], ["MVC", "Model-View-Controller"],
  ["OOP", "Object-Oriented Programming"], ["ORM", "Object-Relational Mapping (not used in this project)"],
  ["PBKDF2", "Password-Based Key Derivation Function 2"], ["SQL", "Structured Query Language"], ["UML", "Unified Modeling Language"],
], [3, 12], false));
front.push(pageBreak());
front.push(new Paragraph({ children: [new TextRun({ text: "Table of Contents", font: FONT, size: 28, bold: true })], spacing: { after: 120 } }));
front.push(new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }));
front.push(new Paragraph({ children: [new TextRun({ text: "(If the table of contents is empty, right-click it in Word and choose Update Field.)", italics: true, font: FONT, size: 20 })] }));
front.push(pageBreak());
front.push(new Paragraph({ children: [new TextRun({ text: "List of Figures", font: FONT, size: 28, bold: true })], spacing: { after: 120 } }));
figures.forEach((f) => front.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: f, font: FONT, size: 24 })] })));
front.push(new Paragraph({ children: [new TextRun({ text: "List of Tables", font: FONT, size: 28, bold: true })], spacing: { before: 360, after: 120 } }));
tables.forEach((t) => front.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: t, font: FONT, size: 24 })] })));
front.push(pageBreak());

const heading = (size) => ({ run: { font: FONT, size, bold: true, color: "1F2933" }, paragraph: { spacing: { before: 280, after: 140 }, keepNext: true } });
const doc = new Document({
  creator: "HabitFlow team",
  title: "HabitFlow - Java OOP Assignment 3 Report",
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: SIZE } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, ...heading(32), paragraph: { spacing: { before: 360, after: 180 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, ...heading(28), paragraph: { spacing: { before: 280, after: 140 }, keepNext: true, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, ...heading(26), paragraph: { spacing: { before: 220, after: 120 }, keepNext: true, outlineLevel: 2 } },
    ],
  },
  numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
  sections: [{
    properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 20 })] })] }) },
    children: [...front, ...body],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(ROOT, "report/HabitFlow_Report.docx");
  fs.writeFileSync(out, buf);
  console.log(`Wrote ${out}: ${figures.length} figures, ${tables.length} tables`);
});
