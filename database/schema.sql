-- SQLite schema for the synthetic check-in prototype (testing data only).
-- Applied by build_db.py. Indexes are created AFTER bulk load (see schema_indexes.sql section below)
-- so loading stays fast.

PRAGMA foreign_keys = ON;

CREATE TABLE question_bank (
    question_id    TEXT PRIMARY KEY,
    domain         TEXT NOT NULL CHECK (domain IN
                     ('general','physical_activity','nutrition','mindfulness','sleep','social','substance_use','provider')),
    period         TEXT NOT NULL CHECK (period IN ('morning','evening','weekly')),
    role           TEXT NOT NULL CHECK (role IN ('primary','followup','conditional','provider')),
    source         TEXT NOT NULL CHECK (source IN ('core','provider_example')),
    response_type  TEXT NOT NULL,
    options        TEXT,               -- pipe-separated choices, NULL for free text
    question_text  TEXT NOT NULL
);

CREATE TABLE users (
    user_id             INTEGER PRIMARY KEY,
    enrolled_on         TEXT NOT NULL,   -- ISO date
    domains             TEXT NOT NULL,   -- pipe-separated
    goal_domain         TEXT NOT NULL,
    base_tier           TEXT NOT NULL CHECK (base_tier IN ('quick','standard','extended')),
    provider_questions  TEXT,            -- pipe-separated question_ids added by a provider
    sim_adherence       REAL,            -- simulation traits: drop these in the real app
    sim_motivation      REAL,
    sim_step_target     INTEGER
);

CREATE TABLE user_names (
    user_id         INTEGER PRIMARY KEY REFERENCES users(user_id),
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    full_name       TEXT NOT NULL,
    preferred_name  TEXT NOT NULL
);

-- One row per user_domain pair, so the app doesn't have to split the pipe-separated string.
CREATE TABLE user_domains (
    user_id    INTEGER NOT NULL REFERENCES users(user_id),
    domain     TEXT NOT NULL,
    is_goal    INTEGER NOT NULL CHECK (is_goal IN (0,1)),
    PRIMARY KEY (user_id, domain)
);

CREATE TABLE fitness_records (
    record_id           INTEGER PRIMARY KEY,   -- row order in the original CSV
    user_id             INTEGER NOT NULL REFERENCES users(user_id),
    date                TEXT NOT NULL,         -- ISO date
    steps               INTEGER,
    calories_burned     REAL,
    distance_km         REAL,
    active_minutes      INTEGER,
    sleep_hours         REAL,
    heart_rate_avg      INTEGER,
    workout_type        TEXT,
    weather_conditions  TEXT,
    location            TEXT,
    mood                TEXT
);

CREATE TABLE checkins (
    checkin_id    INTEGER PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(user_id),
    date          TEXT NOT NULL,
    period        TEXT NOT NULL CHECK (period IN ('morning','evening','weekly')),
    tier_offered  TEXT NOT NULL CHECK (tier_offered IN ('quick','standard','extended')),
    status        TEXT NOT NULL CHECK (status IN ('completed','partial','skipped')),
    n_answered    INTEGER NOT NULL,
    submitted_at  TEXT,                       -- NULL when skipped
    UNIQUE (user_id, date, period)
);

CREATE TABLE responses (
    response_id       INTEGER PRIMARY KEY,
    checkin_id        INTEGER NOT NULL REFERENCES checkins(checkin_id),
    user_id           INTEGER NOT NULL REFERENCES users(user_id),
    date              TEXT NOT NULL,
    period            TEXT NOT NULL,
    domain            TEXT NOT NULL,
    question_id       TEXT NOT NULL REFERENCES question_bank(question_id),
    response_value    TEXT NOT NULL,
    response_numeric  REAL                      -- scales, yes/no (1/0), minutes, counts; NULL otherwise
);

CREATE TABLE tier_events (
    event_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(user_id),
    date       TEXT NOT NULL,
    event      TEXT NOT NULL CHECK (event IN ('auto_downgrade','upgrade_offer_accepted','upgrade_offer_declined')),
    from_tier  TEXT NOT NULL,
    to_tier    TEXT NOT NULL,
    reason     TEXT
);

-- ---- convenience view for the backend: every answer with its question text ----
CREATE VIEW v_responses AS
SELECT r.response_id, r.user_id, r.date, r.period, r.domain, r.question_id,
       q.question_text, q.role, r.response_value, r.response_numeric,
       c.status AS checkin_status, c.tier_offered
FROM responses r
JOIN question_bank q ON q.question_id = r.question_id
JOIN checkins c      ON c.checkin_id  = r.checkin_id;

-- ---- INDEXES (build_db.py runs everything below this line after the bulk load) ----
--@indexes
CREATE INDEX idx_fitness_user_date   ON fitness_records (user_id, date);
CREATE INDEX idx_checkins_user_date  ON checkins (user_id, date);
CREATE INDEX idx_checkins_status     ON checkins (status);
CREATE INDEX idx_responses_checkin   ON responses (checkin_id);
CREATE INDEX idx_responses_user_date ON responses (user_id, date);
CREATE INDEX idx_responses_question  ON responses (question_id);
CREATE INDEX idx_tier_events_user    ON tier_events (user_id, date);
