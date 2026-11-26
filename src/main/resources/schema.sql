-- HabitFlow schema (PostgreSQL). Idempotent: safe to run on every start.

CREATE TABLE IF NOT EXISTS users (
    id               SERIAL PRIMARY KEY,
    username         VARCHAR(20)  NOT NULL UNIQUE,
    display_name     VARCHAR(50)  NOT NULL,
    password_hash    VARCHAR(100) NOT NULL,
    salt             VARCHAR(50)  NOT NULL,
    failed_attempts  INT          NOT NULL DEFAULT 0,
    locked_until     TIMESTAMP,
    coins            INT          NOT NULL DEFAULT 0 CHECK (coins >= 0),
    created_at       TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
    id       SERIAL PRIMARY KEY,
    user_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name     VARCHAR(30) NOT NULL,
    color    VARCHAR(7)  NOT NULL DEFAULT '#4F7CAC',
    UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS habits (
    id              SERIAL PRIMARY KEY,
    user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id     INT REFERENCES categories(id) ON DELETE SET NULL,
    name            VARCHAR(60) NOT NULL,
    type            VARCHAR(10) NOT NULL CHECK (type IN ('BOOLEAN', 'COUNT', 'DURATION')),
    target          NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (target > 0),
    unit            VARCHAR(20) NOT NULL DEFAULT '',
    schedule_type   VARCHAR(16) NOT NULL CHECK (schedule_type IN ('DAILY', 'WEEKDAYS', 'TIMES_PER_WEEK', 'EVERY_N_DAYS')),
    schedule_param  INT NOT NULL DEFAULT 0,
    color           VARCHAR(7) NOT NULL DEFAULT '#3A7D5C',
    shared          BOOLEAN NOT NULL DEFAULT FALSE,
    archived        BOOLEAN NOT NULL DEFAULT FALSE,
    created_on      DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS check_ins (
    id              SERIAL PRIMARY KEY,
    habit_id        INT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    day             DATE NOT NULL,
    value           NUMERIC(10,2) NOT NULL DEFAULT 0,
    note            VARCHAR(200),
    frozen          BOOLEAN NOT NULL DEFAULT FALSE,
    coins_awarded   INT NOT NULL DEFAULT 0,
    UNIQUE (habit_id, day)
);
CREATE INDEX IF NOT EXISTS idx_check_ins_habit_day ON check_ins (habit_id, day);

CREATE TABLE IF NOT EXISTS journal_entries (
    user_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day      DATE NOT NULL,
    mood     SMALLINT NOT NULL CHECK (mood BETWEEN 1 AND 5),
    note     VARCHAR(500),
    PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS coin_ledger (
    id          SERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta       INT NOT NULL,
    reason      VARCHAR(100) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coin_ledger_user ON coin_ledger (user_id, created_at);

CREATE TABLE IF NOT EXISTS power_ups (
    code         VARCHAR(20) PRIMARY KEY,
    name         VARCHAR(40) NOT NULL,
    description  VARCHAR(200) NOT NULL,
    price        INT NOT NULL CHECK (price > 0)
);

CREATE TABLE IF NOT EXISTS user_power_ups (
    user_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code     VARCHAR(20) NOT NULL REFERENCES power_ups(code),
    qty      INT NOT NULL CHECK (qty >= 0),
    PRIMARY KEY (user_id, code)
);

CREATE TABLE IF NOT EXISTS active_effects (
    id          SERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code        VARCHAR(20) NOT NULL REFERENCES power_ups(code),
    expires_at  TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS achievements (
    code         VARCHAR(20) PRIMARY KEY,
    name         VARCHAR(40) NOT NULL,
    description  VARCHAR(200) NOT NULL,
    reward       INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_achievements (
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code       VARCHAR(20) NOT NULL REFERENCES achievements(code),
    earned_at  TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, code)
);

CREATE TABLE IF NOT EXISTS reminders (
    id         SERIAL PRIMARY KEY,
    habit_id   INT NOT NULL UNIQUE REFERENCES habits(id) ON DELETE CASCADE,
    remind_at  TIME NOT NULL,
    enabled    BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS friendships (
    requester_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status        VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED')),
    created_at    TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (requester_id, addressee_id),
    CHECK (requester_id <> addressee_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id          SERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action      VARCHAR(30) NOT NULL,
    details     VARCHAR(300) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);

-- Catalog data
INSERT INTO power_ups (code, name, description, price) VALUES
 ('STREAK_FREEZE', 'Streak Freeze', 'Held in your inventory. If you miss a due day, it is used automatically and your streak survives.', 50),
 ('STREAK_REPAIR', 'Streak Repair', 'Fill in missed due days from the last 48 hours of one habit and bring its streak back.', 120),
 ('DOUBLE_COINS',  'Double Coins',  'Earn twice the coins for every check-in for the next 24 hours.', 80),
 ('REST_DAY',      'Rest Day',      'Take today off for one habit. Today counts as done, so your streak keeps going.', 60)
ON CONFLICT (code) DO NOTHING;

INSERT INTO achievements (code, name, description, reward) VALUES
 ('FIRST_CHECKIN', 'First Step',      'Complete your first check-in.', 10),
 ('STREAK_7',      'One Week Strong', 'Reach a 7-day streak on any habit.', 30),
 ('STREAK_30',     'Monthly Master',  'Reach a 30-day streak on any habit.', 100),
 ('STREAK_100',    'Centurion',       'Reach a 100-day streak on any habit.', 300),
 ('CHECKINS_100',  'Hundred Club',    'Complete 100 check-ins in total.', 50),
 ('CHECKINS_1000', 'Thousand Club',   'Complete 1000 check-ins in total.', 250),
 ('PERFECT_DAY',   'Perfect Day',     'Finish every habit that is due today.', 20),
 ('FIVE_HABITS',   'Collector',       'Track 5 active habits at once.', 20),
 ('FIRST_FRIEND',  'Better Together', 'Get your first accountability partner.', 25),
 ('FIRST_PURCHASE','Shopper',         'Buy your first power-up.', 10),
 ('JOURNAL_7',     'Reflective',      'Write 7 journal entries.', 30)
ON CONFLICT (code) DO NOTHING;
