#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'index.html');

// Curated list of the 23 key files that explain how HabitFlow works end-to-end
const filesToInclude = [
  // Model (Shared Domain)
  'src/main/java/com/habitflow/model/Person.java',
  'src/main/java/com/habitflow/model/User.java',
  'src/main/java/com/habitflow/model/Habit.java',
  'src/main/java/com/habitflow/model/Schedule.java',
  'src/main/java/com/habitflow/model/DayBasedSchedule.java',
  'src/main/java/com/habitflow/model/TimesPerWeekSchedule.java',
  'src/main/java/com/habitflow/model/PowerUp.java',
  // Database Tier
  'src/main/resources/schema.sql',
  'src/main/java/com/habitflow/db/Database.java',
  'src/main/java/com/habitflow/db/BaseDao.java',
  'src/main/java/com/habitflow/db/HabitDao.java',
  // Controller Tier & Pure Logic
  'src/main/java/com/habitflow/controller/Session.java',
  'src/main/java/com/habitflow/controller/AuthController.java',
  'src/main/java/com/habitflow/controller/CheckInController.java',
  'src/main/java/com/habitflow/controller/ShopController.java',
  'src/main/java/com/habitflow/controller/HabitStats.java',
  'src/main/java/com/habitflow/controller/logic/StreakCalculator.java',
  'src/main/java/com/habitflow/controller/logic/StrengthScore.java',
  // View Tier (JavaFX GUI)
  'src/main/java/com/habitflow/ui/App.java',
  'src/main/java/com/habitflow/ui/AppContext.java',
  'src/main/java/com/habitflow/ui/MainView.java',
  'src/main/java/com/habitflow/ui/Page.java',
  'src/main/java/com/habitflow/ui/TodayPage.java',
];

// Classify each file into MVC role and package group
function classify(relPath) {
  if (relPath.startsWith('src/main/java/com/habitflow/model/')) {
    return { role: 'M', group: 'Model (Domain)', tier: 'Model (Shared Domain)', lang: 'java' };
  }
  if (relPath.startsWith('src/main/java/com/habitflow/db/') || relPath.endsWith('.sql')) {
    return {
      role: 'M',
      group: 'Database (SQL & JDBC)',
      tier: relPath.endsWith('.sql') ? 'Database Tier (Schema)' : 'Database Tier (JDBC DAOs)',
      lang: relPath.endsWith('.sql') ? 'sql' : 'java',
    };
  }
  if (relPath.startsWith('src/main/java/com/habitflow/controller/logic/')) {
    return { role: 'C', group: 'Pure Logic', tier: 'Controller Tier (Pure Logic)', lang: 'java' };
  }
  if (relPath.startsWith('src/main/java/com/habitflow/controller/')) {
    return { role: 'C', group: 'Controllers', tier: 'Controller Tier (Use Cases)', lang: 'java' };
  }
  return { role: 'V', group: 'View (JavaFX UI)', tier: 'View Tier (JavaFX GUI)', lang: 'java' };
}

// Parse lightweight Java metadata directly from source text
function parseJava(content, fileName) {
  const lines = content.split('\n');
  const pkgMatch = content.match(/^package\s+([\w.]+);/m);
  const pkg = pkgMatch ? pkgMatch[1] : '';

  // Top-level Javadoc right before class/interface/enum/record declaration
  const declRe = /(?:\/\*\*([\s\S]*?)\*\/\s*)?(?:@\w+(?:\([^)]*\))?\s*)*\b(public\s+)?(abstract\s+|final\s+|sealed\s+)?(class|interface|enum|record)\s+(\w+)(?:<[^>]+>)?(?:\([^)]*\))?(?:\s+extends\s+([\w.<>,\s]+?))?(?:\s+implements\s+([\w.<>,\s]+?))?\s*\{/m;
  const dm = content.match(declRe);

  let javadoc = '';
  let visibility = 'default (package-private)';
  let modifier = '';
  let kind = 'class';
  let typeName = fileName.replace(/\.java$/, '');
  let extendsType = '';
  let implementsTypes = [];

  if (dm) {
    if (dm[1]) {
      javadoc = dm[1]
        .split('\n')
        .map(l => l.replace(/^\s*\*\s?/, '').trim())
        .filter(Boolean)
        .join(' ');
    }
    visibility = dm[2] ? 'public' : 'default (package-private)';
    modifier = (dm[3] || '').trim();
    kind = dm[4];
    typeName = dm[5];
    extendsType = (dm[6] || '').trim().replace(/<.*>/, '');
    if (dm[7]) {
      implementsTypes = dm[7].split(',').map(s => s.trim().replace(/<.*>/, '')).filter(Boolean);
    }
  }

  // Imports within com.habitflow
  const imports = [];
  const wildcardPkgs = [];
  for (const m of content.matchAll(/^import\s+(?:static\s+)?(com\.habitflow\.[\w.*]+);/gm)) {
    const imp = m[1];
    if (imp.endsWith('.*')) wildcardPkgs.push(imp.slice(0, -2));
    else imports.push(imp);
  }

  // Extract methods & constructors for quick-jump outline
  const methods = [];
  const methodRe = /^\s{4}(?:@Override\s+)?(?:(public|protected|private)\s+)?(?:(static|final|abstract|default)\s+)*(?:<[\w\s,?]+>\s+)?([\w.<>\[\]?,\s]+?)\s+(\w+)\s*\(([^)]*)\)/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('if') || line.trim().startsWith('for') || line.trim().startsWith('while') || line.trim().startsWith('switch') || line.trim().startsWith('catch') || line.trim().startsWith('return')) continue;
    const mm = line.match(methodRe);
    if (mm && !['if', 'for', 'while', 'switch', 'catch', 'synchronized', 'new', 'return'].includes(mm[4])) {
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      const isOverride = line.includes('@Override') || prevLine === '@Override';
      const vis = mm[1] || (kind === 'interface' ? 'public' : 'default');
      const ret = mm[3].trim();
      const name = mm[4];
      const params = mm[5].replace(/\s+/g, ' ').trim();
      if (ret !== 'class' && ret !== 'interface' && ret !== 'record' && ret !== 'enum') {
        methods.push({
          line: i + 1,
          vis,
          mod: mm[2] || '',
          ret,
          name,
          params: params.length > 48 ? params.slice(0, 45) + '...' : params,
          override: isOverride,
        });
      }
    }
  }

  // Detect overloaded methods (same name >= 2 times)
  const nameCounts = {};
  for (const m of methods) nameCounts[m.name] = (nameCounts[m.name] || 0) + 1;
  const overloadedNames = Object.entries(nameCounts).filter(([, c]) => c >= 2).map(([n]) => n);

  const overrideCount = (content.match(/@Override\b/g) || []).length;
  const hasTransaction = content.includes('Database.inTransaction');
  const hasSql = /\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/.test(content);
  const hasJavaFx = content.includes('javafx.');

  // Build OOP / Rubric tags
  const tags = [];
  if (modifier === 'abstract') tags.push('Abstract Class');
  if (kind === 'interface') tags.push('Interface');
  if (kind === 'record') tags.push('Java Record');
  if (kind === 'enum') tags.push('Enum');
  if (modifier === 'final') tags.push('final Class');
  if (visibility.startsWith('default')) tags.push('Package-Private');
  if (extendsType) tags.push(`extends ${extendsType}`);
  if (implementsTypes.length) tags.push(`implements ${implementsTypes.join(', ')}`);
  if (overloadedNames.length) tags.push(`Overloading (${overloadedNames.join(', ')})`);
  if (overrideCount > 0) tags.push(`@Override ×${overrideCount}`);
  if (hasTransaction) tags.push('Transaction');
  if (hasSql) tags.push('Hand-Written SQL');
  if (hasJavaFx) tags.push('JavaFX');

  return {
    pkg,
    typeName,
    kind,
    visibility,
    modifier,
    extendsType,
    implementsTypes,
    javadoc,
    imports,
    wildcardPkgs,
    methods,
    overloadedNames,
    overrideCount,
    tags,
  };
}

// Curated educational file guides for the 23 key files
const FILE_GUIDES = {
  // Model (Shared Domain)
  'src/main/java/com/habitflow/model/Person.java': {
    summary: 'Abstract base class for human actors in the app (User and Partner). Encapsulates final id and username, a validated displayName, and an abstract roleLabel() method.',
    why: 'Shares identity validation and final getters once across both the signed-in Member and read-only Accountability Partners while letting each subclass declare its own role.',
  },
  'src/main/java/com/habitflow/model/User.java': {
    summary: 'Concrete Person subclass representing the signed-in Member account, adding a validated non-negative coin balance and returning "Member" from roleLabel().',
    why: 'Separates mutable account state (coins) from read-only Partner objects so friends can never carry or mutate coin balances.',
  },
  'src/main/java/com/habitflow/model/Habit.java': {
    summary: 'Abstract base class for every habit in the app (Boolean, Count, and Duration). Holds shared fields like name, target, schedule, and color, while letting subclasses decide what "completed" means.',
    why: 'Because Habit is abstract, controllers and UI pages can treat every habit the same way—calling h.isCompleted(val) or h.formatValue(val)—without scattering if/else checks for each habit type.',
  },
  'src/main/java/com/habitflow/model/Schedule.java': {
    summary: 'Strategy interface that answers two questions for any habit: "Is it due on this day?" and "How well was each period met from start to today?"',
    why: 'By turning every schedule into a flat list of 0.0–1.0 period outcomes, StreakCalculator and StrengthScore work identically for Daily, Weekday, Every-N-Days, and Times-Per-Week habits.',
  },
  'src/main/java/com/habitflow/model/DayBasedSchedule.java': {
    summary: 'Abstract base class (Template Method) shared by Daily, Weekday, and Every-N-Days schedules. Handles date-range looping and open-today logic once so subclasses only implement isDueDay().',
    why: 'Eliminates copy-pasted date loops across 3 schedule classes and guarantees the "never due before creation" and "today doesn\'t break your streak while open" rules can never drift out of sync.',
  },
  'src/main/java/com/habitflow/model/TimesPerWeekSchedule.java': {
    summary: 'Flexible weekly schedule (for example, "3x per week") where any days in a Monday–Sunday week count and streaks measure consecutive completed weeks.',
    why: 'Shows the Strategy pattern paying off: even though weekly goals work completely differently from day-by-day habits, it plugs into the exact same Schedule interface with zero changes to streak or UI math.',
  },
  'src/main/java/com/habitflow/model/PowerUp.java': {
    summary: 'Abstract Strategy base class for all 4 shop items (Streak Freeze, Streak Repair, Double Coins, Rest Day) plus the static factory that builds the right subclass from a database row.',
    why: 'Each power-up owns its own rule inside apply(PowerUpContext, Habit) without importing any DAO—keeping com.habitflow.model 100% pure Java via Dependency Inversion.',
  },
  // Database Tier
  'src/main/resources/schema.sql': {
    summary: 'The complete PostgreSQL database blueprint: 14 normalized tables, foreign keys, CHECK constraints, indexes, and the initial catalog of 4 power-ups and 11 achievements.',
    why: 'Uses CREATE TABLE IF NOT EXISTS and INSERT ... ON CONFLICT DO NOTHING so the app can safely run schema.sql on every startup without wiping data or duplicating seed rows.',
  },
  'src/main/java/com/habitflow/db/Database.java': {
    summary: 'Manages the desktop app\'s single synchronized PostgreSQL JDBC connection and provides Database.inTransaction() for all-or-nothing multi-table writes.',
    why: 'Database.with() is intentionally package-private (no public keyword), making it impossible for UI or Controller classes to run raw SQL—all queries must go through DAOs in com.habitflow.db.',
  },
  'src/main/java/com/habitflow/db/BaseDao.java': {
    summary: 'Abstract generic DAO template extended by all 11 DAOs. Centralizes PreparedStatement binding, resource cleanup, ResultSet iteration, and PostgreSQL RETURNING id inserts.',
    why: 'Subclasses only write the SQL string and mapRow(ResultSet). Every parameter goes through PreparedStatement, eliminating SQL injection risk and boilerplate try-with-resources across the entire app.',
  },
  'src/main/java/com/habitflow/db/HabitDao.java': {
    summary: 'All SQL queries for the habits table (joined with categories), plus polymorphic row reconstruction that turns flat database columns back into the right Habit subclass and Schedule object.',
    why: 'Demonstrates how HabitFlow maps object inheritance onto a single relational table without an ORM like Hibernate: two columns (type, schedule_type/schedule_param) rebuild the exact Java objects in mapRow().',
  },
  // Controller Tier & Pure Logic
  'src/main/java/com/habitflow/controller/Session.java': {
    summary: 'Holds the currently signed-in User in memory and notifies UI listeners (like MainView\'s top header) whenever the user\'s coin balance or profile changes.',
    why: 'Session.start() and Session.end() are package-private so only AuthController can log users in or out, while any screen can read Session.require() or listen for live coin updates.',
  },
  'src/main/java/com/habitflow/controller/AuthController.java': {
    summary: 'Handles account registration, salted PBKDF2 password verification, 5-attempt temporary account lockout, logout, and profile/password updates.',
    why: 'Keeps security rules (password strength, lockout timers, audit trail) in one controller so LoginView and SettingsPage stay thin and can never bypass validation.',
  },
  'src/main/java/com/habitflow/controller/CheckInController.java': {
    summary: 'The core daily workflow: records habit progress (today or past backfills), awards or refunds streak-scaled coins atomically, logs backfill audits, and notifies achievement listeners.',
    why: 'Wraps check-in persistence, coin updates, and ledger logging inside one Database.inTransaction() so a crash or error can never leave coins out of sync with check-ins.',
  },
  'src/main/java/com/habitflow/controller/ShopController.java': {
    summary: 'Powers the coin economy: buying power-ups with atomic balance checks, using owned items polymorphically, and auto-spending Streak Freezes on login to rescue recent missed days.',
    why: 'Uses a private inner class Context implementing PowerUpContext (Dependency Inversion) so PowerUp subclasses can protect days or activate 2x coins without ever knowing about DAOs.',
  },
  'src/main/java/com/habitflow/controller/HabitStats.java': {
    summary: 'Package-private controller helper that combines a Habit, its CheckIn history, and its Schedule to produce a complete HabitSummary (streaks, strength score, completion rate, today status).',
    why: 'Single source of truth for habit metrics: TodayPage, HabitsPage, StatsPage, and SocialController all get identical numbers because every calculation flows through summarize().',
  },
  'src/main/java/com/habitflow/controller/logic/StreakCalculator.java': {
    summary: 'Pure, stateless algorithm that computes current streak, longest streak, and average completion rate from any Schedule\'s list of 0.0–1.0 period outcomes.',
    why: 'Has zero database or UI imports. Because it only inspects numbers (>= 0.999 counts as met), it works identically for daily habits, weekday habits, and weekly goals.',
  },
  'src/main/java/com/habitflow/controller/logic/StrengthScore.java': {
    summary: 'Pure exponential moving average (EMA) that turns a habit\'s history into a forgiving 0–100 strength score—rewarding steady consistency instead of punishing a single missed day.',
    why: 'With a 13-period half-life, one slip after a long streak only dips the score by a few points, giving users a much more motivating signal than an all-or-nothing streak counter.',
  },
  // View Tier (JavaFX GUI)
  'src/main/java/com/habitflow/ui/App.java': {
    summary: 'The JavaFX Application entry point (the only public class in com.habitflow.ui). Initializes PostgreSQL via StartupController and switches the window between LoginView and MainView.',
    why: 'Keeps startup linear and safe: if PostgreSQL is down, the user gets a clear error dialog before any screen tries to load data.',
  },
  'src/main/java/com/habitflow/ui/AppContext.java': {
    summary: 'Creates and holds the single shared set of all 9 controllers used by every UI screen, and wires achievement unlocks to floating toast notifications.',
    why: 'Enforces the 3-tier boundary in one place: UI screens only receive AppContext (never DAOs), and wiring the achievement toast listener once in the constructor prevents duplicate popups across logins.',
  },
  'src/main/java/com/habitflow/ui/MainView.java': {
    summary: 'The authenticated desktop shell: sidebar navigation, top header with live user avatar and coin balance, polymorphic Page container, and animated fade-out toast overlay.',
    why: 'Stores all 8 sidebar screens in a Map<String, Page> and switches between them polymorphically via show(Page), so adding a new screen requires zero changes to navigation logic.',
  },
  'src/main/java/com/habitflow/ui/Page.java': {
    summary: 'Abstract base class for every screen inside MainView. Uses the Template Method pattern: final refresh() clears old UI nodes and delegates to abstract build(VBox).',
    why: 'Guarantees every screen has consistent scrolling, centered layout, and clean state resets on refresh—subclasses just focus on building their own widgets.',
  },
  'src/main/java/com/habitflow/ui/TodayPage.java': {
    summary: 'The main daily dashboard: time-of-day greeting, 4 KPI stat cards, due vs. not-due habit rows with type-specific check-in buttons, and a one-click daily mood selector.',
    why: 'Shows the View tier at its cleanest: it never calculates streaks or coins itself—it reads precomputed HabitSummary records from ctx.stats and sends clicks straight to ctx.checkIns.',
  },
};

// --- Google Docs-style Section Comment Analyzer ---
function stripCommentsAndStrings(line) {
  let out = '';
  let inStr = false;
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '/' && next === '/') break;
    if (ch === '"' || ch === "'") { inStr = true; quote = ch; continue; }
    out += ch;
  }
  return out;
}

function cleanJavadoc(lines, beforeIdx) {
  let i = beforeIdx - 1;
  while (i >= 0 && (lines[i].trim() === '' || lines[i].trim().startsWith('@'))) i--;
  if (i < 0) return { text: '', startIdx: beforeIdx };
  const t = lines[i].trim();
  if (t.startsWith('//')) {
    const startIdx = i;
    const text = t.replace(/^\/\/+\s*-*\s*/, '').replace(/\s*-*$/, '').trim();
    return { text, startIdx };
  }
  if (!t.endsWith('*/')) return { text: '', startIdx: beforeIdx };
  let j = i;
  while (j >= 0 && !lines[j].includes('/*')) j--;
  if (j < 0) return { text: '', startIdx: beforeIdx };
  const text = lines.slice(j, i + 1)
    .map(l => l.replace(/^\s*\/\*\*?/, '').replace(/\*\/\s*$/, '').replace(/^\s*\*\s?/, '').trim())
    .filter(Boolean)
    .join(' ');
  return { text, startIdx: j };
}

// Curated educational walkthroughs for every key method across all 23 key files
const SECTION_GUIDES = {
  // --- Model: Person & User ---
  'Person.Person': {
    goal: 'Initialize immutable identity fields (id, username) and validate the display name.',
    how: 'Protected constructor sets final id and username, then calls setDisplayName() so construction and updates share the exact same validation rule.',
    why: 'Calling the validating setter in the constructor guarantees no subclass can ever create a Person with a blank name.',
  },
  'Person.setDisplayName': {
    goal: 'Guarantee every person always has a non-blank, trimmed display name.',
    how: 'Throws IllegalArgumentException if null or blank, otherwise trims leading/trailing whitespace.',
    why: 'Enforces encapsulation at the model boundary before any controller or DAO writes to PostgreSQL.',
  },
  'Person.roleLabel': {
    goal: 'Return the human-readable role name for this person ("Member" or "Accountability partner").',
    how: 'Abstract method overridden by User and Partner.',
    why: 'Lets UI screens display a person\'s role polymorphically without checking instanceof.',
  },
  'User.setCoins': {
    goal: 'Prevent a User\'s coin balance from ever becoming negative in memory.',
    how: 'Throws IllegalArgumentException if coins < 0 before assigning the private coins field.',
    why: 'Pairs model-level encapsulation with PostgreSQL\'s CHECK (coins >= 0) constraint for defense in depth.',
  },
  'User.roleLabel': {
    goal: 'Identify a signed-in account as a "Member".',
    how: 'Overrides abstract Person.roleLabel() to return the literal string "Member".',
    why: 'Distinguishes full members from unauthenticated Visitors (LoginView) and read-only Partners.',
  },

  // --- Model: Habit ---
  'Habit.getType': {
    goal: 'Identify which kind of habit this object is (BOOLEAN, COUNT, or DURATION).',
    how: 'Abstract method implemented by each subclass so it returns its own HabitType enum constant.',
    why: 'Lets HabitDao save the type string to PostgreSQL and TodayPage render the right quick-action buttons.',
  },
  'Habit.isCompleted': {
    goal: 'Decide whether a logged number counts as finishing the habit for that day.',
    how: 'Abstract hook: BooleanHabit checks value >= 1, while CountHabit and DurationHabit check value >= target.',
    why: 'Controllers never need to ask "what kind of habit is this?"—they just call h.isCompleted(val) polymorphically.',
  },
  'Habit.formatValue': {
    goal: 'Turn a raw numeric check-in into friendly text like "5 / 8 glasses" or "25m / 30m".',
    how: 'Each subclass formats the number according to its own unit and target rules.',
    why: 'Keeps display formatting tied to the domain type instead of duplicating formatting logic across UI screens.',
  },
  'Habit.progress': {
    goal: 'Convert any logged value into a 0.0 to 1.0 progress bar fraction.',
    how: 'Divides value by target and clamps the result between 0 and 1 using Math.max(0, Math.min(1, value / target)).',
    why: 'JavaFX ProgressBar expects a number in [0, 1]; clamping prevents overflow bars when a user logs more than their target.',
  },
  'Habit.completeValue': {
    goal: 'Return the exact value that marks this habit 100% done in one click.',
    how: 'Returns target (which is 1 for BooleanHabit, or e.g. 8 glasses / 30 minutes for Count/Duration habits).',
    why: 'Powers the one-click "Mark done" button in CheckInController.checkIn(habit) without special-casing habit types.',
  },
  'Habit.setName': {
    goal: 'Ensure every habit always has a clean, non-empty name of at most 60 characters.',
    how: 'Rejects null, blank, or >60-char strings with IllegalArgumentException, then trims whitespace before storing.',
    why: 'Defensive encapsulation: invalid habit names are blocked at the model boundary before they ever reach SQL.',
  },
  'Habit.setTarget': {
    goal: 'Prevent zero or negative habit goals.',
    how: 'Throws IllegalArgumentException if target <= 0.',
    why: 'Also protects progress() from ever dividing by zero.',
  },
  'Habit.setSchedule': {
    goal: 'Ensure every habit always has a valid Schedule strategy attached.',
    how: 'Rejects null with IllegalArgumentException before assigning the schedule field.',
    why: 'Because schedule is never null, callers like HabitStats can safely call h.getSchedule().outcomes(...) without null checks.',
  },
  'Habit.setColor': {
    goal: 'Validate that the habit accent color is a standard 6-digit hex code like #3A7D5C.',
    how: 'Matches the string against regex #[0-9A-Fa-f]{6} and throws IllegalArgumentException otherwise.',
    why: 'Prevents malformed strings from breaking JavaFX CSS color rendering or failing the database CHECK constraint.',
  },

  // --- Model: Schedule ---
  'Schedule.isDue': {
    goal: 'Answer whether this habit should appear under "Due today" on a given calendar date.',
    how: 'Takes the date to test, the habit\'s creation date, and the set of already-completed dates.',
    why: 'Weekly schedules like "3x per week" need the done set to know if you already hit 3 days this week.',
  },
  'Schedule.outcomes': {
    goal: 'Translate raw check-in dates into a chronological list of 0.0–1.0 period scores.',
    how: 'Returns one score per due day (or per week for TimesPerWeekSchedule) from start to today, omitting the current period if it is still unfinished.',
    why: 'This is the key abstraction of HabitFlow: StreakCalculator and StrengthScore only read List<Double>, so adding a new schedule never touches streak math.',
  },
  'Schedule.formatStreak': {
    goal: 'Format a streak count with the right singular/plural unit ("1 day", "5 days", "2 weeks").',
    how: 'Checks if n == 1 and strips the trailing "s" from streakUnit() ("days" or "weeks").',
    why: 'Default + static methods on the interface let all 4 schedule implementations share pluralization without duplicating code.',
  },
  'Schedule.of': {
    goal: 'Rebuild the exact Schedule implementation from the two columns stored in PostgreSQL.',
    how: 'Uses a Java 17 switch expression on ScheduleType to instantiate DailySchedule, WeekdaySchedule, TimesPerWeekSchedule, or EveryNDaysSchedule with param.',
    why: 'Acts as a Static Factory Method so HabitDao.mapRow() stays a single clean line.',
  },

  // --- Model: DayBasedSchedule ---
  'DayBasedSchedule.isDueDay': {
    goal: 'Let each day-based subclass answer one simple question: "Does this date match my pattern?"',
    how: 'Abstract protected hook: Daily returns true, Weekday checks its 7-bit mask, EveryNDays checks days % N == 0.',
    why: 'Template Method pattern—subclasses only write 1 line of pattern math and inherit all date-looping logic.',
  },
  'DayBasedSchedule.isDue': {
    goal: 'Guarantee no habit is ever considered due before the day it was created.',
    how: 'Marked final so subclasses cannot bypass it: returns false if day < start, otherwise delegates to isDueDay().',
    why: 'Prevents newly created habits from showing phantom missed days in the past.',
  },
  'DayBasedSchedule.outcomes': {
    goal: 'Build the chronological list of 1.0 (completed) and 0.0 (missed) outcomes for all day-based schedules.',
    how: 'Steps day-by-day from start to today. Skips non-due days. Adds 1.0 if done, 0.0 if missed—but stops before adding today if today is not yet finished.',
    why: 'Skipping an unfinished "today" ensures your active streak stays alive until midnight instead of dropping to 0 every morning.',
  },

  // --- Model: TimesPerWeekSchedule ---
  'TimesPerWeekSchedule.TimesPerWeekSchedule': {
    goal: 'Create a flexible weekly schedule (like "3x per week") with valid bounds.',
    how: 'Validates that times is between 1 and 6 (7x/week is just DailySchedule) and stores it in a final field.',
    why: 'Fails fast on invalid values before anything is saved to the database.',
  },
  'TimesPerWeekSchedule.weekStart': {
    goal: 'Snap any calendar date to the Monday of its Monday–Sunday week.',
    how: 'Calls d.with(DayOfWeek.MONDAY) using Java\'s java.time API.',
    why: 'Gives every day in the same week one consistent anchor date for grouping check-ins.',
  },
  'TimesPerWeekSchedule.countInWeek': {
    goal: 'Count how many days the habit was completed inside one Monday–Sunday week.',
    how: 'Loops from weekStart up to the earlier of upToExclusive or weekStart + 7 days, counting dates present in the done set.',
    why: 'Reused by both isDue() (counting earlier days this week) and outcomes() (counting the full 7-day week).',
  },
  'TimesPerWeekSchedule.isDue': {
    goal: 'Decide if a weekly habit should still be shown as due on a given day.',
    how: 'Returns false before start. Otherwise returns true if the day is already done (so it stays visible on Today) OR if fewer than target days were done earlier this week.',
    why: 'Once you hit your 3rd day of a 3x/week habit, the remaining days of that week automatically move to "Not due today".',
  },
  'TimesPerWeekSchedule.outcomes': {
    goal: 'Turn weekly check-in counts into a list of 0.0–1.0 weekly scores.',
    how: 'Steps week-by-week from start\'s Monday to today\'s Monday, computing min(1.0, completedDays / times). Stops before adding the current week if ratio < 1.0.',
    why: 'Gives partial credit (e.g., 2/3 = 0.67) to StrengthScore while requiring 1.0 (full week met) for StreakCalculator.',
  },

  // --- Model: PowerUp ---
  'PowerUp.PowerUp': {
    goal: 'Construct an immutable PowerUp catalog item with validated positive price.',
    how: 'Checks price > 0 and stores code, name, description, and price in private final fields.',
    why: 'Protected constructor ensures only concrete power-up subclasses can instantiate it.',
  },
  'PowerUp.apply': {
    goal: 'Execute this power-up\'s unique game effect when a user clicks "Use" in the Shop.',
    how: 'Abstract method implemented by StreakFreeze, StreakRepair, DoubleCoins, and RestDay. Returns a toast message, or throws IllegalStateException if it would have no effect.',
    why: 'Throwing on no-op is critical: ShopController runs apply() inside a database transaction, so throwing rolls back the inventory decrement and prevents wasting the item.',
  },
  'PowerUp.create': {
    goal: 'Instantiate the right PowerUp subclass from a database catalog row.',
    how: 'Switches on the code string (STREAK_FREEZE, STREAK_REPAIR, DOUBLE_COINS, REST_DAY) and returns the matching subclass.',
    why: 'Keeps all catalog-to-class mapping in one factory method inside the model.',
  },

  // --- Database: Database ---
  'Database.loadConfig': {
    goal: 'Load PostgreSQL connection settings (URL, user, password) at startup.',
    how: 'Reads /db.properties from the classpath, then checks JVM -Dhabitflow.db.* system properties as optional overrides.',
    why: 'Allows switching databases cleanly from the command line without editing source files.',
  },
  'Database.connection': {
    goal: 'Lazily open (or reopen) the desktop app\'s single JDBC Connection to PostgreSQL.',
    how: 'If connection is null or closed, defaults blank user to the OS username (matching Homebrew/Postgres.app) and calls DriverManager.getConnection().',
    why: 'Zero-config local setup on macOS while automatically recovering if a connection drops.',
  },
  'Database.with': {
    goal: 'Provide the sole gateway for running SQL while locking it inside com.habitflow.db.',
    how: 'Package-private (no public keyword). Synchronizes on LOCK so the UI thread and background reminder thread never collide, executes the lambda, and wraps SQLException in unchecked DataAccessException.',
    why: 'Java\'s package-private visibility makes it a compile-time error for Controllers or UI to execute raw SQL.',
  },
  'Database.inTransaction': {
    goal: 'Run multi-table writes atomically (all succeed together, or all roll back together).',
    how: 'Acquires LOCK. If already inside an outer transaction (autoCommit == false), joins it directly. Otherwise turns off autoCommit, runs work, commits on success, rolls back on any RuntimeException, and restores autoCommit in finally.',
    why: 'Prevents half-written states—like deducting coins without delivering a power-up, or saving a check-in without crediting coins.',
  },
  'Database.runScript': {
    goal: 'Execute a full SQL script from classpath resources (used to run schema.sql on launch).',
    how: 'Reads the UTF-8 resource file into a String and executes it through Database.with() on a JDBC Statement.',
    why: 'Automatically creates any missing tables and catalog rows on first launch with zero manual SQL setup.',
  },

  // --- Database: BaseDao ---
  'BaseDao.mapRow': {
    goal: 'Convert the current row of a JDBC ResultSet into a strongly-typed Java domain object.',
    how: 'Abstract method implemented by each of the 11 DAO subclasses (for example, HabitDao builds a Habit).',
    why: 'Template Method pattern: BaseDao handles all JDBC ceremony while subclasses only describe how to map columns to fields.',
  },
  'BaseDao.queryList': {
    goal: 'Run a parameterized SELECT query and return every matching row as a List<T>.',
    how: 'Calls Database.with(), prepares the statement via prepare(), loops while (rs.next()), calls mapRow(rs) for each row, and closes resources via try-with-resources.',
    why: 'Eliminates repetitive JDBC boilerplate and guarantees ResultSets and PreparedStatements never leak.',
  },
  'BaseDao.queryOne': {
    goal: 'Fetch at most one matching row wrapped in an Optional<T>.',
    how: 'Delegates to queryList() and returns Optional.empty() when no row matches or Optional.of(first) when found.',
    why: 'Returning Optional forces callers to explicitly handle "not found" instead of risking NullPointerException.',
  },
  'BaseDao.queryRaw': {
    goal: 'Run custom aggregate or join queries whose columns don\'t map to the DAO\'s main type T.',
    how: 'Accepts a custom RowMapper<R> lambda alongside the SQL and parameters.',
    why: 'Powers analytics queries (like daily totals or counts) without creating throwaway DAO classes.',
  },
  'BaseDao.insert': {
    goal: 'Insert a new row and immediately return PostgreSQL\'s auto-generated SERIAL id.',
    how: 'Runs an INSERT ... RETURNING id statement via scalar() and casts the returned long key to int.',
    why: 'Lets controllers and UI immediately use the new database ID (for example, to attach a reminder right after creating a habit).',
  },
  'BaseDao.prepare': {
    goal: 'Bind every query parameter safely without SQL injection.',
    how: 'Loops through varargs params, converting Java 8+ java.time objects (LocalDate, LocalDateTime, LocalTime) to java.sql types and binding everything else with setObject().',
    why: 'User input is NEVER concatenated into SQL strings—PostgreSQL always treats parameters as pure data, never executable SQL.',
  },

  // --- Database: HabitDao ---
  'HabitDao.mapRow': {
    goal: 'Reconstruct the exact Habit subclass and Schedule strategy from a flat SQL row.',
    how: 'Calls HabitType.valueOf(type).newHabit() to create BooleanHabit, CountHabit, or DurationHabit, populates fields, and rebuilds the Schedule via Schedule.of(schedule_type, schedule_param).',
    why: 'Maps Java inheritance cleanly onto a single PostgreSQL table without needing a heavy ORM framework.',
  },
  'HabitDao.list': {
    goal: 'Load all habits belonging to a user (optionally including archived ones).',
    how: 'Left-joins categories so category_name is fetched in one query, filters by user_id and archive flag, and orders active habits first.',
    why: 'JOINing categories up front avoids the N+1 query problem when rendering the Today or Habits list.',
  },
  'HabitDao.insert': {
    goal: 'Persist a new Habit and write its database-generated ID back onto the object.',
    how: 'Passes all 12 fields as parameters to BaseDao.insert() with RETURNING id, then calls h.setId(newId).',
    why: 'Mutating h.setId() in place gives the caller a ready-to-use Habit object with its real primary key.',
  },

  // --- Controller: Session ---
  'Session.require': {
    goal: 'Return the currently logged-in User, or fail fast if nobody is signed in.',
    how: 'Reads the volatile current user reference and throws IllegalStateException if null.',
    why: 'Every controller starts with Session.require() so user data is always scoped to the authenticated account.',
  },
  'Session.start': {
    goal: 'Begin a logged-in session and alert all UI listeners.',
    how: 'Package-private so only AuthController can call it: stores the User in current and calls fire().',
    why: 'Restricting start() and end() to package-private prevents UI screens from forging or mutating login state directly.',
  },
  'Session.refresh': {
    goal: 'Reload the active user from PostgreSQL and push the updated coin balance to the UI.',
    how: 'Re-fetches the user row by ID via UserDao, replaces current, and notifies every registered Runnable listener.',
    why: 'Observer pattern: CheckInController and ShopController just call Session.refresh() and MainView\'s top header updates automatically.',
  },

  // --- Controller: AuthController ---
  'AuthController.register': {
    goal: 'Create a brand-new user account safely and sign them in immediately.',
    how: 'Normalizes username to lowercase, validates format/password/confirmation, checks uniqueness, generates a random 16-byte salt, hashes the password with PBKDF2, inserts the user, logs REGISTER to audit_log, and starts the Session.',
    why: 'Passwords are never stored in plaintext—each account gets its own unique random salt.',
  },
  'AuthController.login': {
    goal: 'Authenticate a user while blocking brute-force password guessing.',
    how: 'Fetches stored credentials, rejects if lockedUntil is still in the future, verifies the password hash with PasswordHasher.verify(). On failure, increments failedAttempts and locks for 5 minutes at 5 tries. On success, resets failures, logs LOGIN, and starts Session.',
    why: 'Returns the same generic "Wrong username or password" message for unknown usernames so attackers cannot enumerate valid accounts.',
  },
  'AuthController.changePassword': {
    goal: 'Let a signed-in user rotate their password with a brand-new salt.',
    how: 'Verifies the current password first, validates the new password and confirmation, generates a fresh salt, updates the hash in PostgreSQL, and writes an audit entry.',
    why: 'Generating a new salt on every password change ensures old and new hashes share nothing.',
  },

  // --- Controller: CheckInController ---
  'CheckInController.checkIn': {
    goal: 'Record progress for a habit (today or past backfill), award or refund coins atomically, and trigger achievement checks.',
    how: '1) Validates ownership, date bounds, non-negative value, and 200-char note. 2) Inside Database.inTransaction(), compares previous vs. new completion: awards streak-scaled coins (x2 if Double Coins is active) on first completion today, or refunds coins on undo. 3) Upserts (or deletes if 0) the check_ins row and audits past backfills. 4) Refreshes Session and notifies all CheckInListeners.',
    why: 'Demonstrates 3-way method overloading (1-arg, 2-arg, 4-arg), atomic transactions, and the Observer pattern (AchievementController listens without tight coupling).',
  },
  'CheckInController.undo': {
    goal: 'Clear a habit\'s check-in for a specific day and refund any coins earned for it.',
    how: 'Delegates directly to checkIn(habit, 0, day, null), reusing all validation, refund, and transaction logic.',
    why: 'Zero duplicated logic—setting a day to 0 with no note automatically deletes the row and refunds coins.',
  },
  'CheckInController.saveJournal': {
    goal: 'Save or update the user\'s 1–5 daily mood rating and optional reflection note.',
    how: 'Rejects future dates, trims/validates the note up to 500 chars, upserts into mood_journal, and triggers achievement evaluation.',
    why: 'Upserting by (user_id, day) means clicking a different mood button on TodayPage smoothly updates today\'s entry instead of creating duplicates.',
  },

  // --- Controller: ShopController ---
  'ShopController.buy': {
    goal: 'Purchase one power-up atomically without ever allowing negative coins or more than 3 Streak Freezes.',
    how: 'Inside Database.inTransaction(): checks MAX_FREEZES cap, atomically deducts coins via UserDao.addCoins(-price), logs the spend in coin_ledger, increments user_power_ups, and writes an audit entry. Afterward refreshes Session and evaluates achievements.',
    why: 'If the user doesn\'t have enough coins, addCoins() returns false and throws before any item is delivered.',
  },
  'ShopController.use': {
    goal: 'Activate an owned power-up polymorphically without wasting it if it has no effect.',
    how: 'Checks target habit if p.needsHabit() is true. Inside Database.inTransaction(), decrements inventory by 1 and calls p.apply(new Context(id), target). If apply() throws (e.g., no missed day to freeze), the transaction rolls back and the item stays in inventory.',
    why: 'ShopController doesn\'t have a single if/else per power-up type—all 4 power-ups run through one polymorphic p.apply() call.',
  },
  'ShopController.autoApplyFreezes': {
    goal: 'Automatically rescue active streaks at login using owned Streak Freezes.',
    how: 'In one transaction, checks every active habit for missed due days in the last 3 days. Verifies the habit actually had an active streak right before the miss, then spends one Streak Freeze per missed day and marks those days protected.',
    why: 'Prevents wasting a Streak Freeze on a habit whose streak was already 0.',
  },
  'ShopController.Context': {
    goal: 'Bridge pure Model PowerUp subclasses to the database without letting model import DAOs.',
    how: 'Private inner class implementing PowerUpContext. Exposes only safe, narrow operations: missedDueDays(), isDoneOn(), protectDays(), isEffectActive(), and activateEffect().',
    why: 'Classic Dependency Inversion: the Model defines the interface it needs, and the Controller supplies the database-backed implementation.',
  },

  // --- Controller: HabitStats ---
  'HabitStats.doneDays': {
    goal: 'Collect every calendar date that counts as "satisfied" for a habit.',
    how: 'Iterates through check-ins and adds c.day() whenever the day is protected by a power-up (c.frozen()) OR h.isCompleted(c.value()) is true.',
    why: 'Treating frozen/protected days identically to completed days here means every schedule, streak, and strength calculation respects power-ups automatically.',
  },
  'HabitStats.summarize': {
    goal: 'Compute all live metrics for one habit in a single immutable HabitSummary record.',
    how: 'Calls doneDays(), asks h.getSchedule().outcomes() for period scores, feeds them into StreakCalculator and StrengthScore (using half-life 3 for weekly habits, 13 for daily), and packages everything with today\'s progress.',
    why: 'Works identically for every combination of Habit subtype (3) × Schedule subtype (4) = 12 combinations.',
  },
  'HabitStats.summarizeAll': {
    goal: 'Summarize every habit for a user in just 2 SQL queries total.',
    how: 'Loads all check-ins grouped by habit ID in one query (checkIns.allForUser), loads all habits in a second query, then calls summarize() in memory for each habit.',
    why: 'Avoids running a separate SQL query per habit, keeping the Today and Habits pages instant.',
  },

  // --- Pure Logic: StreakCalculator & StrengthScore ---
  'StreakCalculator.current': {
    goal: 'Count how many consecutive most-recent periods were fully met.',
    how: 'Walks backward from the last item in outcomes, incrementing streak while each score is >= 0.999 (floating-point safe check for 1.0).',
    why: 'Stops at the very first miss from the end, giving the exact active streak in O(n) time.',
  },
  'StreakCalculator.longest': {
    goal: 'Find the best uninterrupted streak in the habit\'s entire history.',
    how: 'Scans left-to-right, incrementing a running counter on >= 0.999, resetting to 0 on any miss, and tracking Math.max(best, run).',
    why: 'Single linear pass with O(1) extra memory.',
  },
  'StreakCalculator.completionRate': {
    goal: 'Calculate the overall average completion rate (0.0 to 1.0) across all periods.',
    how: 'Streams outcomes as primitives and computes their arithmetic mean, defaulting to 0 if the list is empty.',
    why: 'Because weekly schedules produce partial ratios like 0.67, averaging outcomes gives credit for partial weeks too.',
  },
  'StrengthScore.compute': {
    goal: 'Calculate a forgiving 0–100 Habit Strength score using an exponential moving average (EMA).',
    how: 'Derives decay weight alpha = 1 - 0.5^(1 / halfLife) (default half-life 13 periods), then folds every period outcome with score = score * (1 - alpha) + alpha * o and rounds to an integer percentage.',
    why: 'Recent days weigh more than old days, so building a habit steadily climbs toward 100 and one missed day only causes a gentle dip.',
  },

  // --- View: App ---
  'App.start': {
    goal: 'Launch the JavaFX window, verify PostgreSQL is reachable, and show the Login screen.',
    how: 'Configures the Stage title and minimum window size, calls StartupController.initDatabase() (showing an error dialog and exiting cleanly if PostgreSQL is down), then calls showLogin() and stage.show().',
    why: 'App calls StartupController instead of Database directly so com.habitflow.ui never imports com.habitflow.db.',
  },
  'App.setRoot': {
    goal: 'Swap between LoginView and MainView without flickering or recreating the OS window.',
    how: 'Creates the Scene and attaches styles.css on first call; on later calls simply replaces scene.setRoot(root).',
    why: 'Reusing one Scene preserves window size, position, and loaded CSS stylesheets across login/logout.',
  },

  // --- View: AppContext ---
  'AppContext.AppContext': {
    goal: 'Wire the single global achievement toast notification once for the entire app lifetime.',
    how: 'Subscribes a lambda to achievements.addUnlockListener() that triggers Ui.toast() with the badge name and bonus coins.',
    why: 'Doing this once in AppContext instead of inside MainView prevents duplicate toasts if a user logs out and logs back in.',
  },

  // --- View: MainView ---
  'MainView.MainView': {
    goal: 'Assemble the desktop shell: sidebar navigation, top header bar, page container, and toast overlay.',
    how: 'Registers all 8 sidebar Page subclasses in a LinkedHashMap, builds grouped sidebar buttons, stacks a click-through toasts VBox over the active page in a StackPane, and subscribes updateHeader() to Session changes.',
    why: 'Wrapping callbacks in Platform.runLater() guarantees UI updates from background threads (like reminders) always run safely on the JavaFX Application Thread.',
  },
  'MainView.onLoggedIn': {
    goal: 'Run post-login routines right after a user signs in.',
    how: 'Shows TodayPage, calls ctx.shop.autoApplyFreezes() to rescue any missed streaks (toasting each saved day), starts the background reminder checker, and refreshes the page.',
    why: 'Keeps login transitions smooth while immediately surfacing saved streaks and due reminders.',
  },
  'MainView.show': {
    goal: 'Switch the active screen polymorphically across any Page subclass.',
    how: 'Updates current, sets the top header title via page.title(), highlights the matching sidebar button, calls page.refresh() to load fresh data, and puts page.view() underneath the toasts layer.',
    why: 'Works for both sidebar pages and drill-down pages like HabitDetailPage with one unified method.',
  },
  'MainView.toast': {
    goal: 'Display a non-blocking floating notification that fades out automatically.',
    how: 'Adds a styled Label to the top-right toasts overlay, waits 3.5 seconds via PauseTransition, fades opacity to 0 over 400ms via FadeTransition, then removes the node.',
    why: 'Gives instant feedback for coins, achievements, and reminders without interrupting the user with modal popups.',
  },

  // --- View: Page ---
  'Page.Page': {
    goal: 'Set up the shared scrollable, centered layout container for every screen.',
    how: 'Stores ctx and main, places a styled VBox inside a centered StackPane, and wraps it in a ScrollPane via Ui.scroll().',
    why: 'Subclasses never have to repeat scrollbars, padding, or max-width centering.',
  },
  'Page.refresh': {
    goal: 'Rebuild a screen from fresh controller data using the Template Method pattern.',
    how: 'Marked final so subclasses cannot skip cleanup: clears all old child nodes from content, then calls protected abstract build(content).',
    why: 'Guarantees zero stale UI widgets after any check-in, edit, or navigation.',
  },

  // --- View: TodayPage ---
  'TodayPage.build': {
    goal: 'Render the Today dashboard: greeting, 4 KPI cards, due/not-due habit lists, and daily mood picker.',
    how: 'Loads precomputed HabitSummary records and Overview stats from ctx.stats, builds the day progress bar and 4 stat cards, splits habits into dueToday vs. notDue (sorting incomplete habits to the top), and appends habitRow() cards plus moodCard().',
    why: 'Zero business logic in the UI—TodayPage only lays out data computed by controllers.',
  },
  'TodayPage.habitRow': {
    goal: 'Render one interactive habit card showing color dot, schedule, streak, progress bar, and action controls.',
    how: 'Binds a click on the left info area to open HabitDetailPage, formats the streak via h.getSchedule().formatStreak(), fills a ProgressBar via h.progress(), and attaches type-specific controls on the right.',
    why: 'Adds the .done CSS class when completed so finished habits visually settle into a muted completed state.',
  },
  'TodayPage.controls': {
    goal: 'Show the right quick-progress buttons for each habit type.',
    how: 'Switches on h.getType(): Boolean gets Done/Mark done, Count gets - and +1, Duration gets +5m, +15m, and Done/Reset. Each button calls ctx.checkIns and passes the Result to act().',
    why: 'Tailors the interaction to how people actually log each habit—one tap for yes/no, increments for counts and minutes.',
  },
  'TodayPage.act': {
    goal: 'Give immediate coin feedback after a check-in click and refresh the screen.',
    how: 'Reads CheckInController.Result.coinsDelta() to show a "+N coins" or "undone" toast, then calls refresh() to update progress bars and streaks.',
    why: 'Keeps the feedback loop tight and instant after every single click.',
  },
  'TodayPage.moodCard': {
    goal: 'Let users log or change today\'s 1–5 mood rating in one click right from the dashboard.',
    how: 'Reads today\'s existing mood (if any), renders 5 toggle buttons via Ui.moodButtons(), and on click calls ctx.checkIns.saveJournal() while preserving any existing journal reflection note.',
    why: 'Lowering friction to a single click encourages daily mood tracking, which feeds the mood-habit correlation on Statistics.',
  },
};

function describeJavaMember(name, kind, headerLine, bodyText, javadoc, isOverride, meta) {
  const key = `${meta.typeName}.${name}`;
  const isAbstract = /\babstract\b/.test(headerLine);
  const isStatic = /\bstatic\b/.test(headerLine);
  const isFinal = /\bfinal\b/.test(headerLine);
  const throwsMsgs = [...bodyText.matchAll(/throw\s+new\s+\w+Exception\("([^"]+)"/g)].map(m => m[1]);
  const sqlOps = [];
  if (/\bSELECT\b/.test(bodyText)) sqlOps.push('SELECT');
  if (/\bINSERT\s+INTO\b/.test(bodyText)) sqlOps.push('INSERT');
  if (/\bUPDATE\s+\w+\s+SET\b/.test(bodyText)) sqlOps.push('UPDATE');
  if (/\bDELETE\s+FROM\b/.test(bodyText)) sqlOps.push('DELETE');
  const hasReturning = /\bRETURNING\s+id\b/i.test(bodyText);
  const hasTx = bodyText.includes('Database.inTransaction');
  const hasSession = bodyText.includes('Session.require()');
  const hasAudit = bodyText.includes('audit.log(');
  const hasAch = bodyText.includes('achievements.evaluate()') || bodyText.includes('listeners.forEach');
  const hasCoins = bodyText.includes('addCoins(') || bodyText.includes('CoinCalculator');
  const hasUiBtn = bodyText.includes('Ui.button(') || bodyText.includes('setOnAction(') || bodyText.includes('setOnMouseClicked(');
  const hasToast = bodyText.includes('Ui.toast(');
  const hasSwitch = /\bswitch\s*\(/.test(bodyText);
  const hasLoop = /\b(for|while)\s*\(/.test(bodyText);
  const hasStream = bodyText.includes('.stream()');
  const hasSync = bodyText.includes('synchronized');
  const hasRunLater = bodyText.includes('Platform.runLater');

  let tag = 'Method';
  if (kind === 'constructor') tag = 'Constructor';
  else if (kind === 'fields') tag = 'State & Fields';
  else if (kind === 'inner') tag = 'Nested Type';
  else if (isAbstract) tag = 'Abstract Contract';
  else if (hasTx) tag = 'Transaction';
  else if (sqlOps.length) tag = 'SQL · ' + sqlOps[0];
  else if (isOverride) tag = '@Override';
  else if (hasUiBtn) tag = 'UI & Events';
  else if (throwsMsgs.length) tag = 'Validation';
  else if (isStatic) tag = 'Static Helper';

  // Use curated deep guide when available (for main overload or specific method)
  const guide = SECTION_GUIDES[key];
  if (guide && !(key === 'CheckInController.checkIn' && bodyText.split('\n').length < 10)) {
    return { tag, goal: guide.goal, how: guide.how, why: guide.why || '' };
  }

  // Extract SQL tables touched if any
  const sqlTables = [...bodyText.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-z_]+)\b/g)]
    .map(m => m[1])
    .filter(t => !['select', 'set', 'values', 'where', 'and', 'or'].includes(t));
  const uniqueTables = [...new Set(sqlTables)];

  // Build "goal" (what it is trying to implement)
  let goal = '';
  if (javadoc) {
    goal = javadoc.endsWith('.') ? javadoc : javadoc + '.';
  } else if (kind === 'fields') {
    goal = `Define the encapsulated state and collaborator dependencies owned by ${meta.typeName}.`;
  } else if (kind === 'constructor') {
    goal = `Construct a valid ${meta.typeName} instance and wire its initial state or collaborators.`;
  } else if (kind === 'inner') {
    goal = `Define nested type ${name} to keep helper data/behavior tightly scoped inside ${meta.typeName}.`;
  } else if (isAbstract) {
    goal = `Declare a required polymorphic hook that every concrete subclass of ${meta.typeName} must implement.`;
  } else if (name === 'mapRow') {
    goal = `Translate a single PostgreSQL ResultSet row into a strongly-typed ${meta.typeName.replace(/Dao$/, '')} domain object.`;
  } else if (name === 'build' && meta.extendsType === 'Page') {
    goal = `Construct the full JavaFX layout and interactive controls for the ${meta.typeName.replace(/Page$/, '')} screen.`;
  } else if (name === 'title' && meta.extendsType === 'Page') {
    goal = `Provide the screen title shown in MainView's top navigation header.`;
  } else if (sqlOps.length) {
    goal = `Run a ${sqlOps.join('/')} database operation${uniqueTables.length ? ` against ${uniqueTables.join(', ')}` : ''}.`;
  } else if (hasUiBtn) {
    goal = `Build interactive JavaFX controls for ${name}() and connect user clicks to controller actions.`;
  } else if (isOverride) {
    goal = `Specialize ${name}() for ${meta.typeName} to fulfill its parent contract polymorphically.`;
  } else {
    goal = `Implement the ${name}() operation for ${meta.typeName}.`;
  }

  // Build "how" (how the code actually works step-by-step)
  const steps = [];
  if (kind === 'fields') {
    const fList = (meta._fieldNames || []).slice(0, 8).join(', ');
    steps.push(`Declares fields (${fList || 'class constants'})${bodyText.includes('private ') ? ' as private to preserve encapsulation' : ''}${bodyText.includes('final ') ? ' and final where references should not be reassigned' : ''}.`);
  } else if (isAbstract) {
    steps.push(`Has no body here; Java enforces at compile time that subclasses override ${name}() and resolves calls via dynamic dispatch at runtime.`);
  } else {
    if (hasSession) steps.push('Fetches the active user via Session.require() so all operations stay scoped to the logged-in account.');
    if (throwsMsgs.length) steps.push(`Validates preconditions up front and throws an exception on bad input (for example, "${throwsMsgs[0]}").`);
    if (hasSync) steps.push('Synchronizes on a lock object so concurrent threads cannot interleave shared state.');
    if (hasTx) steps.push('Runs the core steps inside Database.inTransaction() so every write commits together or rolls back cleanly on error.');
    if (sqlOps.length) {
      const daoHelper = bodyText.includes('queryList(') ? 'BaseDao.queryList()' : bodyText.includes('queryOne(') ? 'BaseDao.queryOne()' : bodyText.includes('queryRaw(') ? 'BaseDao.queryRaw()' : bodyText.includes('scalar(') ? 'BaseDao.scalar()' : bodyText.includes('insert(') ? 'BaseDao.insert()' : 'BaseDao.update()';
      const clauses = [];
      if (/\bJOIN\b/i.test(bodyText)) clauses.push('JOIN');
      if (/\bWHERE\b/i.test(bodyText)) clauses.push('WHERE filter');
      if (/\bON CONFLICT\b/i.test(bodyText)) clauses.push('ON CONFLICT upsert');
      if (/\bGROUP BY\b/i.test(bodyText)) clauses.push('GROUP BY aggregate');
      if (/\bORDER BY\b/i.test(bodyText)) clauses.push('ORDER BY sort');
      if (hasReturning) clauses.push('RETURNING id');
      steps.push(`Executes parameterized SQL via ${daoHelper}${uniqueTables.length ? ` on ${uniqueTables.join(', ')}` : ''}${clauses.length ? ` using ${clauses.join(', ')}` : ''}.`);
    }
    if (hasStream) steps.push('Processes the collection with a Java Stream pipeline (filtering/mapping/sorting without mutating the source list).');
    else if (hasLoop) steps.push('Iterates through the range/collection with a loop to accumulate or transform each item.');
    if (hasSwitch) steps.push('Uses a Java 17 switch expression to branch cleanly across enum or type cases.');
    if (hasCoins) steps.push('Adjusts the user\'s coin balance and appends an entry to coin_ledger.');
    if (hasAudit) steps.push('Records the action in audit_log for the user\'s activity history.');
    if (hasAch) steps.push('Notifies achievement evaluators/listeners so newly met milestones unlock right away.');
    if (hasRunLater) steps.push('Marshals UI updates back onto the JavaFX Application Thread with Platform.runLater().');
    if (hasUiBtn) steps.push('Creates JavaFX nodes via Ui helpers and binds click/action handlers to controller methods.');
    if (hasToast) steps.push('Shows a temporary toast banner via Ui.toast() to give immediate user feedback.');
    if (bodyText.includes('refresh()')) steps.push('Calls refresh() after mutating state so the screen immediately reflects the latest database values.');
  }

  if (steps.length === 0) {
    if (bodyText.includes('return ')) {
      const retLine = bodyText.split('\n').find(l => l.trim().startsWith('return '))?.trim() || '';
      const expr = retLine.replace(/^return\s+/, '').replace(/;$/, '').slice(0, 70);
      steps.push(`Computes and returns \`${expr}\`${isStatic ? ' without mutating any instance state' : ''}.`);
    } else if (kind === 'constructor') {
      steps.push(`Assigns constructor arguments to instance fields${bodyText.includes('super(') ? ' and chains to the superclass constructor via super()' : ''}.`);
    } else {
      steps.push(`Updates state or delegates directly to collaborator methods${isFinal ? ' (final to lock this behavior for subclasses)' : ''}.`);
    }
  }

  return { tag, goal, how: steps.join(' ') };
}

function extractJavaSections(content, meta) {
  const lines = content.split('\n');
  const sections = [];

  // Find opening line of top-level type declaration
  let classOpenLine = -1;
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const clean = stripCommentsAndStrings(lines[i]);
    if (classOpenLine === -1 && /\b(class|interface|enum|record)\s+\w+/.test(clean) && clean.includes('{')) {
      classOpenLine = i;
      depth = (clean.match(/\{/g) || []).length - (clean.match(/\}/g) || []).length;
      break;
    }
  }

  // Handle single-line or compact record/enum files cleanly
  if (classOpenLine === -1 || depth <= 0) {
    const declStart = Math.max(1, lines.findIndex(l => /\b(class|interface|enum|record)\s+\w+/.test(l)) + 1);
    sections.push({
      startLine: declStart,
      endLine: lines.length,
      title: `${meta.kind} ${meta.typeName}`,
      tag: meta.kind === 'record' ? 'Java Record' : meta.kind === 'enum' ? 'Enum' : 'Definition',
      goal: meta.javadoc || `Represent an immutable ${meta.typeName} value in the ${meta.pkg} package.`,
      how: meta.kind === 'record'
        ? `Java 17 record auto-generates private final fields, canonical constructor, accessors, equals(), hashCode(), and toString() with zero boilerplate.`
        : `Compact ${meta.visibility} ${meta.kind} definition (${lines.length} lines) shared across tiers.`,
    });
    return sections;
  }

  // Scan members at depth === 1 inside the top-level type
  const rawMembers = [];
  let fieldStart = -1;
  let fieldEnd = -1;
  const fieldNames = [];

  let i = classOpenLine + 1;
  while (i < lines.length && depth > 0) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const clean = stripCommentsAndStrings(raw);
    const opens = (clean.match(/\{/g) || []).length;
    const closes = (clean.match(/\}/g) || []).length;

    if (depth === 1) {
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || (trimmed.startsWith('@') && !clean.includes('{') && !clean.includes(';'))) {
        i++;
        continue;
      }
      if (trimmed === '}') {
        depth += opens - closes;
        i++;
        continue;
      }

      // Check if it's a field/constant (ends with ; and no method parens before = or ;)
      const beforeEq = clean.split('=')[0];
      const looksLikeMethod = /\w+\s*\(/.test(beforeEq) && !/\b(new|class|interface|enum|record)\b/.test(beforeEq);
      const looksLikeInnerType = /\b(class|interface|enum|record)\s+(\w+)/.test(clean);

      if (!looksLikeMethod && !looksLikeInnerType && opens === 0) {
        if (fieldStart === -1) fieldStart = i;
        // Advance through multi-line field initialization until ';'
        let end = i;
        while (end < lines.length && !stripCommentsAndStrings(lines[end]).includes(';')) end++;
        fieldEnd = end;
        const fm = beforeEq.match(/(\w+)\s*;?\s*$/);
        if (fm) fieldNames.push(fm[1]);
        i = end + 1;
        continue;
      }

      // Flush accumulated fields block if any
      if (fieldStart !== -1) {
        rawMembers.push({
          kind: 'fields',
          name: 'Fields & Constants',
          startIdx: fieldStart,
          endIdx: fieldEnd,
          headerLine: lines[fieldStart],
          fieldNames: [...fieldNames],
        });
        fieldStart = -1;
        fieldEnd = -1;
        fieldNames.length = 0;
      }

      // Determine block end via brace matching (or ';' for abstract/interface methods)
      let startIdx = i;
      // Include annotations directly above
      while (startIdx > classOpenLine + 1 && lines[startIdx - 1].trim().startsWith('@') && !lines[startIdx - 1].includes('{') && !lines[startIdx - 1].includes(';')) startIdx--;
      const jd = cleanJavadoc(lines, startIdx);

      let endIdx = i;
      let localDepth = depth + opens - closes;
      if (opens === 0 && !clean.includes(';')) {
        // Multi-line signature before '{' or ';'
        while (endIdx + 1 < lines.length) {
          endIdx++;
          const c2 = stripCommentsAndStrings(lines[endIdx]);
          const o2 = (c2.match(/\{/g) || []).length;
          const cl2 = (c2.match(/\}/g) || []).length;
          localDepth += o2 - cl2;
          if (o2 > 0 || c2.includes(';')) break;
        }
      }
      if (localDepth > 1) {
        while (endIdx + 1 < lines.length && localDepth > 1) {
          endIdx++;
          const c2 = stripCommentsAndStrings(lines[endIdx]);
          localDepth += (c2.match(/\{/g) || []).length - (c2.match(/\}/g) || []).length;
        }
      }

      // Extract member name & kind
      let mKind = 'method';
      let mName = 'block';
      const innerMatch = clean.match(/\b(class|interface|enum|record)\s+(\w+)/);
      const ctorMatch = clean.match(new RegExp(`\\b(${meta.typeName})\\s*\\(`));
      const methMatch = clean.match(/\b(\w+)\s*\(/);
      if (innerMatch) { mKind = 'inner'; mName = innerMatch[2]; }
      else if (ctorMatch) { mKind = 'constructor'; mName = meta.typeName; }
      else if (methMatch) { mKind = 'method'; mName = methMatch[1]; }

      const isOverride = lines.slice(startIdx, i + 1).some(l => l.includes('@Override'));
      rawMembers.push({
        kind: mKind,
        name: mName,
        startIdx,
        endIdx,
        headerLine: lines[i],
        javadoc: jd.text,
        isOverride,
        bodyText: lines.slice(startIdx, endIdx + 1).join('\n'),
      });
      depth = localDepth;
      i = endIdx + 1;
      continue;
    }

    depth += opens - closes;
    i++;
  }

  // Flush trailing fields (e.g., enum constants only)
  if (fieldStart !== -1) {
    rawMembers.push({
      kind: 'fields',
      name: 'Fields & Constants',
      startIdx: fieldStart,
      endIdx: fieldEnd,
      headerLine: lines[fieldStart],
      fieldNames: [...fieldNames],
    });
  }

  // Add class header + fields as Section 1
  const firstMember = rawMembers[0];
  if (firstMember && firstMember.kind === 'fields') {
    const fList = firstMember.fieldNames.slice(0, 8).join(', ') + (firstMember.fieldNames.length > 8 ? ', ...' : '');
    const inh = [meta.extendsType ? `extends ${meta.extendsType}` : '', meta.implementsTypes.length ? `implements ${meta.implementsTypes.join(', ')}` : ''].filter(Boolean).join(' ');
    sections.push({
      startLine: classOpenLine + 1,
      endLine: firstMember.endIdx + 1,
      title: `Class Header & Fields (${meta.typeName})`,
      tag: meta.modifier ? `${meta.modifier} ${meta.kind}` : meta.kind,
      goal: `Define the ${meta.typeName} type${inh ? ` (${inh})` : ''} and declare the state/collaborators it owns.`,
      how: `Uses ${meta.visibility} visibility${meta.modifier ? ` with "${meta.modifier}"` : ''} and encapsulates fields (${fList || 'class constants'}) so outside callers interact through controlled methods.`,
    });
    rawMembers.shift();
  } else {
    const inh = [meta.extendsType ? `extends ${meta.extendsType}` : '', meta.implementsTypes.length ? `implements ${meta.implementsTypes.join(', ')}` : ''].filter(Boolean).join(' ');
    sections.push({
      startLine: classOpenLine + 1,
      endLine: classOpenLine + 1,
      title: `Declaration (${meta.typeName})`,
      tag: meta.modifier ? `${meta.modifier} ${meta.kind}` : meta.kind,
      goal: `Declare the ${meta.typeName} ${meta.kind}${inh ? ` (${inh})` : ''} within package ${meta.pkg}.`,
      how: `Uses ${meta.visibility} visibility${meta.modifier ? ` and "${meta.modifier}" modifier` : ''} to control cross-package access and inheritance.`,
    });
  }

  // Group adjacent tiny 1-2 line methods (like getters/setters or metadata overrides) to avoid clutter
  let idx = 0;
  while (idx < rawMembers.length) {
    const m = rawMembers[idx];
    const span = m.endIdx - m.startIdx + 1;
    const isTinyMethod = m.kind === 'method' && span <= 2 && !m.javadoc && !SECTION_GUIDES[`${meta.typeName}.${m.name}`] && !/SELECT|INSERT|UPDATE|DELETE/.test(m.bodyText);

    if (isTinyMethod) {
      const group = [m];
      while (idx + 1 < rawMembers.length) {
        const nxt = rawMembers[idx + 1];
        const nxtSpan = nxt.endIdx - nxt.startIdx + 1;
        const nxtTiny = nxt.kind === 'method' && nxtSpan <= 2 && !nxt.javadoc && !SECTION_GUIDES[`${meta.typeName}.${nxt.name}`] && !/SELECT|INSERT|UPDATE|DELETE/.test(nxt.bodyText);
        if (nxtTiny && (nxt.startIdx - group[group.length - 1].endIdx) <= 2) {
          group.push(nxt);
          idx++;
        } else break;
      }
      if (group.length >= 2) {
        const names = group.map(g => g.name + '()').join(', ');
        const allOverride = group.every(g => g.isOverride);
        const allGetSet = group.every(g => /^(get|set|is)[A-Z]/.test(g.name));
        sections.push({
          startLine: group[0].startIdx + 1,
          endLine: group[group.length - 1].endIdx + 1,
          title: allOverride ? `Contract Overrides (${group.length} methods)` : allGetSet ? `Accessors (${group.length} getters/setters)` : `Compact Helpers (${group.length} methods)`,
          tag: allOverride ? '@Override' : allGetSet ? 'Encapsulation' : 'Helpers',
          goal: allOverride
            ? `Fulfill the ${meta.extendsType || meta.implementsTypes[0] || 'parent'} metadata/behavior contract for ${meta.typeName}.`
            : allGetSet
            ? `Expose ${meta.typeName}'s private fields safely without making fields public.`
            : `Provide small single-purpose helper methods (${names}) used by the rest of ${meta.typeName}.`,
          how: `Each one-line method (${names}) directly returns or assigns its backing value/constant with zero side effects.`,
        });
        idx++;
        continue;
      }
    }

    const desc = describeJavaMember(m.name, m.kind, m.headerLine, m.bodyText || '', m.javadoc || '', m.isOverride, { ...meta, _fieldNames: m.fieldNames });
    const title = m.kind === 'constructor'
      ? `${m.name}() Constructor`
      : m.kind === 'inner'
      ? `Nested ${m.name}`
      : m.kind === 'fields'
      ? 'Fields & Constants'
      : `${m.name}()`;

    sections.push({
      startLine: m.startIdx + 1,
      endLine: m.endIdx + 1,
      title,
      tag: desc.tag,
      goal: desc.goal,
      how: desc.how,
      why: desc.why || '',
    });
    idx++;
  }

  return sections;
}

function extractSections(content, lang, meta, relPath) {
  if (lang === 'java') return extractJavaSections(content, meta);
  const lines = content.split('\n');
  if (lang === 'sql') {
    const out = [];
    for (const m of content.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\);/g)) {
      const startLine = content.slice(0, m.index).split('\n').length;
      const endLine = content.slice(0, m.index + m[0].length).split('\n').length;
      const fks = [...m[2].matchAll(/REFERENCES\s+(\w+)/gi)].map(x => x[1]);
      const checks = (m[2].match(/\bCHECK\b/gi) || []).length;
      out.push({
        startLine,
        endLine,
        title: `Table: ${m[1]}`,
        tag: 'SQL Table',
        goal: `Store persistent "${m[1]}" records in PostgreSQL.`,
        how: `Creates table "${m[1]}" idempotently with IF NOT EXISTS${fks.length ? `, linking via foreign keys to ${[...new Set(fks)].join(', ')}` : ''}${checks ? ` and enforcing ${checks} database-level CHECK constraint(s)` : ''}.`,
      });
    }
    const seedIdx = content.indexOf('-- Catalog data');
    if (seedIdx !== -1) {
      out.push({
        startLine: content.slice(0, seedIdx).split('\n').length,
        endLine: lines.length,
        title: 'Seed Catalog Data',
        tag: 'SQL Seed',
        goal: 'Populate the static catalog of 4 shop power-ups and 11 milestone achievements.',
        how: 'Uses PostgreSQL INSERT ... ON CONFLICT (code) DO NOTHING so re-running schema.sql on every app launch never duplicates or overwrites rows.',
      });
    }
    return out;
  }
  if (lang === 'css') {
    const out = [];
    let curStart = 1;
    let curTitle = 'Base Theme & Typography';
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\/\*\s*-*\s*([^*]+?)\s*-*\s*\*\/$/);
      if (m && i > 2) {
        out.push({ startLine: curStart, endLine: i, title: curTitle, tag: 'JavaFX CSS', goal: `Define visual styling for the "${curTitle}" UI region.`, how: 'Applies JavaFX -fx-* CSS properties and style classes loaded once onto the root Scene in App.setRoot().' });
        curStart = i + 1;
        curTitle = m[1].trim();
      }
    }
    out.push({ startLine: curStart, endLine: lines.length, title: curTitle, tag: 'JavaFX CSS', goal: `Define visual styling for the "${curTitle}" UI region.`, how: 'Applies JavaFX -fx-* CSS properties and style classes loaded once onto the root Scene in App.setRoot().' });
    return out;
  }
  return [{
    startLine: 1,
    endLine: lines.length,
    title: path.basename(relPath),
    tag: 'Config',
    goal: 'Configure default PostgreSQL JDBC connection settings.',
    how: 'Loaded from classpath by Database.loadConfig(); any -Dhabitflow.db.url/user/password JVM property overrides these defaults.',
  }];
}

// Build file records
const records = filesToInclude.map(relPath => {
  const fullPath = path.join(ROOT, relPath);
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n').length;
  const info = classify(relPath);
  const fileName = path.basename(relPath);
  let meta = {
    pkg: info.group,
    typeName: fileName,
    kind: info.lang,
    visibility: 'resource',
    modifier: '',
    extendsType: '',
    implementsTypes: [],
    javadoc: '',
    imports: [],
    wildcardPkgs: [],
    methods: [],
    overloadedNames: [],
    overrideCount: 0,
    tags: [info.lang.toUpperCase()],
  };
  if (info.lang === 'java') {
    meta = parseJava(content, fileName);
  }
  const fileGuide = FILE_GUIDES[relPath] || {};
  const summary = fileGuide.summary || meta.javadoc || `${info.tier} file (${lines} lines).`;
  const why = fileGuide.why || '';
  const comments = extractSections(content, info.lang, meta, relPath);
  return {
    id: relPath,
    path: relPath,
    name: fileName,
    role: info.role,
    group: info.group,
    tier: info.tier,
    lang: info.lang,
    lines,
    summary,
    why,
    comments,
    ...meta,
    code: content,
    deps: [],
    usedBy: [],
  };
});

// Resolve project-internal dependencies (deps & usedBy) across Java files
const byTypeName = new Map();
const byFqn = new Map();
for (const r of records) {
  if (r.lang === 'java') {
    byFqn.set(`${r.pkg}.${r.typeName}`, r);
    if (!byTypeName.has(r.typeName)) byTypeName.set(r.typeName, r);
  }
}

for (const r of records) {
  if (r.lang !== 'java') continue;
  const depSet = new Set();

  // Direct imports
  for (const imp of r.imports) {
    const target = byFqn.get(imp);
    if (target && target.id !== r.id) depSet.add(target.id);
  }

  // Same-package & wildcard-imported references (word boundary check)
  const candidatePkgs = new Set([r.pkg, ...r.wildcardPkgs]);
  for (const other of records) {
    if (other.id === r.id || other.lang !== 'java') continue;
    if (!candidatePkgs.has(other.pkg)) continue;
    const re = new RegExp(`\\b${other.typeName}\\b`);
    if (re.test(r.code)) depSet.add(other.id);
  }

  // Superclass / interfaces
  for (const t of [r.extendsType, ...r.implementsTypes].filter(Boolean)) {
    const target = byTypeName.get(t);
    if (target && target.id !== r.id) depSet.add(target.id);
  }

  r.deps = [...depSet].sort();
}

for (const r of records) {
  for (const depId of r.deps) {
    const target = records.find(x => x.id === depId);
    if (target) target.usedBy.push(r.id);
  }
}
for (const r of records) r.usedBy.sort();

// Parse schema.sql tables for the Database Explorer tab
const schemaText = fs.readFileSync(path.join(ROOT, 'src/main/resources/schema.sql'), 'utf8');
const tables = [];
for (const m of schemaText.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\);/g)) {
  const name = m[1];
  const body = m[2];
  const startLine = schemaText.slice(0, m.index).split('\n').length;
  const cols = [];
  const fks = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim().replace(/,$/, '');
    if (!line || line.startsWith('--')) continue;
    if (/^(PRIMARY KEY|UNIQUE|CHECK)\b/i.test(line)) {
      cols.push({ name: 'CONSTRAINT', type: line, isConstraint: true });
      continue;
    }
    const cm = line.match(/^(\w+)\s+(.+)$/);
    if (cm) {
      cols.push({ name: cm[1], type: cm[2], isConstraint: false });
      const fk = cm[2].match(/REFERENCES\s+(\w+)\((\w+)\)/i);
      if (fk) fks.push(`${cm[1]} -> ${fk[1]}.${fk[2]}`);
    }
  }
  // Find which DAOs mention this table name
  const daos = records
    .filter(r => r.group === 'com.habitflow.db' && new RegExp(`\\b${name}\\b`).test(r.code))
    .map(r => ({ id: r.id, name: r.typeName }));
  tables.push({ name, startLine, cols, fks, daos });
}

// Compute summary stats
const stats = {
  totalFiles: records.length,
  javaMainFiles: records.filter(r => r.path.startsWith('src/main/java/')).length,
  totalLines: records.reduce((s, r) => s + r.lines, 0),
  overrideCount: records.reduce((s, r) => s + (r.overrideCount || 0), 0),
  tableCount: tables.length,
  roleCounts: {
    M: records.filter(r => r.role === 'M').length,
    V: records.filter(r => r.role === 'V').length,
    C: records.filter(r => r.role === 'C').length,
  },
};

// Check which diagrams & screenshots exist in docs/
const diagrams = ['three-tier.png', 'class-design.png', 'class-analysis.png', 'erd.png', 'usecase.png']
  .filter(f => fs.existsSync(path.join(__dirname, 'diagrams', f)))
  .map(f => ({
    file: `diagrams/${f}`,
    title: f.replace('.png', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
  }));

const screenshots = fs.existsSync(path.join(__dirname, 'screenshots'))
  ? fs.readdirSync(path.join(__dirname, 'screenshots'))
      .filter(f => f.endsWith('.png'))
      .sort()
      .map(f => ({
        file: `screenshots/${f}`,
        title: f.replace('.png', '').replace(/^\d+-/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      }))
  : [];

const payload = { stats, records, tables, diagrams, screenshots };
const safeJson = JSON.stringify(payload).replace(/<\/script/gi, '<\\/script');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<script>
try {
  const s = localStorage.getItem("color-scheme");
  if (s === "light" || s === "dark") {
    document.querySelector('meta[name="color-scheme"]').content = s;
  }
} catch {}
</script>
<title>HabitFlow Codebase Explorer — M · V · C Developer Guide</title>
<style>
:root {
  color-scheme: light dark;
  --bg: light-dark(#f8f9fb, #0e1116);
  --surface: light-dark(#ffffff, #151a22);
  --surface-2: light-dark(#f1f4f8, #1c222d);
  --surface-hover: light-dark(#e9eef5, #232b38);
  --border: light-dark(#dde3ec, #2a3342);
  --border-strong: light-dark(#c5cfde, #3a4659);
  --text: light-dark(#151b26, #e6edf6);
  --text-muted: light-dark(#526075, #94a3b8);
  --text-faint: light-dark(#76859b, #69778c);
  --accent: light-dark(#2563eb, #60a5fa);
  --accent-soft: light-dark(#dbeafe, #1e3a5f);
  --m-color: light-dark(#0f766e, #2dd4bf);
  --m-bg: light-dark(#ccfbf1, #133b38);
  --v-color: light-dark(#7c3aed, #c084fc);
  --v-bg: light-dark(#ede9fe, #342052);
  --c-color: light-dark(#c2410c, #fb923c);
  --c-bg: light-dark(#ffedd5, #472412);
  --ok-color: light-dark(#15803d, #4ade80);
  --ok-bg: light-dark(#dcfce7, #143622);
  --code-bg: light-dark(#f6f8fa, #0b0e13);
  --code-hl: light-dark(#fef08a, #423508);
  --tok-kw: light-dark(#b91c1c, #ff7b72);
  --tok-type: light-dark(#6d28d9, #d2a8ff);
  --tok-str: light-dark(#15803d, #a5d6ff);
  --tok-num: light-dark(#0369a1, #79c0ff);
  --tok-cmt: light-dark(#64748b, #8b949e);
  --tok-ann: light-dark(#b45309, #ffa657);
  --radius: 10px;
  --radius-sm: 6px;
  --mono: ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
}
:root:has(> head > meta[name="color-scheme"][content="dark"]) { color-scheme: dark; }
:root:has(> head > meta[name="color-scheme"][content="light"]) { color-scheme: light; }

* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
button { font: inherit; color: inherit; cursor: pointer; }
code, pre { font-family: var(--mono); }

/* Header */
.topbar {
  position: sticky;
  top: 0;
  z-index: 40;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 10px 20px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-right: auto;
}
.brand-mark {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}
.brand h1 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.brand-sub {
  font-size: 12px;
  color: var(--text-muted);
}

/* Role switcher */
.role-group {
  display: inline-flex;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
}
.role-btn {
  border: 0;
  background: transparent;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  transition: background 0.15s, color 0.15s;
}
.role-btn:hover { color: var(--text); }
.role-btn[aria-pressed="true"] { background: var(--surface); color: var(--text); box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
.role-btn[data-role="M"][aria-pressed="true"] { color: var(--m-color); }
.role-btn[data-role="V"][aria-pressed="true"] { color: var(--v-color); }
.role-btn[data-role="C"][aria-pressed="true"] { color: var(--c-color); }

/* Global search */
.search-wrap {
  position: relative;
  min-width: 220px;
  flex: 0 1 300px;
}
.search-wrap input {
  width: 100%;
  padding: 6px 28px 6px 10px;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  font-size: 13px;
}
.search-wrap input:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
  background: var(--surface);
}
.search-kbd {
  position: absolute;
  right: 7px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  color: var(--text-faint);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0 5px;
  pointer-events: none;
}
.search-results {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: min(480px, 92vw);
  max-height: 70vh;
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: 0 12px 32px rgba(0,0,0,0.18);
  display: none;
  z-index: 60;
}
.search-results.open { display: block; }
.sr-item {
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--border);
  padding: 9px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sr-item:last-child { border-bottom: 0; }
.sr-item:hover, .sr-item:focus-visible { background: var(--surface-hover); outline: none; }
.sr-top { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13px; }
.sr-match { font-family: var(--mono); font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sr-empty { padding: 14px; color: var(--text-muted); text-align: center; font-size: 13px; }

/* Theme toggle */
.theme-btn {
  border: 1px solid var(--border);
  background: var(--surface-2);
  border-radius: 7px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.theme-btn:hover { background: var(--surface-hover); }

/* Tabs (modern-web-guidance compliant) */
.tabs-bar {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 0 20px;
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
}
.tabs-bar::-webkit-scrollbar { display: none; }
[role="tab"] {
  position: relative;
  flex: none;
  border: 0;
  background: transparent;
  padding: 11px 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
}
[role="tab"]:hover { color: var(--text); }
[role="tab"]:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
[role="tab"][aria-selected="true"] {
  color: var(--accent);
}
[role="tab"][aria-selected="true"]::after {
  content: "";
  position: absolute;
  inset: auto 8px 0;
  border-block-end: 3px solid var(--accent);
}

/* Panels: no padding/margin/border on tabpanel itself (hidden=until-found rule) */
.panel-inner {
  max-width: 1480px;
  margin: 0 auto;
  padding: 20px;
}
.panel-inner.explorer-pad {
  max-width: none;
  padding: 0;
}

/* Badges */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.01em;
}
.badge-M { background: var(--m-bg); color: var(--m-color); }
.badge-V { background: var(--v-bg); color: var(--v-color); }
.badge-C { background: var(--c-bg); color: var(--c-color); }
.badge-ALL { background: var(--surface-2); color: var(--text-muted); }
.badge-ok { background: var(--ok-bg); color: var(--ok-color); }
.tag {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 500;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-muted);
}

/* Cards & Grids */
.grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
.grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 16px; }
.grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
}
.card.highlight-role {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}
.card h2, .card h3 { margin: 0 0 8px; font-size: 15px; }
.section-title {
  margin: 26px 0 12px;
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-title:first-child { margin-top: 0; }
.stat-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
}
.stat-num { font-size: 24px; font-weight: 800; line-height: 1.1; }
.stat-lbl { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

/* Architecture diagram */
.arch-grid {
  display: grid;
  grid-template-columns: 1fr 44px 1fr 44px 1fr;
  align-items: stretch;
  gap: 8px;
}
@media (max-width: 900px) {
  .arch-grid { grid-template-columns: 1fr; }
  .arch-arrow { transform: rotate(90deg); height: 28px; }
}
.arch-tier {
  border-radius: var(--radius);
  padding: 14px;
  border: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.arch-tier[data-tier="V"] { border-top: 4px solid var(--v-color); }
.arch-tier[data-tier="C"] { border-top: 4px solid var(--c-color); }
.arch-tier[data-tier="M"] { border-top: 4px solid var(--m-color); }
.arch-arrow {
  display: grid;
  place-items: center;
  color: var(--text-muted);
  font-weight: 700;
  font-size: 18px;
}
.arch-shared {
  margin-top: 12px;
  border: 1px dashed var(--m-color);
  background: var(--surface);
  border-radius: var(--radius);
  padding: 12px 16px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.link-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  font-family: var(--mono);
  font-size: 11.5px;
  text-decoration: none;
}
.link-chip:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  text-decoration: none;
}

/* Walkthrough flows */
.flow-list { display: flex; flex-direction: column; gap: 12px; }
.flow-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 10px;
}
.flow-step {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 170px;
  flex: 1 1 180px;
}
.flow-step:hover { border-color: var(--accent); background: var(--surface-hover); }
.flow-step-num { font-size: 10.5px; font-weight: 700; color: var(--text-muted); display: flex; align-items: center; gap: 6px; }
.flow-step-code { font-family: var(--mono); font-size: 12px; font-weight: 600; color: var(--accent); }
.flow-step-desc { font-size: 11.5px; color: var(--text-muted); }

/* Codebase Explorer split layout */
.explorer {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  height: calc(100vh - 102px);
  min-height: 560px;
}
.explorer.no-sidebar {
  grid-template-columns: minmax(0, 1fr);
}
.explorer.no-sidebar .file-sidebar {
  display: none;
}
@media (max-width: 860px) {
  .explorer { grid-template-columns: 1fr; height: auto; }
  .file-sidebar { max-height: 360px; }
}
.file-sidebar {
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sidebar-controls {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sidebar-controls input {
  width: 100%;
  padding: 6px 9px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  font-size: 12.5px;
}
.filter-pills { display: flex; flex-wrap: wrap; gap: 4px; }
.pill-btn {
  border: 1px solid var(--border);
  background: var(--surface-2);
  border-radius: 999px;
  padding: 2px 9px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
}
.pill-btn[aria-pressed="true"] {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.file-tree {
  overflow-y: auto;
  padding: 6px 8px 24px;
  flex: 1;
}

/* Native details accordion per modern-web-guidance */
details.pkg-group { margin-bottom: 4px; }
details.pkg-group > summary {
  list-style: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 6px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
}
details.pkg-group > summary::-webkit-details-marker { display: none; }
details.pkg-group > summary:hover { background: var(--surface-hover); color: var(--text); }
details.pkg-group > summary::before {
  content: "";
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  background-color: currentColor;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 6l4 4 4-4' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat center / contain;
  rotate: -90deg;
}
details.pkg-group[open] > summary::before { rotate: 0deg; }
@media (prefers-reduced-motion: no-preference) {
  details.pkg-group > summary::before { transition: rotate 0.16s; }
}
.pkg-count { margin-left: auto; font-weight: 500; font-size: 11px; color: var(--text-faint); }

.file-item {
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 5px 8px 5px 22px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  color: var(--text);
}
.file-item:hover { background: var(--surface-hover); }
.file-item.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.file-item .f-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; font-family: var(--mono); font-size: 12px; }
.file-item .f-lines { font-size: 10.5px; color: var(--text-faint); }

/* Code Viewer pane */
.viewer-pane {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg);
}
.file-meta {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 10px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 40%;
  overflow-y: auto;
  flex-shrink: 0;
}
.meta-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.meta-path {
  font-family: var(--mono);
  font-size: 13.5px;
  font-weight: 700;
  word-break: break-all;
}
.meta-summary {
  margin: 0;
  padding-left: 10px;
  border-left: 2px solid var(--accent);
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-muted);
}
details.meta-details > summary {
  list-style: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
  padding: 2px 6px;
  margin-left: -6px;
  border-radius: 5px;
}
details.meta-details > summary::-webkit-details-marker { display: none; }
details.meta-details > summary:hover { background: var(--surface-hover); color: var(--text); }
details.meta-details > summary::before {
  content: "";
  width: 11px;
  height: 11px;
  flex-shrink: 0;
  background-color: currentColor;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 6l4 4 4-4' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat center / contain;
  rotate: -90deg;
}
details.meta-details[open] > summary::before { rotate: 0deg; }
.meta-details-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 6px;
}
.meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.meta-label {
  font-weight: 700;
  color: var(--text-muted);
  font-size: 11.5px;
  margin-right: 2px;
}
.code-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.code-toolbar .spacer { margin-left: auto; }
.mini-btn {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 5px;
  padding: 3px 9px;
  font-size: 11.5px;
  font-weight: 600;
}
.mini-btn:hover { border-color: var(--accent); color: var(--accent); }
.mini-btn[aria-pressed="true"] {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}

.code-stage {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  overflow: hidden;
}
.code-stage.no-comments {
  grid-template-columns: minmax(0, 1fr);
}
.code-stage.no-comments .comments-rail {
  display: none;
}
@media (max-width: 1180px) {
  .code-stage {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) 220px;
  }
  .comments-rail {
    border-left: 0 !important;
    border-top: 1px solid var(--border);
  }
}

.code-scroll {
  overflow: auto;
  background: var(--code-bg);
  padding: 8px 0;
}
.code-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--mono);
  font-size: 13.5px;
  line-height: 1.65;
  tab-size: 4;
}
.code-table td { padding: 0; vertical-align: top; }
.code-table .ln {
  width: 42px;
  min-width: 42px;
  text-align: right;
  padding: 0 8px 0 6px;
  color: var(--text-faint);
  font-size: 12px;
  user-select: none;
  border-right: 1px solid var(--border);
  cursor: pointer;
}
.code-table .cm {
  width: 22px;
  min-width: 22px;
  text-align: center;
  padding: 0 2px;
  user-select: none;
  border-right: 1px solid var(--border);
}
.cm-dot {
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 0;
  background: light-dark(#fef3c7, #3b2f0b);
  color: light-dark(#b45309, #fbbf24);
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  padding: 0;
}
.cm-dot:hover, .cm-dot.active {
  background: light-dark(#f59e0b, #d97706);
  color: #fff;
}
.code-table .cl {
  padding: 0 16px;
  white-space: pre;
  cursor: pointer;
}
.code-table.wrap .cl { white-space: pre-wrap; word-break: break-word; }
.code-table tr:hover td { background: light-dark(rgba(15, 23, 42, 0.03), rgba(255, 255, 255, 0.03)); }
.code-table tr.hl td { background: var(--code-hl); }
.code-table tr.sec-hl td { background: light-dark(rgba(250, 204, 21, 0.16), rgba(250, 204, 21, 0.10)); }
.code-table tr.sec-hl .cm { box-shadow: inset 3px 0 0 light-dark(#d97706, #fbbf24); }

/* Google Docs-style Margin Comments Rail */
.comments-rail {
  background: var(--surface-2);
  border-left: 1px solid var(--border);
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0 2px 4px;
  border-bottom: 1px solid var(--border);
}
.gdoc-comment {
  width: 100%;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid light-dark(#d97706, #f59e0b);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s;
}
.gdoc-comment:hover {
  border-color: light-dark(#d97706, #fbbf24);
  box-shadow: 0 3px 10px rgba(0,0,0,0.08);
}
.gdoc-comment.active {
  border-color: light-dark(#d97706, #fbbf24);
  border-left-width: 4px;
  box-shadow: 0 4px 14px rgba(217, 119, 6, 0.18);
  transform: translateX(-3px);
}
.gdoc-top {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.gdoc-num {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: light-dark(#fef3c7, #3b2f0b);
  color: light-dark(#b45309, #fbbf24);
  font-size: 10.5px;
  font-weight: 800;
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
}
.gdoc-comment.active .gdoc-num {
  background: light-dark(#d97706, #f59e0b);
  color: #fff;
}
.gdoc-title {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text);
  flex: 1;
}
.gdoc-lines {
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--text-muted);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 5px;
}
.gdoc-body {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}
.gdoc-comment.active .gdoc-body {
  color: var(--text);
}
.gdoc-field {
  font-size: 12px;
  line-height: 1.48;
  color: var(--text-muted);
}
.gdoc-field + .gdoc-field {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed var(--border);
}
.gdoc-field strong {
  color: var(--text);
  font-weight: 700;
}
.gdoc-comment.active .gdoc-field {
  color: var(--text);
}
.meta-why {
  background: var(--surface-2);
  border-left: 3px solid var(--accent);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
}
.meta-why strong {
  display: block;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--accent);
  margin-bottom: 2px;
}

/* Syntax tokens */
.tok-kw { color: var(--tok-kw); font-weight: 600; }
.tok-type { color: var(--tok-type); }
.tok-str { color: var(--tok-str); }
.tok-num { color: var(--tok-num); }
.tok-cmt { color: var(--tok-cmt); font-style: italic; }
.tok-ann { color: var(--tok-ann); }

/* Rubric & Schema tables */
.data-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  font-size: 13px;
}
.data-table th, .data-table td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
.data-table th {
  background: var(--surface-2);
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
}
.data-table tr:last-child td { border-bottom: 0; }

/* Hierarchy trees */
.tree-root {
  font-family: var(--mono);
  font-size: 12.5px;
  font-weight: 700;
  margin-bottom: 8px;
}
.tree-children {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-left: 14px;
  border-left: 2px solid var(--border-strong);
}

/* Gallery */
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 14px;
}
.fig-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.fig-card img {
  width: 100%;
  height: 190px;
  object-fit: contain;
  background: var(--surface-2);
  cursor: zoom-in;
}
.fig-cap {
  padding: 8px 12px;
  font-size: 12.5px;
  font-weight: 600;
  border-top: 1px solid var(--border);
}

/* Native dialog for image lightbox */
dialog.lightbox {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  max-width: 92vw;
  max-height: 92vh;
  padding: 12px;
}
dialog.lightbox::backdrop { background: rgba(0,0,0,0.65); }
dialog.lightbox img { max-width: 86vw; max-height: 78vh; display: block; margin: 0 auto; }
dialog.lightbox .lb-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-weight: 700; }

.muted { color: var(--text-muted); }
.small { font-size: 12px; }
ul.tight { margin: 6px 0 0; padding-left: 18px; }
ul.tight li { margin-bottom: 4px; }
</style>
</head>
<body>

<header class="topbar">
  <div class="brand">
    <div class="brand-mark">HF</div>
    <div>
      <h1>HabitFlow Codebase Explorer</h1>
      <div class="brand-sub" id="topStats">Java 17 · JavaFX 21 · PostgreSQL JDBC · 3-Tier MVC</div>
    </div>
  </div>

  <div class="role-group" role="group" aria-label="Developer role filter">
    <button type="button" class="role-btn" data-role="ALL" aria-pressed="true">All</button>
    <button type="button" class="role-btn" data-role="M" aria-pressed="false">M · Model &amp; DB</button>
    <button type="button" class="role-btn" data-role="V" aria-pressed="false">V · View (UI)</button>
    <button type="button" class="role-btn" data-role="C" aria-pressed="false">C · Controller</button>
  </div>

  <div class="search-wrap">
    <input type="search" id="globalSearch" placeholder="Search files, methods, or code..." autocomplete="off" aria-label="Search entire codebase">
    <span class="search-kbd">/</span>
    <div class="search-results" id="searchResults" role="listbox" aria-label="Search results"></div>
  </div>

  <button type="button" class="theme-btn" id="themeToggle" aria-label="Toggle color theme">Theme</button>
</header>

<nav class="tabs-bar" role="tablist" aria-label="Explorer sections">
  <button type="button" role="tab" id="tab-overview" aria-selected="true" tabindex="0">1. Overview &amp; Flows</button>
  <button type="button" role="tab" id="tab-explorer" aria-selected="false" tabindex="-1">2. Key Files Explorer</button>
  <button type="button" role="tab" id="tab-rubric" aria-selected="false" tabindex="-1">3. OOP &amp; Rubric Map</button>
  <button type="button" role="tab" id="tab-visuals" aria-selected="false" tabindex="-1">4. Hierarchies, Schema &amp; Screens</button>
</nav>

<main>
  <!-- TAB 1: OVERVIEW -->
  <section role="tabpanel" id="panel-overview" aria-labelledby="tab-overview">
    <div class="panel-inner">
      <div class="grid-4" id="kpiStrip"></div>

      <h2 class="section-title">3-Tier + MVC Architecture &amp; Boundary Rules</h2>
      <div class="card">
        <div class="arch-grid">
          <div class="arch-tier" data-tier="V">
            <div><span class="badge badge-V">V · View Tier</span></div>
            <strong><code>com.habitflow.ui</code></strong>
            <div class="small muted">JavaFX 21 desktop screens, dialogs, custom heatmap canvas, and CSS. Only <code>App</code> is <code>public</code>; every screen is package-private.</div>
            <div class="small"><strong>Rule:</strong> Talks ONLY to controllers in <code>AppContext</code>. Never imports <code>com.habitflow.db</code> or <code>java.sql</code>.</div>
            <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:auto">
              <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/ui/App.java">App.java</button>
              <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/ui/AppContext.java">AppContext.java</button>
              <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/ui/MainView.java">MainView.java</button>
              <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/ui/Page.java">Page.java</button>
            </div>
          </div>

          <div class="arch-arrow" aria-hidden="true">→</div>

          <div class="arch-tier" data-tier="C">
            <div><span class="badge badge-C">C · Controller Tier</span></div>
            <strong><code>com.habitflow.controller</code> &amp; <code>.logic</code></strong>
            <div class="small muted">Use-case orchestration, transactions, <code>Session</code>, achievements, reminders, CSV I/O, and 5 pure calculation modules.</div>
            <div class="small"><strong>Rule:</strong> Zero SQL and zero JavaFX imports. Calls DAOs and wraps multi-step writes in <code>Database.inTransaction()</code>.</div>
            <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:auto">
              <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/controller/Session.java">Session.java</button>
              <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/controller/CheckInController.java">CheckInController</button>
              <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/controller/ShopController.java">ShopController</button>
              <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/controller/logic/StreakCalculator.java">StreakCalculator</button>
            </div>
          </div>

          <div class="arch-arrow" aria-hidden="true">→</div>

          <div class="arch-tier" data-tier="M">
            <div><span class="badge badge-M">M · Database Tier</span></div>
            <strong><code>com.habitflow.db</code> + PostgreSQL</strong>
            <div class="small muted">The ONLY package with SQL. Single synchronized JDBC connection in <code>Database</code> + <code>BaseDao&lt;T&gt;</code> template + 11 DAOs over 14 tables.</div>
            <div class="small"><strong>Rule:</strong> Never imports <code>controller</code> or <code>ui</code>. <code>Database.with()</code> is package-private so SQL cannot leak upward.</div>
            <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:auto">
              <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/db/Database.java">Database.java</button>
              <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/db/BaseDao.java">BaseDao.java</button>
              <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/db/HabitDao.java">HabitDao.java</button>
              <button type="button" class="link-chip" data-open="src/main/resources/schema.sql">schema.sql</button>
            </div>
          </div>
        </div>

        <div class="arch-shared">
          <div>
            <span class="badge badge-M">M · Shared Domain Model</span>
            <strong style="margin-left:8px"><code>com.habitflow.model</code></strong>
            <span class="small muted" style="margin-left:8px">Pure Java entities, value records, enums, and OOP hierarchies shared by all 3 tiers. Zero SQL, zero JavaFX.</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:5px">
            <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/model/Habit.java">Habit</button>
            <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/model/Schedule.java">Schedule</button>
            <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/model/DayBasedSchedule.java">DayBasedSchedule</button>
            <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/model/PowerUp.java">PowerUp</button>
          </div>
        </div>
      </div>

      <h2 class="section-title">How Each Layer Works (M, V, and C)</h2>
      <div class="grid-3">
        <article class="card" data-role-card="M">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span class="badge badge-M">M · Model &amp; DB</span>
            <span class="small muted">Model + DB + SQL</span>
          </div>
          <h3>Model &amp; Data Persistence</h3>
          <p class="small muted">Owns the domain model (<code>model/</code>), PostgreSQL schema (<code>schema.sql</code>), and all 11 JDBC DAOs (<code>db/</code>).</p>
          <ul class="tight small">
            <li><strong>Read first:</strong> <button type="button" class="link-chip" data-open="src/main/resources/schema.sql">schema.sql</button> <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/db/Database.java">Database.java</button> <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/db/BaseDao.java">BaseDao.java</button></li>
            <li><strong>Core OOP:</strong> <code>Person</code>, <code>Habit</code>, <code>Schedule</code> / <code>DayBasedSchedule</code>, <code>PowerUp</code>, <code>BaseDao&lt;T&gt;</code>.</li>
            <li><strong>Contract with C:</strong> Keeps <code>model/</code> 100% pure Java, keeps <code>Database.with()</code> package-private, and parameterizes all SQL via <code>BaseDao</code>.</li>
          </ul>
          <div style="margin-top:12px">
            <button type="button" class="mini-btn" data-explore-role="M">Explore all M files →</button>
          </div>
        </article>

        <article class="card" data-role-card="V">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span class="badge badge-V">V · View</span>
            <span class="small muted">JavaFX Views + CSS</span>
          </div>
          <h3>View &amp; Desktop GUI</h3>
          <p class="small muted">Owns all 11 JavaFX screens/dialogs (<code>ui/</code>), the custom 365-day <code>HeatmapCanvas</code>, and <code>styles.css</code>.</p>
          <ul class="tight small">
            <li><strong>Read first:</strong> <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/ui/App.java">App.java</button> <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/ui/MainView.java">MainView.java</button> <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/ui/Page.java">Page.java</button> <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/ui/TodayPage.java">TodayPage.java</button></li>
            <li><strong>Core OOP:</strong> Abstract <code>Page</code> + 9 subclasses, package-private encapsulation (only <code>App</code> is <code>public</code>).</li>
            <li><strong>Contract with C:</strong> Calls controllers only through <code>ctx</code> (<code>AppContext</code>) and wraps actions in <code>Ui.attempt(...)</code> so validation errors show clean alerts.</li>
          </ul>
          <div style="margin-top:12px">
            <button type="button" class="mini-btn" data-explore-role="V">Explore all V files →</button>
          </div>
        </article>

        <article class="card" data-role-card="C">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span class="badge badge-C">C · Controller</span>
            <span class="small muted">Controllers + Logic</span>
          </div>
          <h3>Controllers &amp; Business Logic</h3>
          <p class="small muted">Owns use-case controllers (<code>controller/</code>) and pure algorithms (<code>controller/logic/</code>) connecting View to Model/DB.</p>
          <ul class="tight small">
            <li><strong>Read first:</strong> <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/controller/Session.java">Session.java</button> <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/controller/CheckInController.java">CheckInController</button> <button type="button" class="link-chip" data-open="src/main/java/com/habitflow/controller/ShopController.java">ShopController</button></li>
            <li><strong>Core OOP:</strong> Overloading (<code>checkIn</code>, <code>completionRate</code>, <code>StrengthScore.compute</code>), Observer (<code>CheckInListener</code>), inner adapter (<code>ShopController.Context</code>).</li>
            <li><strong>Contract with V &amp; M:</strong> Zero JavaFX or <code>java.sql</code> imports; validates inputs, wraps multi-table writes in <code>Database.inTransaction()</code>, and calls <code>Session.refresh()</code> when coins change.</li>
          </ul>
          <div style="margin-top:12px">
            <button type="button" class="mini-btn" data-explore-role="C">Explore all C files →</button>
          </div>
        </article>
      </div>

      <h2 class="section-title">End-to-End Request Walkthroughs (Click Any Step to Open Exact Line)</h2>
      <div class="flow-list" id="flowsContainer"></div>
    </div>
  </section>

  <!-- TAB 2: CODEBASE EXPLORER -->
  <section role="tabpanel" id="panel-explorer" aria-labelledby="tab-explorer" hidden="until-found">
    <div class="panel-inner explorer-pad">
      <div class="explorer" id="explorerGrid">
        <aside class="file-sidebar" aria-label="Project file tree">
          <div class="sidebar-controls">
            <input type="search" id="treeFilter" placeholder="Filter file names or packages..." aria-label="Filter file tree">
            <div class="filter-pills" id="treeRolePills">
              <button type="button" class="pill-btn" data-tr="ALL" aria-pressed="true">All</button>
              <button type="button" class="pill-btn" data-tr="M" aria-pressed="false">M</button>
              <button type="button" class="pill-btn" data-tr="V" aria-pressed="false">V</button>
              <button type="button" class="pill-btn" data-tr="C" aria-pressed="false">C</button>
            </div>
          </div>
          <div class="file-tree" id="fileTree"></div>
        </aside>

        <div class="viewer-pane">
          <div class="file-meta" id="fileMeta"></div>
          <div class="code-toolbar">
            <button type="button" class="mini-btn" id="sidebarBtn" aria-pressed="true">Files</button>
            <span id="codeStats">Select a file</span>
            <span class="spacer"></span>
            <button type="button" class="mini-btn" id="commentsBtn" aria-pressed="true">Comments</button>
            <button type="button" class="mini-btn" id="wrapBtn" aria-pressed="false">Wrap lines</button>
            <button type="button" class="mini-btn" id="copyBtn">Copy code</button>
          </div>
          <div class="code-stage" id="codeStage">
            <div class="code-scroll" id="codeScroll">
              <table class="code-table" id="codeTable"><tbody></tbody></table>
            </div>
            <aside class="comments-rail" id="commentsRail" aria-label="Section comments"></aside>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- TAB 3: OOP & RUBRIC MAP -->
  <section role="tabpanel" id="panel-rubric" aria-labelledby="tab-rubric" hidden="until-found">
    <div class="panel-inner">
      <h2 class="section-title">OOP &amp; Rubric Traceability Map (Click Any Citation to Jump to Code)</h2>
      <p class="muted small" style="margin-top:-6px;margin-bottom:14px">Every OOP and 3-tier requirement mapped directly to the exact files and line numbers that answer it in HabitFlow.</p>
      <table class="data-table" id="rubricTable">
        <thead>
          <tr>
            <th style="width:20%">Rubric Requirement</th>
            <th style="width:10%">Layer</th>
            <th style="width:36%">How HabitFlow Answers It</th>
            <th style="width:34%">Exact Code Citations</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  </section>

  <!-- TAB 4: SCHEMA, HIERARCHIES & SCREENS -->
  <section role="tabpanel" id="panel-visuals" aria-labelledby="tab-visuals" hidden="until-found">
    <div class="panel-inner">
      <h2 class="section-title">Core OOP Inheritance &amp; Interface Hierarchies</h2>
      <div class="grid-3" id="hierarchiesGrid"></div>

      <h2 class="section-title">PostgreSQL Database Schema (14 Normalized Tables)</h2>
      <p class="muted small" style="margin-top:-6px;margin-bottom:12px">Parsed directly from <button type="button" class="link-chip" data-open="src/main/resources/schema.sql">schema.sql</button>. Click any table link to inspect its exact SQL definition.</p>
      <div class="grid-2" id="schemaGrid"></div>

      <h2 class="section-title">Architecture Diagrams &amp; GUI Screenshots</h2>
      <p class="muted small" style="margin-top:-6px;margin-bottom:12px">Loaded relative to <code>docs/</code>. Click any figure to zoom.</p>
      <div class="gallery" id="figuresGallery"></div>
    </div>
  </section>
</main>

<dialog class="lightbox" id="lightbox">
  <div class="lb-bar">
    <span id="lbTitle">Figure</span>
    <button type="button" class="mini-btn" id="lbClose">Close (Esc)</button>
  </div>
  <img id="lbImg" alt="">
</dialog>

<script id="codebase-data" type="application/json">${safeJson}</script>
<script>
(() => {
  const DATA = JSON.parse(document.getElementById('codebase-data').textContent);
  const byId = new Map(DATA.records.map(r => [r.id, r]));

  // State
  let activeRole = 'ALL';
  let treeRole = 'ALL';
  let activeFileId = 'src/main/java/com/habitflow/ui/App.java';
  let highlightedLine = null;
  let wrapLines = false;

  // Helpers
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const supportsUntilFound = 'onbeforematch' in HTMLElement.prototype;

  // --- Theme toggle (modern-web-guidance dark-mode-toggle) ---
  const metaScheme = document.querySelector('meta[name="color-scheme"]');
  const themeBtn = document.getElementById('themeToggle');
  const mqlDark = window.matchMedia('(prefers-color-scheme: dark)');

  function currentRenderedScheme() {
    const c = metaScheme.content;
    if (c === 'dark' || c === 'light') return c;
    return mqlDark.matches ? 'dark' : 'light';
  }
  function updateThemeBtn() {
    const rendered = currentRenderedScheme();
    themeBtn.textContent = rendered === 'dark' ? 'Switch to light' : 'Switch to dark';
  }
  themeBtn.addEventListener('click', () => {
    const rendered = currentRenderedScheme();
    const target = rendered === 'dark' ? 'light' : 'dark';
    const sys = mqlDark.matches ? 'dark' : 'light';
    try {
      if (target === sys) {
        localStorage.removeItem('color-scheme');
        metaScheme.content = 'light dark';
      } else {
        localStorage.setItem('color-scheme', target);
        metaScheme.content = target;
      }
    } catch {
      metaScheme.content = target === sys ? 'light dark' : target;
    }
    updateThemeBtn();
  });
  window.addEventListener('storage', e => {
    if (e.key === 'color-scheme') {
      metaScheme.content = (e.newValue === 'light' || e.newValue === 'dark') ? e.newValue : 'light dark';
      updateThemeBtn();
    }
  });
  mqlDark.addEventListener('change', updateThemeBtn);
  updateThemeBtn();

  // --- Tabs (modern-web-guidance tabs + hidden="until-found" + beforematch) ---
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const panels = [...document.querySelectorAll('[role="tabpanel"]')];

  function hidePanel(panel) {
    if (supportsUntilFound) panel.setAttribute('hidden', 'until-found');
    else panel.hidden = true;
    panel.removeAttribute('tabindex');
  }
  function showPanel(panel) {
    panel.removeAttribute('hidden');
  }
  function selectTab(tab, focusTab = false) {
    const targetId = tab.id.replace('tab-', 'panel-');
    tabs.forEach(t => {
      const sel = t === tab;
      t.setAttribute('aria-selected', sel ? 'true' : 'false');
      t.tabIndex = sel ? 0 : -1;
    });
    panels.forEach(p => {
      if (p.id === targetId) showPanel(p);
      else hidePanel(p);
    });
    tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (focusTab) tab.focus();
  }
  // Initialize inactive panels properly on browsers without until-found
  panels.forEach((p, idx) => { if (idx > 0) hidePanel(p); });

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectTab(t));
    t.addEventListener('keydown', e => {
      let next = null;
      if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else if (e.key === 'End') next = tabs[tabs.length - 1];
      if (next) {
        e.preventDefault();
        selectTab(next, true);
      }
    });
  });

  // Sync tab selection if browser Find-in-Page opens a hidden="until-found" panel
  document.addEventListener('beforematch', e => {
    const panel = e.target.closest('[role="tabpanel"]');
    if (!panel) return;
    const tab = document.getElementById(panel.getAttribute('aria-labelledby'));
    if (tab) selectTab(tab);
  });

  // --- Role Switcher ---
  const roleBtns = [...document.querySelectorAll('.role-btn')];
  function setGlobalRole(role) {
    activeRole = role;
    roleBtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.role === role ? 'true' : 'false'));
    document.querySelectorAll('[data-role-card]').forEach(card => {
      card.classList.toggle('highlight-role', role !== 'ALL' && card.dataset.roleCard === role);
    });
    setTreeRole(role);
  }
  roleBtns.forEach(b => b.addEventListener('click', () => setGlobalRole(b.dataset.role)));

  // --- KPI Strip ---
  document.getElementById('topStats').textContent =
    \`\${DATA.stats.totalFiles} key files · \${DATA.stats.tableCount} SQL tables · \${DATA.stats.totalLines.toLocaleString()} lines\`;

  document.getElementById('kpiStrip').innerHTML = [
    [DATA.stats.totalFiles, 'Curated Key Files'],
    [\`\${DATA.stats.roleCounts.M} / \${DATA.stats.roleCounts.V} / \${DATA.stats.roleCounts.C}\`, 'Key Files by Layer (M / V / C)'],
    [DATA.stats.tableCount, 'PostgreSQL Tables'],
    ['3 Tiers', 'View → Controller → Database'],
  ].map(([n, l]) => \`<div class="stat-card"><div class="stat-num">\${esc(n)}</div><div class="stat-lbl">\${esc(l)}</div></div>\`).join('');

  // --- End-to-End Flows ---
  const FLOWS = [
    {
      title: 'Flow 1 · Startup & Sign In (App → AuthController → Session → MainView)',
      steps: [
        { role: 'V', file: 'src/main/java/com/habitflow/ui/App.java', line: 17, code: 'App.start()', desc: 'Checks PostgreSQL via StartupController and opens LoginView' },
        { role: 'C', file: 'src/main/java/com/habitflow/controller/AuthController.java', line: 34, code: 'AuthController.login()', desc: 'Verifies PBKDF2 password hash, checks 5-attempt lockout, starts Session' },
        { role: 'C', file: 'src/main/java/com/habitflow/controller/Session.java', line: 25, code: 'Session.start()', desc: 'Stores authenticated User and notifies MainView header listeners' },
        { role: 'V', file: 'src/main/java/com/habitflow/ui/MainView.java', line: 96, code: 'MainView.onLoggedIn()', desc: 'Shows TodayPage, auto-applies Streak Freezes, starts reminders' },
      ],
    },
    {
      title: 'Flow 2 · Complete a Check-In (Overloading, Atomic Transaction & Live UI Update)',
      steps: [
        { role: 'V', file: 'src/main/java/com/habitflow/ui/TodayPage.java', line: 113, code: 'TodayPage.controls()', desc: 'Click calls ctx.checkIns.checkIn(habit) one-arg overload' },
        { role: 'C', file: 'src/main/java/com/habitflow/controller/CheckInController.java', line: 45, code: 'CheckInController.checkIn()', desc: 'Validates, calculates streak-scaled coins, saves row + ledger atomically' },
        { role: 'M', file: 'src/main/java/com/habitflow/db/Database.java', line: 69, code: 'Database.inTransaction()', desc: 'Commits check-in + coin credit together, or rolls back on any error' },
        { role: 'C', file: 'src/main/java/com/habitflow/controller/Session.java', line: 36, code: 'Session.refresh()', desc: 'Reloads updated coin balance so MainView header refreshes live' },
      ],
    },
    {
      title: 'Flow 3 · Use a Power-Up (Polymorphic Strategy + Dependency Inversion)',
      steps: [
        { role: 'C', file: 'src/main/java/com/habitflow/controller/ShopController.java', line: 59, code: 'ShopController.use()', desc: 'Decrements inventory inside transaction and passes private Context' },
        { role: 'M', file: 'src/main/java/com/habitflow/model/PowerUp.java', line: 30, code: 'PowerUp.apply()', desc: 'Dynamic dispatch to StreakFreeze, StreakRepair, DoubleCoins, or RestDay' },
        { role: 'C', file: 'src/main/java/com/habitflow/controller/ShopController.java', line: 101, code: 'ShopController.Context', desc: 'Safe narrow bridge that writes protected days or 24h effects to DB' },
        { role: 'M', file: 'src/main/java/com/habitflow/db/Database.java', line: 69, code: 'Rollback on no-op', desc: 'If apply() throws (e.g. nothing to repair), item is never wasted' },
      ],
    },
    {
      title: 'Flow 4 · Compute Streaks & Habit Strength (Polymorphic Schedule Math)',
      steps: [
        { role: 'M', file: 'src/main/java/com/habitflow/db/HabitDao.java', line: 20, code: 'HabitDao.mapRow()', desc: 'Rebuilds exact Habit subclass and Schedule strategy from SQL row' },
        { role: 'C', file: 'src/main/java/com/habitflow/controller/HabitStats.java', line: 23, code: 'HabitStats.summarize()', desc: 'Collects done/frozen days and calls h.getSchedule().outcomes()' },
        { role: 'M', file: 'src/main/java/com/habitflow/model/DayBasedSchedule.java', line: 19, code: 'Schedule.outcomes()', desc: 'Turns check-in dates into 0.0–1.0 period scores (daily or weekly)' },
        { role: 'C', file: 'src/main/java/com/habitflow/controller/logic/StrengthScore.java', line: 19, code: 'StrengthScore + StreakCalculator', desc: 'Pure math computes active streak, best streak, and 0–100 EMA strength' },
      ],
    },
  ];

  document.getElementById('flowsContainer').innerHTML = FLOWS.map(f => \`
    <div class="card">
      <h3>\${esc(f.title)}</h3>
      <div class="flow-steps">
        \${f.steps.map((s, idx) => \`
          <button type="button" class="flow-step" data-open="\${esc(s.file)}" data-line="\${s.line}">
            <span class="flow-step-num"><span class="badge badge-\${s.role}">\${s.role}</span> Step \${idx + 1}</span>
            <span class="flow-step-code">\${esc(s.code)}</span>
            <span class="flow-step-desc">\${esc(s.desc)}</span>
          </button>
        \`).join('')}
      </div>
    </div>
  \`).join('');

  // --- Syntax Highlighter (lightweight, safe HTML escaping first) ---
  const JAVA_KW = new Set([
    'package','import','public','private','protected','class','interface','enum','record','extends','implements',
    'abstract','final','static','void','return','if','else','for','while','do','switch','case','default','break',
    'continue','new','this','super','try','catch','finally','throw','throws','boolean','int','long','double',
    'float','char','byte','short','true','false','null','instanceof','synchronized','volatile','var'
  ]);
  const SQL_KW = new Set([
    'CREATE','TABLE','IF','NOT','EXISTS','PRIMARY','KEY','REFERENCES','ON','DELETE','CASCADE','SET','NULL',
    'UNIQUE','CHECK','IN','DEFAULT','INDEX','INSERT','INTO','VALUES','CONFLICT','DO','NOTHING','SERIAL','INT',
    'SMALLINT','VARCHAR','NUMERIC','BOOLEAN','DATE','TIME','TIMESTAMP','BETWEEN','AND','OR','SELECT','FROM',
    'WHERE','ORDER','BY','GROUP','JOIN','LEFT','AS'
  ]);

  function highlightLine(raw, lang) {
    if (lang === 'java') {
      const tokens = [];
      let i = 0;
      while (i < raw.length) {
        if (raw[i] === '/' && raw[i + 1] === '/') {
          tokens.push(\`<span class="tok-cmt">\${esc(raw.slice(i))}</span>\`);
          break;
        }
        if (raw[i] === '/' && raw[i + 1] === '*') {
          const end = raw.indexOf('*/', i + 2);
          const slice = end === -1 ? raw.slice(i) : raw.slice(i, end + 2);
          tokens.push(\`<span class="tok-cmt">\${esc(slice)}</span>\`);
          i += slice.length;
          continue;
        }
        if (raw[i] === '"' || raw[i] === "'") {
          const q = raw[i];
          let j = i + 1;
          while (j < raw.length && raw[j] !== q) {
            if (raw[j] === '\\\\') j++;
            j++;
          }
          const slice = raw.slice(i, j + 1);
          tokens.push(\`<span class="tok-str">\${esc(slice)}</span>\`);
          i = j + 1;
          continue;
        }
        if (raw[i] === '@' && /[A-Za-z_]/.test(raw[i + 1] || '')) {
          let j = i + 1;
          while (j < raw.length && /\\w/.test(raw[j])) j++;
          tokens.push(\`<span class="tok-ann">\${esc(raw.slice(i, j))}</span>\`);
          i = j;
          continue;
        }
        if (/[A-Za-z_]/.test(raw[i])) {
          let j = i + 1;
          while (j < raw.length && /\\w/.test(raw[j])) j++;
          const word = raw.slice(i, j);
          if (JAVA_KW.has(word)) tokens.push(\`<span class="tok-kw">\${word}</span>\`);
          else if (/^[A-Z]/.test(word)) tokens.push(\`<span class="tok-type">\${word}</span>\`);
          else tokens.push(word);
          i = j;
          continue;
        }
        if (/\\d/.test(raw[i])) {
          let j = i + 1;
          while (j < raw.length && /[\\d._Lfd]/.test(raw[j])) j++;
          tokens.push(\`<span class="tok-num">\${raw.slice(i, j)}</span>\`);
          i = j;
          continue;
        }
        tokens.push(esc(raw[i]));
        i++;
      }
      // Comment lines inside block comments starting with *
      if (/^\\s*\\*/.test(raw)) return \`<span class="tok-cmt">\${esc(raw)}</span>\`;
      return tokens.join('');
    }
    if (lang === 'sql') {
      if (/^\\s*--/.test(raw)) return \`<span class="tok-cmt">\${esc(raw)}</span>\`;
      return esc(raw).replace(/\\b([A-Z_]{2,})\\b/g, m => SQL_KW.has(m) ? \`<span class="tok-kw">\${m}</span>\` : m)
        .replace(/'([^']*)'/g, \`<span class="tok-str">'$1'</span>\`);
    }
    return esc(raw);
  }

  // --- File Tree ---
  const GROUP_ORDER = [
    'Model (Domain)',
    'Database (SQL & JDBC)',
    'Controllers',
    'Pure Logic',
    'View (JavaFX UI)',
  ];

  const fileTreeEl = document.getElementById('fileTree');
  const treeFilterEl = document.getElementById('treeFilter');
  const treeRolePills = [...document.querySelectorAll('#treeRolePills .pill-btn')];

  function setTreeRole(r) {
    treeRole = r;
    treeRolePills.forEach(p => p.setAttribute('aria-pressed', p.dataset.tr === r ? 'true' : 'false'));
    renderTree();
  }
  treeRolePills.forEach(p => p.addEventListener('click', () => setTreeRole(p.dataset.tr)));
  treeFilterEl.addEventListener('input', renderTree);

  function renderTree() {
    const q = treeFilterEl.value.trim().toLowerCase();
    const groups = new Map();
    for (const g of GROUP_ORDER) groups.set(g, []);
    for (const r of DATA.records) {
      if (treeRole !== 'ALL' && r.role !== treeRole && r.role !== 'ALL') continue;
      if (q && !r.name.toLowerCase().includes(q) && !r.group.toLowerCase().includes(q) && !r.summary.toLowerCase().includes(q)) continue;
      if (!groups.has(r.group)) groups.set(r.group, []);
      groups.get(r.group).push(r);
    }

    const parts = [];
    for (const [g, list] of groups) {
      if (!list.length) continue;
      const shouldOpen = !!q || list.some(x => x.id === activeFileId) || treeRole !== 'ALL';
      parts.push(\`
        <details class="pkg-group" \${shouldOpen ? 'open' : ''}>
          <summary><span>\${esc(g)}</span><span class="pkg-count">\${list.length}</span></summary>
          <div>
            \${list.map(f => \`
              <button type="button" class="file-item \${f.id === activeFileId ? 'active' : ''}" data-file-id="\${esc(f.id)}">
                <span class="badge badge-\${f.role}">\${f.role}</span>
                <span class="f-name">\${esc(f.name)}</span>
                <span class="f-lines">\${f.lines}L</span>
              </button>
            \`).join('')}
          </div>
        </details>
      \`);
    }
    fileTreeEl.innerHTML = parts.length ? parts.join('') : '<div class="sr-empty">No matching files</div>';
  }

  fileTreeEl.addEventListener('click', e => {
    const btn = e.target.closest('.file-item');
    if (btn) openFile(btn.dataset.fileId, null, false);
  });

  // --- Code Viewer + Google Docs-style Margin Comments ---
  const fileMetaEl = document.getElementById('fileMeta');
  const codeTableEl = document.getElementById('codeTable');
  const codeScrollEl = document.getElementById('codeScroll');
  const codeStatsEl = document.getElementById('codeStats');
  const codeStageEl = document.getElementById('codeStage');
  const commentsRailEl = document.getElementById('commentsRail');
  const commentsBtnEl = document.getElementById('commentsBtn');
  let showComments = true;
  let activeCommentIdx = -1;

  function activateComment(idx, scrollCode = false, scrollRail = false) {
    const rec = byId.get(activeFileId);
    if (!rec || !rec.comments || idx < 0 || idx >= rec.comments.length) return;
    activeCommentIdx = idx;
    const c = rec.comments[idx];

    codeTableEl.querySelectorAll('tr.sec-hl').forEach(tr => tr.classList.remove('sec-hl'));
    codeTableEl.querySelectorAll('.cm-dot.active').forEach(d => d.classList.remove('active'));
    for (let ln = c.startLine; ln <= c.endLine; ln++) {
      const tr = document.getElementById('L' + ln);
      if (tr) tr.classList.add('sec-hl');
    }
    const dot = codeTableEl.querySelector(\`.cm-dot[data-cidx="\${idx}"]\`);
    if (dot) dot.classList.add('active');

    commentsRailEl.querySelectorAll('.gdoc-comment').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
    });

    if (scrollCode) {
      const startRow = document.getElementById('L' + c.startLine);
      if (startRow) startRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    if (scrollRail) {
      const card = commentsRailEl.querySelector(\`.gdoc-comment[data-cidx="\${idx}"]\`);
      if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function openFile(fileId, line = null, switchToTab = true) {
    const rec = byId.get(fileId);
    if (!rec) return;
    activeFileId = fileId;
    highlightedLine = line;
    activeCommentIdx = -1;
    if (switchToTab) selectTab(document.getElementById('tab-explorer'));
    renderTree();

    const comments = rec.comments || [];
    commentsBtnEl.textContent = \`Comments (\${comments.length})\`;

    // Render educational metadata header
    const depsHtml = rec.deps.length
      ? rec.deps.map(id => \`<button type="button" class="link-chip" data-open="\${esc(id)}">\${esc(byId.get(id).name)}</button>\`).join('')
      : '<span class="muted small">None (leaf file)</span>';

    const usedByHtml = rec.usedBy.length
      ? rec.usedBy.slice(0, 14).map(id => \`<button type="button" class="link-chip" data-open="\${esc(id)}">\${esc(byId.get(id).name)}</button>\`).join('')
        + (rec.usedBy.length > 14 ? \`<span class="small muted">+\${rec.usedBy.length - 14} more</span>\` : '')
      : '<span class="muted small">Entry point</span>';

    const methodsHtml = rec.methods && rec.methods.length
      ? rec.methods.slice(0, 18).map(m =>
          \`<button type="button" class="link-chip" data-jump-line="\${m.line}" title="\${esc(m.vis + ' ' + m.ret + ' ' + m.name + '(' + m.params + ')')}">\${m.override ? '@O ' : ''}\${esc(m.name)}() :\${m.line}</button>\`
        ).join('')
      : '';

    const detailSummary = [
      \`\${rec.tags.length + 1} traits\`,
      \`\${rec.deps.length} uses\`,
      \`\${rec.usedBy.length} used by\`,
      rec.methods && rec.methods.length ? \`\${rec.methods.length} outline\` : ''
    ].filter(Boolean).join(' · ');

    fileMetaEl.innerHTML = \`
      <div class="meta-top">
        <span class="badge badge-\${rec.role}">\${rec.role} · \${esc(rec.tier)}</span>
        <span class="meta-path">\${esc(rec.path)}</span>
      </div>
      <p class="meta-summary">\${esc(rec.summary)}</p>
      \${rec.why ? \`<div class="meta-why"><strong>Why it is designed this way</strong>\${esc(rec.why)}</div>\` : ''}
      <details class="meta-details">
        <summary>File details (\${detailSummary})</summary>
        <div class="meta-details-body">
          <div class="meta-row">
            <span class="meta-label">OOP &amp; Traits:</span>
            <span class="tag">\${esc(rec.visibility)}</span>
            \${rec.tags.map(t => \`<span class="tag">\${esc(t)}</span>\`).join('')}
          </div>
          <div class="meta-row"><span class="meta-label">Uses (\${rec.deps.length}):</span> \${depsHtml}</div>
          <div class="meta-row"><span class="meta-label">Used by (\${rec.usedBy.length}):</span> \${usedByHtml}</div>
          \${methodsHtml ? \`<div class="meta-row"><span class="meta-label">Outline:</span> \${methodsHtml}</div>\` : ''}
        </div>
      </details>
    \`;

    // Map starting lines -> comment index for gutter badges
    const startMap = new Map();
    comments.forEach((c, idx) => {
      if (!startMap.has(c.startLine)) startMap.set(c.startLine, idx);
    });

    // Render syntax-highlighted source code with comment gutter
    const lines = rec.code.split('\\n');
    codeStatsEl.textContent = \`\${rec.name} · \${lines.length} lines · \${rec.lang.toUpperCase()} · \${comments.length} section comments\`;
    const tbody = codeTableEl.querySelector('tbody');
    tbody.innerHTML = lines.map((l, idx) => {
      const ln = idx + 1;
      const hl = highlightedLine === ln ? ' class="hl"' : '';
      const cIdx = startMap.has(ln) ? startMap.get(ln) : -1;
      const dot = cIdx >= 0
        ? \`<button type="button" class="cm-dot" data-cidx="\${cIdx}" title="Section comment #\${cIdx + 1}">\${cIdx + 1}</button>\`
        : '';
      return \`<tr id="L\${ln}" data-ln="\${ln}"\${hl}><td class="ln">\${ln}</td><td class="cm">\${dot}</td><td class="cl">\${highlightLine(l, rec.lang)}</td></tr>\`;
    }).join('');

    // Render Google Docs-style margin comment cards
    commentsRailEl.innerHTML = \`
      <div class="rail-header">
        <span>Section Comments (\${comments.length})</span>
        <span>Click to highlight</span>
      </div>
      \${comments.map((c, idx) => \`
        <button type="button" class="gdoc-comment" data-cidx="\${idx}">
          <div class="gdoc-top">
            <span class="gdoc-num">\${idx + 1}</span>
            <span class="gdoc-title">\${esc(c.title)}</span>
            <span class="gdoc-lines">L\${c.startLine}\${c.endLine > c.startLine ? '–' + c.endLine : ''}</span>
          </div>
          <div><span class="tag">\${esc(c.tag)}</span></div>
          \${c.goal
            ? \`<div class="gdoc-field"><strong>What it does:</strong> \${esc(c.goal)}</div><div class="gdoc-field"><strong>How it works:</strong> \${esc(c.how)}</div>\${c.why ? \`<div class="gdoc-field"><strong>Why it matters:</strong> \${esc(c.why)}</div>\` : ''}\`
            : \`<p class="gdoc-body">\${esc(c.body || '')}</p>\`}
        </button>
      \`).join('')}
    \`;

    if (highlightedLine) {
      scrollToLine(highlightedLine);
      const matchIdx = comments.findIndex(c => highlightedLine >= c.startLine && highlightedLine <= c.endLine);
      if (matchIdx >= 0) activateComment(matchIdx, false, true);
    } else {
      codeScrollEl.scrollTop = 0;
      commentsRailEl.scrollTop = 0;
      if (comments.length) activateComment(0, false, false);
    }
  }

  function scrollToLine(ln) {
    codeTableEl.querySelectorAll('tr.hl').forEach(tr => tr.classList.remove('hl'));
    const row = document.getElementById('L' + ln);
    if (row) {
      row.classList.add('hl');
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    const rec = byId.get(activeFileId);
    if (rec && rec.comments) {
      const matchIdx = rec.comments.findIndex(c => ln >= c.startLine && ln <= c.endLine);
      if (matchIdx >= 0) activateComment(matchIdx, false, true);
    }
  }

  // Click on code row or gutter dot -> sync comment card in right rail
  codeTableEl.addEventListener('click', e => {
    const dot = e.target.closest('.cm-dot');
    if (dot) {
      activateComment(Number(dot.dataset.cidx), false, true);
      return;
    }
    const tr = e.target.closest('tr[data-ln]');
    if (!tr) return;
    const ln = Number(tr.dataset.ln);
    const rec = byId.get(activeFileId);
    if (!rec || !rec.comments) return;
    const idx = rec.comments.findIndex(c => ln >= c.startLine && ln <= c.endLine);
    if (idx >= 0) activateComment(idx, false, true);
  });

  // Click on Google Docs comment card -> highlight section lines & scroll code
  commentsRailEl.addEventListener('click', e => {
    const card = e.target.closest('.gdoc-comment');
    if (card) activateComment(Number(card.dataset.cidx), true, false);
  });

  const explorerGridEl = document.getElementById('explorerGrid');
  const sidebarBtnEl = document.getElementById('sidebarBtn');
  let showSidebar = true;

  sidebarBtnEl.addEventListener('click', () => {
    showSidebar = !showSidebar;
    sidebarBtnEl.setAttribute('aria-pressed', String(showSidebar));
    explorerGridEl.classList.toggle('no-sidebar', !showSidebar);
  });

  commentsBtnEl.addEventListener('click', () => {
    showComments = !showComments;
    commentsBtnEl.setAttribute('aria-pressed', String(showComments));
    codeStageEl.classList.toggle('no-comments', !showComments);
  });

  document.getElementById('wrapBtn').addEventListener('click', e => {
    wrapLines = !wrapLines;
    e.currentTarget.setAttribute('aria-pressed', String(wrapLines));
    codeTableEl.classList.toggle('wrap', wrapLines);
  });

  document.getElementById('copyBtn').addEventListener('click', async e => {
    const rec = byId.get(activeFileId);
    if (!rec) return;
    try {
      await navigator.clipboard.writeText(rec.code);
      const btn = e.currentTarget;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy code'; }, 1200);
    } catch {}
  });

  // Delegated clicks for [data-open], [data-jump-line], [data-explore-role]
  document.addEventListener('click', e => {
    const openBtn = e.target.closest('[data-open]');
    if (openBtn) {
      const ln = openBtn.dataset.line ? Number(openBtn.dataset.line) : null;
      openFile(openBtn.dataset.open, ln, true);
      return;
    }
    const jumpBtn = e.target.closest('[data-jump-line]');
    if (jumpBtn) {
      scrollToLine(Number(jumpBtn.dataset.jumpLine));
      return;
    }
    const roleLink = e.target.closest('[data-explore-role]');
    if (roleLink) {
      setGlobalRole(roleLink.dataset.exploreRole);
      const first = DATA.records.find(r => r.role === roleLink.dataset.exploreRole);
      if (first) openFile(first.id, null, true);
      else selectTab(document.getElementById('tab-explorer'));
    }
  });

  // --- Global Full-Text Search ---
  const searchInput = document.getElementById('globalSearch');
  const searchResults = document.getElementById('searchResults');

  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      searchInput.focus();
    } else if (e.key === 'Escape') {
      searchResults.classList.remove('open');
    }
  });

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      searchResults.classList.remove('open');
      return;
    }
    const hits = [];
    for (const r of DATA.records) {
      if (r.name.toLowerCase().includes(q) || r.summary.toLowerCase().includes(q)) {
        hits.push({ rec: r, line: null, snippet: r.summary });
      } else {
        const idx = r.code.toLowerCase().indexOf(q);
        if (idx !== -1) {
          const lineNum = r.code.slice(0, idx).split('\\n').length;
          const lineText = r.code.split('\\n')[lineNum - 1].trim();
          hits.push({ rec: r, line: lineNum, snippet: \`L\${lineNum}: \${lineText}\` });
        }
      }
      if (hits.length >= 24) break;
    }

    searchResults.innerHTML = hits.length
      ? hits.map(h => \`
          <button type="button" class="sr-item" data-sr-id="\${esc(h.rec.id)}" data-sr-line="\${h.line || ''}">
            <div class="sr-top">
              <span class="badge badge-\${h.rec.role}">\${h.rec.role}</span>
              <span>\${esc(h.rec.name)}</span>
              <span class="small muted">\${esc(h.rec.group)}</span>
            </div>
            <div class="sr-match">\${esc(h.snippet)}</div>
          </button>
        \`).join('')
      : '<div class="sr-empty">No matches across all project files</div>';
    searchResults.classList.add('open');
  });

  searchResults.addEventListener('click', e => {
    const item = e.target.closest('.sr-item');
    if (!item) return;
    const ln = item.dataset.srLine ? Number(item.dataset.srLine) : null;
    openFile(item.dataset.srId, ln, true);
    searchResults.classList.remove('open');
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) searchResults.classList.remove('open');
  });

  // --- Tab 3: OOP & Rubric Table ---
  const RUBRIC = [
    {
      req: '3-Tier Architecture',
      owner: 'ALL',
      how: 'Strict GUI (ui) → Controller (controller + logic) → Database (db) with shared pure Model (model). UI only talks to controllers via AppContext and never imports java.sql or com.habitflow.db.',
      refs: [['App.java:12', 'src/main/java/com/habitflow/ui/App.java', 12], ['AppContext.java:6', 'src/main/java/com/habitflow/ui/AppContext.java', 6], ['CheckInController.java:14', 'src/main/java/com/habitflow/controller/CheckInController.java', 14], ['Database.java:17', 'src/main/java/com/habitflow/db/Database.java', 17]],
    },
    {
      req: 'Package Hierarchy & Access Control',
      owner: 'ALL',
      how: 'Uses public, private, protected, default (package-private), final, and static to lock tier boundaries: Database.with() stays in db, Session.start/end & HabitStats stay in controller, and all UI screens stay package-private inside ui.',
      refs: [['Database.with():58', 'src/main/java/com/habitflow/db/Database.java', 58], ['Session.start():25', 'src/main/java/com/habitflow/controller/Session.java', 25], ['HabitStats:13', 'src/main/java/com/habitflow/controller/HabitStats.java', 13], ['Page.java:9', 'src/main/java/com/habitflow/ui/Page.java', 9]],
    },
    {
      req: 'Abstract Classes (6 hierarchies)',
      owner: 'M',
      how: 'Every abstract class mixes abstract hooks with concrete/final shared behavior: Person, Habit, DayBasedSchedule, PowerUp, BaseDao<T>, and Page.',
      refs: [['Person.java:4', 'src/main/java/com/habitflow/model/Person.java', 4], ['Habit.java:9', 'src/main/java/com/habitflow/model/Habit.java', 9], ['DayBasedSchedule.java:9', 'src/main/java/com/habitflow/model/DayBasedSchedule.java', 9], ['PowerUp.java:4', 'src/main/java/com/habitflow/model/PowerUp.java', 4], ['BaseDao.java:20', 'src/main/java/com/habitflow/db/BaseDao.java', 20], ['Page.java:9', 'src/main/java/com/habitflow/ui/Page.java', 9]],
    },
    {
      req: 'Interfaces (5 defined & implemented)',
      owner: 'C',
      how: 'Schedule (with default & static methods), PowerUpContext (implemented by ShopController.Context), CheckInListener (Observer), Database.SqlWork, and BaseDao.RowMapper.',
      refs: [['Schedule.java:11', 'src/main/java/com/habitflow/model/Schedule.java', 11], ['ShopController.Context:101', 'src/main/java/com/habitflow/controller/ShopController.java', 101], ['Database.SqlWork:25', 'src/main/java/com/habitflow/db/Database.java', 25], ['BaseDao.RowMapper:70', 'src/main/java/com/habitflow/db/BaseDao.java', 70]],
    },
    {
      req: 'Method Overloading & call-by-value',
      owner: 'C',
      how: 'CheckInController.checkIn (3 overloads), StrengthScore.compute (2), Database.inTransaction (2), and Schedule.formatStreak (2). Primitive double is passed by value; Habit reference is copied by value.',
      refs: [['CheckInController:35', 'src/main/java/com/habitflow/controller/CheckInController.java', 35], ['StrengthScore:15', 'src/main/java/com/habitflow/controller/logic/StrengthScore.java', 15], ['Database:69', 'src/main/java/com/habitflow/db/Database.java', 69], ['Schedule:32', 'src/main/java/com/habitflow/model/Schedule.java', 32]],
    },
    {
      req: 'Method Overriding (@Override)',
      owner: 'M',
      how: 'Habit subtypes, 4 Schedule classes, 4 PowerUps, User/Partner roleLabel(), 11 DAOs overriding BaseDao.mapRow(), and 9 JavaFX screens overriding Page.title() & Page.build().',
      refs: [['User.roleLabel:19', 'src/main/java/com/habitflow/model/User.java', 19], ['DayBasedSchedule:14', 'src/main/java/com/habitflow/model/DayBasedSchedule.java', 14], ['TimesPerWeekSchedule:35', 'src/main/java/com/habitflow/model/TimesPerWeekSchedule.java', 35], ['HabitDao.mapRow:20', 'src/main/java/com/habitflow/db/HabitDao.java', 20], ['TodayPage:24', 'src/main/java/com/habitflow/ui/TodayPage.java', 24]],
    },
    {
      req: 'Encapsulation, Inheritance & Polymorphism',
      owner: 'M',
      how: 'Validating setters + DB CHECK constraints; 6 inheritance trees; runtime dispatch in HabitStats.summarize(), ShopController.use(), HabitDao.mapRow(), and MainView.show(Page).',
      refs: [['Habit.setName:51', 'src/main/java/com/habitflow/model/Habit.java', 51], ['HabitStats.summarize:23', 'src/main/java/com/habitflow/controller/HabitStats.java', 23], ['ShopController.use:59', 'src/main/java/com/habitflow/controller/ShopController.java', 59], ['MainView.show:105', 'src/main/java/com/habitflow/ui/MainView.java', 105]],
    },
    {
      req: 'Persistent Storage (14 SQL Tables)',
      owner: 'M',
      how: 'PostgreSQL 16 via raw JDBC (no ORM) across 14 normalized tables with PreparedStatement parameter binding, foreign keys, CHECK constraints, and atomic transactions.',
      refs: [['schema.sql:3', 'src/main/resources/schema.sql', 3], ['Database.java:69', 'src/main/java/com/habitflow/db/Database.java', 69], ['BaseDao.prepare:74', 'src/main/java/com/habitflow/db/BaseDao.java', 74], ['HabitDao.java:53', 'src/main/java/com/habitflow/db/HabitDao.java', 53]],
    },
    {
      req: 'GUI (11 Screens) & Event Handling',
      owner: 'V',
      how: 'JavaFX 21 desktop GUI with 11 screens/dialogs. Button actions flow GUI → Controller → DAO, including PostgreSQL SERIAL RETURNING id auto-generated keys.',
      refs: [['App.java:17', 'src/main/java/com/habitflow/ui/App.java', 17], ['MainView.createHabit:116', 'src/main/java/com/habitflow/ui/MainView.java', 116], ['TodayPage.controls:113', 'src/main/java/com/habitflow/ui/TodayPage.java', 113], ['BaseDao.insert:65', 'src/main/java/com/habitflow/db/BaseDao.java', 65]],
    },
    {
      req: 'Core Functions & User Roles',
      owner: 'C',
      how: 'Registration & 5-attempt lockout login (AuthController), check-ins & mood journal (CheckInController), power-up shop (ShopController), and 3 roles: Visitor, Member (User), and read-only Accountability Partner.',
      refs: [['AuthController.login:34', 'src/main/java/com/habitflow/controller/AuthController.java', 34], ['CheckInController:45', 'src/main/java/com/habitflow/controller/CheckInController.java', 45], ['ShopController.buy:41', 'src/main/java/com/habitflow/controller/ShopController.java', 41], ['Person.java:25', 'src/main/java/com/habitflow/model/Person.java', 25], ['User.java:19', 'src/main/java/com/habitflow/model/User.java', 19]],
    },
  ];

  document.querySelector('#rubricTable tbody').innerHTML = RUBRIC.map(row => \`
    <tr>
      <td><strong>\${esc(row.req)}</strong></td>
      <td><span class="badge badge-\${row.owner}">\${row.owner}</span></td>
      <td>\${esc(row.how)}</td>
      <td style="display:flex;flex-wrap:wrap;gap:5px">
        \${row.refs.map(([lbl, file, ln]) => \`<button type="button" class="link-chip" data-open="\${esc(file)}" data-line="\${ln}">\${esc(lbl)}</button>\`).join('')}
      </td>
    </tr>
  \`).join('');

  // --- Tab 4: Hierarchies, Schema, Screens ---
  const HIERARCHIES = [
    { role: 'M', root: 'abstract class Person', file: 'src/main/java/com/habitflow/model/Person.java', kids: [
      ['User (Member)', 'src/main/java/com/habitflow/model/User.java'],
      ['Partner (Read-only)', null],
    ]},
    { role: 'M', root: 'abstract class Habit', file: 'src/main/java/com/habitflow/model/Habit.java', kids: [
      ['BooleanHabit', null],
      ['CountHabit', null],
      ['DurationHabit', null],
    ]},
    { role: 'M', root: 'interface Schedule', file: 'src/main/java/com/habitflow/model/Schedule.java', kids: [
      ['DayBasedSchedule (abstract)', 'src/main/java/com/habitflow/model/DayBasedSchedule.java'],
      ['DailySchedule', null],
      ['WeekdaySchedule', null],
      ['EveryNDaysSchedule', null],
      ['TimesPerWeekSchedule', 'src/main/java/com/habitflow/model/TimesPerWeekSchedule.java'],
    ]},
    { role: 'M', root: 'abstract class PowerUp', file: 'src/main/java/com/habitflow/model/PowerUp.java', kids: [
      ['StreakFreeze', null],
      ['StreakRepair', null],
      ['DoubleCoins', null],
      ['RestDay', null],
    ]},
    { role: 'M', root: 'abstract class BaseDao<T>', file: 'src/main/java/com/habitflow/db/BaseDao.java', kids: [
      ['HabitDao', 'src/main/java/com/habitflow/db/HabitDao.java'],
      ['UserDao', null],
      ['CheckInDao', null],
      ['CategoryDao', null],
      ['JournalDao', null],
      ['CoinDao', null],
      ['PowerUpDao', null],
      ['AchievementDao', null],
      ['ReminderDao', null],
      ['FriendDao', null],
      ['AuditDao', null],
    ]},
    { role: 'V', root: 'abstract class Page', file: 'src/main/java/com/habitflow/ui/Page.java', kids: [
      ['TodayPage', 'src/main/java/com/habitflow/ui/TodayPage.java'],
      ['HabitsPage', null],
      ['HabitDetailPage', null],
      ['StatsPage', null],
      ['JournalPage', null],
      ['AchievementsPage', null],
      ['FriendsPage', null],
      ['ShopPage', null],
      ['SettingsPage', null],
    ]},
  ];

  const chipOrTag = (label, file) => (file && byId.has(file))
    ? \`<button type="button" class="link-chip" data-open="\${esc(file)}">\${esc(label)}</button>\`
    : \`<span class="tag">\${esc(label)}</span>\`;

  document.getElementById('hierarchiesGrid').innerHTML = HIERARCHIES.map(h => \`
    <div class="card">
      <div class="tree-root">
        <span class="badge badge-\${h.role}" style="margin-right:6px">\${h.role}</span>
        \${chipOrTag(h.root, h.file)}
      </div>
      <div class="tree-children">
        \${h.kids.map(([name, file]) => chipOrTag(name, file)).join('')}
      </div>
    </div>
  \`).join('');

  document.getElementById('schemaGrid').innerHTML = DATA.tables.map(t => \`
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">
        <strong style="font-family:var(--mono);font-size:14px">\${esc(t.name)}</strong>
        <button type="button" class="link-chip" data-open="src/main/resources/schema.sql" data-line="\${t.startLine}">schema.sql:\${t.startLine}</button>
      </div>
      <div style="font-family:var(--mono);font-size:11.5px;display:flex;flex-direction:column;gap:2px">
        \${t.cols.map(c => \`<div><strong style="color:\${c.isConstraint ? 'var(--tok-ann)' : 'var(--text)'}">\${esc(c.name)}</strong> <span class="muted">\${esc(c.type)}</span></div>\`).join('')}
      </div>
    </div>
  \`).join('');

  const allFigures = [...DATA.diagrams, ...DATA.screenshots];
  document.getElementById('figuresGallery').innerHTML = allFigures.map(f => \`
    <figure class="fig-card" style="margin:0">
      <img src="\${esc(f.file)}" alt="\${esc(f.title)}" loading="lazy" data-zoom="\${esc(f.file)}" data-title="\${esc(f.title)}">
      <figcaption class="fig-cap">\${esc(f.title)}</figcaption>
    </figure>
  \`).join('');

  // Lightbox dialog
  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lbImg');
  const lbTitle = document.getElementById('lbTitle');
  document.getElementById('figuresGallery').addEventListener('click', e => {
    const img = e.target.closest('img[data-zoom]');
    if (!img) return;
    lbImg.src = img.dataset.zoom;
    lbImg.alt = img.dataset.title;
    lbTitle.textContent = img.dataset.title;
    lb.showModal();
  });
  document.getElementById('lbClose').addEventListener('click', () => lb.close());
  lb.addEventListener('click', e => { if (e.target === lb) lb.close(); });

  // Initial render of file tree & default file
  renderTree();
  openFile(activeFileId, null, false);
})();
</script>
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log(`Generated ${path.relative(ROOT, OUT)} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
console.log(`Embedded ${stats.totalFiles} files (${stats.javaMainFiles} Java classes, ${stats.tableCount} SQL tables, ${stats.totalLines} lines).`);
