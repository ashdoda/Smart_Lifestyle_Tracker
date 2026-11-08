import json
import sqlite3
from datetime import date

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS patients (
    patient_id      INTEGER PRIMARY KEY,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    preferred_name  TEXT,
    enrolled_on     TEXT NOT NULL            -- ISO date
);

-- Which optional domains (D1-D6) are switched on, with dates, so turning a
-- domain on today doesn't change the scores of earlier days.
CREATE TABLE IF NOT EXISTS domain_settings (
    setting_id   INTEGER PRIMARY KEY,
    patient_id   INTEGER NOT NULL REFERENCES patients(patient_id),
    domain       TEXT NOT NULL,
    start_date   TEXT NOT NULL,              -- active from this date
    end_date     TEXT                        -- active until the day before this; NULL = still on
);
CREATE INDEX IF NOT EXISTS idx_domain_settings ON domain_settings (patient_id, domain);

CREATE TABLE IF NOT EXISTS checkins (
    checkin_id    INTEGER PRIMARY KEY,
    patient_id    INTEGER NOT NULL REFERENCES patients(patient_id),
    date          TEXT NOT NULL,
    period        TEXT NOT NULL CHECK (period IN ('morning','evening')),
    submitted_at  TEXT NOT NULL,
    UNIQUE (patient_id, date, period)
);

CREATE TABLE IF NOT EXISTS answers (
    checkin_id   INTEGER NOT NULL REFERENCES checkins(checkin_id) ON DELETE CASCADE,
    question_id  TEXT NOT NULL,
    value        TEXT NOT NULL,              -- JSON-encoded (string, number or list)
    PRIMARY KEY (checkin_id, question_id)
);
"""


def connect(path: str | None = None) -> sqlite3.Connection:
    con = sqlite3.connect(path or config.DB_PATH, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def init(con: sqlite3.Connection) -> None:
    con.executescript(SCHEMA)
    con.commit()


# ---- domains ---------------------------------------------------------------

def active_domains(con, patient_id: int, on: str) -> set[str]:
    rows = con.execute(
        "SELECT domain FROM domain_settings WHERE patient_id = ? AND start_date <= ? "
        "AND (end_date IS NULL OR end_date > ?)",
        (patient_id, on, on),
    ).fetchall()
    return {r["domain"] for r in rows}


def domain_rows(con, patient_id: int) -> list[sqlite3.Row]:
    return con.execute(
        "SELECT domain, start_date, end_date FROM domain_settings WHERE patient_id = ? ORDER BY start_date",
        (patient_id,),
    ).fetchall()


def set_domains(con, patient_id: int, domains: set[str], effective: str) -> None:
    """Make exactly `domains` active from `effective` onward."""
    current = active_domains(con, patient_id, effective)
    for d in current - domains:
        # Ends on `effective`. A setting that would start on that same day is just removed.
        con.execute(
            "DELETE FROM domain_settings WHERE patient_id = ? AND domain = ? AND end_date IS NULL AND start_date >= ?",
            (patient_id, d, effective),
        )
        con.execute(
            "UPDATE domain_settings SET end_date = ? WHERE patient_id = ? AND domain = ? AND end_date IS NULL",
            (effective, patient_id, d),
        )
    for d in domains - current:
        con.execute(
            "INSERT INTO domain_settings (patient_id, domain, start_date) VALUES (?, ?, ?)",
            (patient_id, d, effective),
        )
    con.commit()


# ---- check-ins -------------------------------------------------------------

def save_checkin(con, patient_id: int, day: str, period: str, answers: dict, submitted_at: str) -> None:
    """Insert or replace a check-in (patients may re-submit to edit the same day)."""
    con.execute(
        "INSERT INTO checkins (patient_id, date, period, submitted_at) VALUES (?, ?, ?, ?) "
        "ON CONFLICT (patient_id, date, period) DO UPDATE SET submitted_at = excluded.submitted_at",
        (patient_id, day, period, submitted_at),
    )
    cid = con.execute(
        "SELECT checkin_id FROM checkins WHERE patient_id = ? AND date = ? AND period = ?",
        (patient_id, day, period),
    ).fetchone()["checkin_id"]
    con.execute("DELETE FROM answers WHERE checkin_id = ?", (cid,))
    con.executemany(
        "INSERT INTO answers (checkin_id, question_id, value) VALUES (?, ?, ?)",
        [(cid, q, json.dumps(v)) for q, v in answers.items()],
    )
    con.commit()


def answers_by_date(con, patient_id: int, start: str, end: str) -> dict[str, dict]:
    """{date: {question_id: value}} with morning and evening merged (question ids are unique)."""
    out: dict[str, dict] = {}
    rows = con.execute(
        "SELECT c.date, a.question_id, a.value FROM checkins c JOIN answers a ON a.checkin_id = c.checkin_id "
        "WHERE c.patient_id = ? AND c.date BETWEEN ? AND ?",
        (patient_id, start, end),
    )
    for r in rows:
        out.setdefault(r["date"], {})[r["question_id"]] = json.loads(r["value"])
    return out


def checkin_periods(con, patient_id: int, start: str, end: str) -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    for r in con.execute(
        "SELECT date, period FROM checkins WHERE patient_id = ? AND date BETWEEN ? AND ?",
        (patient_id, start, end),
    ):
        out.setdefault(r["date"], set()).add(r["period"])
    return out


def get_patient(con, patient_id: int):
    return con.execute("SELECT * FROM patients WHERE patient_id = ?", (patient_id,)).fetchone()


def today() -> str:
    return date.today().isoformat()
