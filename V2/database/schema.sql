-- V2 schema: storage and graphing. The backend computes scores; the database stores answers plus a snapshot.
PRAGMA foreign_keys = ON;

CREATE TABLE settings (            -- every tunable number lives here (includes graph_min_days: scored days before the patient graph appears)
  key TEXT PRIMARY KEY, value TEXT NOT NULL, note TEXT);

CREATE TABLE domains (
  domain TEXT PRIMARY KEY, name TEXT NOT NULL, is_general INTEGER NOT NULL DEFAULT 0);

CREATE TABLE patients (
  patient_id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL, last_name TEXT NOT NULL, preferred_name TEXT,
  enrolled_on TEXT NOT NULL,                   -- ISO date
  fitness_user_id INTEGER,                     -- links to fitness_records (watch data); NULL for app-created patients
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE patient_domains (
  patient_id INTEGER NOT NULL REFERENCES patients(patient_id),
  domain TEXT NOT NULL REFERENCES domains(domain),
  enabled INTEGER NOT NULL DEFAULT 1,
  default_length TEXT NOT NULL DEFAULT 'full' CHECK (default_length IN ('quick','full')),
  start_date TEXT NOT NULL, end_date TEXT,
  PRIMARY KEY (patient_id, domain, start_date));

CREATE TABLE questions (
  question_id TEXT PRIMARY KEY,
  domain TEXT NOT NULL REFERENCES domains(domain),
  text TEXT NOT NULL,                          -- first person (I / my)
  answer_type TEXT NOT NULL CHECK (answer_type IN ('yes_no','scale10','text','choice','multi_choice','number','time')),
  options TEXT,                                -- pipe-separated choices
  slot TEXT NOT NULL CHECK (slot IN ('morning','evening','weekly')),
  parent_id TEXT REFERENCES questions(question_id),   -- sub-question: only shown if parent answered
  show_if TEXT,                                -- e.g. '=Yes', '<=4', '>=2' tested against the parent's answer
  is_bold INTEGER NOT NULL DEFAULT 0,          -- always asked when the domain is on (quick mode)
  default_graded INTEGER NOT NULL DEFAULT 0,
  score_rule TEXT CHECK (score_rule IN ('yes1','no1','scale10','goal4','filled')),
  score_day TEXT NOT NULL DEFAULT 'same' CHECK (score_day IN ('same','previous')),
  assigned_only INTEGER NOT NULL DEFAULT 0,    -- 1 = practitioner-added: asked only where a patient_questions row enables it
  scope TEXT NOT NULL DEFAULT 'clinic' CHECK (scope IN ('clinic','patient')),
  patient_id INTEGER REFERENCES patients(patient_id), -- set when scope = 'patient'
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0);        -- order inside a domain and slot (children follow their parent)

CREATE TABLE patient_questions (               -- the practitioner's two switches per patient per question
  patient_id INTEGER NOT NULL REFERENCES patients(patient_id),
  question_id TEXT NOT NULL REFERENCES questions(question_id),
  enabled INTEGER NOT NULL DEFAULT 1,
  graded INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (patient_id, question_id));

CREATE TABLE checkins (
  checkin_id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(patient_id),
  checkin_day TEXT NOT NULL,                   -- the 4 AM - 4 AM day it belongs to
  slot TEXT NOT NULL CHECK (slot IN ('morning','evening','weekly')),
  length TEXT NOT NULL DEFAULT 'full' CHECK (length IN ('quick','full')),
  status TEXT NOT NULL CHECK (status IN ('completed','free_miss','counted_miss','closed_unstarted')),
  started_at TEXT, completed_at TEXT,
  edit_deadline TEXT,                          -- completed_at + 24 h, fixed, never rolling
  via_popup INTEGER NOT NULL DEFAULT 0,        -- answered through the "reflect on last night / this morning" popup
  UNIQUE (patient_id, checkin_day, slot));

CREATE TABLE answers (
  answer_id INTEGER PRIMARY KEY,
  checkin_id INTEGER NOT NULL REFERENCES checkins(checkin_id),
  question_id TEXT NOT NULL REFERENCES questions(question_id),
  value TEXT, value_numeric REAL,              -- numeric answers (0-10, goal level 0-3, minutes); NULL otherwise
  status TEXT NOT NULL CHECK (status IN ('answered','skipped','optional_skip','junk')),
  answered_at TEXT,
  graded INTEGER, points_possible REAL, points_earned REAL,   -- snapshot, filled in by the backend when scored
  UNIQUE (checkin_id, question_id));

CREATE TABLE domain_scores (
  patient_id INTEGER NOT NULL, day TEXT NOT NULL, domain TEXT NOT NULL,
  score REAL NOT NULL, n_graded INTEGER NOT NULL,       -- score in -1..+1
  PRIMARY KEY (patient_id, day, domain));

CREATE TABLE daily_scores (
  patient_id INTEGER NOT NULL, day TEXT NOT NULL,
  base_score REAL NOT NULL,                    -- mean of domain scores x 10
  completion_credit REAL NOT NULL,
  score REAL NOT NULL,                         -- clamped to -10..+10; this is the graph value
  computed_at TEXT NOT NULL,
  PRIMARY KEY (patient_id, day));

CREATE TABLE fitness_records (                 -- watch data, same as V1 (several rows per user-day exist in the source)
  record_id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, date TEXT NOT NULL, steps INTEGER, calories_burned REAL, distance_km REAL,
  active_minutes INTEGER, sleep_hours REAL, heart_rate_avg INTEGER, workout_type TEXT,
  weather_conditions TEXT, location TEXT, mood TEXT);

-- ---- views: graph line and practitioner flags ----
-- What the PATIENT sees: only the rolling line and whether it is in the green zone. No daily score.
CREATE VIEW v_patient_graph AS
SELECT r.patient_id, r.day, ROUND(r.rolling_score, 2) AS rolling_score,
       r.rolling_score >= (SELECT CAST(value AS REAL) FROM settings WHERE key = 'green_min') AS in_green_zone
FROM v_rolling_scores r
WHERE (SELECT COUNT(*) FROM daily_scores x WHERE x.patient_id = r.patient_id AND x.day <= r.day)
      >= (SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'graph_min_days');

CREATE VIEW v_rolling_scores AS
SELECT d.patient_id, d.day, d.score,
  (SELECT AVG(x.score) FROM daily_scores x
    WHERE x.patient_id = d.patient_id AND x.day BETWEEN date(d.day,'-6 days') AND d.day) AS rolling_score
FROM daily_scores d;

CREATE VIEW v_flag_late AS
SELECT patient_id, checkin_day, slot, completed_at FROM checkins WHERE via_popup = 1;

CREATE VIEW v_flag_batched AS
SELECT m.patient_id, m.checkin_day, m.completed_at AS morning_completed_at, e.completed_at AS evening_completed_at,
       ROUND(ABS(julianday(e.completed_at) - julianday(m.completed_at)) * 1440) AS minutes_apart
FROM checkins m JOIN checkins e
  ON e.patient_id = m.patient_id AND e.checkin_day = m.checkin_day AND e.slot = 'evening'
WHERE m.slot = 'morning' AND m.status = 'completed' AND e.status = 'completed'
  AND ABS(julianday(e.completed_at) - julianday(m.completed_at)) * 1440
      <= (SELECT CAST(value AS REAL) FROM settings WHERE key = 'batch_minutes');

CREATE VIEW v_flag_free_miss AS
SELECT patient_id, checkin_day, slot FROM checkins WHERE status = 'free_miss';

CREATE VIEW v_flag_below_green_3 AS
WITH ranked AS (
  SELECT patient_id, day, score, ROW_NUMBER() OVER (PARTITION BY patient_id ORDER BY day DESC) AS rn
  FROM daily_scores WHERE day < (SELECT value FROM settings WHERE key = 'as_of'))
SELECT patient_id, MAX(day) AS latest_day FROM ranked
WHERE rn <= 3 GROUP BY patient_id
HAVING COUNT(*) = 3 AND SUM(score < (SELECT CAST(value AS REAL) FROM settings WHERE key = 'green_min')) = 3;

CREATE VIEW v_flag_missed_3 AS
SELECT patient_id, MAX(checkin_day) AS last_checkin_day,
       CAST(julianday((SELECT value FROM settings WHERE key = 'as_of')) - julianday(MAX(checkin_day)) AS INTEGER) - 1 AS days_missed
FROM checkins GROUP BY patient_id HAVING days_missed >= 3;

-- ---- indexes: build_v2_db.py runs these after the bulk load ----
--@indexes
CREATE INDEX idx_checkins_patient_day ON checkins (patient_id, checkin_day);
CREATE INDEX idx_checkins_status      ON checkins (status);
CREATE INDEX idx_answers_checkin      ON answers (checkin_id);
CREATE INDEX idx_fitness_user_date    ON fitness_records (user_id, date);
CREATE INDEX idx_patient_domains      ON patient_domains (patient_id);
