"""Database access. The database is the V2 SQLite database (database/schema.sql); this file only reads and writes it."""
import csv
import importlib.util
import sqlite3
from datetime import date, datetime, timedelta

from . import config

# ---------------------------------------------------------------- connection
def connect(path: str | None = None) -> sqlite3.Connection:
    """A new connection per request, never shared between requests. check_same_thread is off because FastAPI may open
    the connection in one worker thread and run the route in another; the connection is only used by one request at a time."""
    con = sqlite3.connect(path or config.DB_PATH, timeout=30, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")
    con.execute("PRAGMA busy_timeout = 30000")
    return con


def _load_build_module():
    spec = importlib.util.spec_from_file_location("lifestyle_build", config.BUILD_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def init(con: sqlite3.Connection) -> None:
    """Create an empty V2 database (tables, settings, domains, question bank) if there is none yet."""
    if con.execute("SELECT 1 FROM sqlite_master WHERE name='patients'").fetchone():
        return
    build = _load_build_module()
    schema = config.SCHEMA_PATH.read_text(encoding="utf-8")
    body, indexes = schema.split("--@indexes")
    con.executescript(body)
    con.executemany("INSERT INTO settings VALUES (?,?,?)", build.SETTINGS)
    con.executemany("INSERT INTO domains VALUES (?,?,?)", build.DOMAINS)
    cols = ["question_id", "domain", "text", "answer_type", "options", "slot", "parent_id", "show_if", "is_bold",
            "default_graded", "score_rule", "score_day", "assigned_only", "scope", "sort_order"]
    rows = list(csv.DictReader(open(config.QUESTIONS_PATH, encoding="utf-8")))
    for r in sorted(rows, key=lambda r: bool(r["parent_id"])):      # parents first
        con.execute(f'INSERT INTO questions({",".join(cols)}) VALUES ({",".join("?" * len(cols))})',
                    [(r[c] if r[c] != "" else None) for c in cols])
    con.executescript(indexes)
    con.commit()


def settings(con) -> dict:
    return {r["key"]: r["value"] for r in con.execute("SELECT key, value FROM settings")}


def setting_float(con, key: str) -> float:
    return float(con.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()[0])


# ---------------------------------------------------------------- patients
def get_patient(con, patient_id: int):
    return con.execute("SELECT * FROM patients WHERE patient_id = ?", (patient_id,)).fetchone()


def create_patient(con, first: str, last: str, preferred: str | None, enrolled_on: str, domains: set[str]) -> int:
    cur = con.execute(
        "INSERT INTO patients (first_name, last_name, preferred_name, enrolled_on) VALUES (?, ?, ?, ?)",
        (first, last, preferred or first, enrolled_on))
    pid = cur.lastrowid
    con.execute("INSERT INTO patient_domains (patient_id, domain, enabled, default_length, start_date) VALUES (?, 'general', 1, 'full', ?)",
                (pid, enrolled_on))
    con.commit()
    set_domains(con, pid, domains, enrolled_on)
    return pid


# ---------------------------------------------------------------- domains (dated, so scores of earlier days never change)
def active_domains(con, patient_id: int, on: str) -> set[str]:
    """Optional domains that are on for this patient on this day (General is always on and not listed)."""
    rows = con.execute(
        "SELECT domain FROM patient_domains WHERE patient_id = ? AND enabled = 1 AND domain != 'general' "
        "AND start_date <= ? AND (end_date IS NULL OR end_date > ?)", (patient_id, on, on)).fetchall()
    return {r["domain"] for r in rows}


def domain_rows(con, patient_id: int) -> list[sqlite3.Row]:
    return con.execute(
        "SELECT domain, default_length, start_date, end_date FROM patient_domains WHERE patient_id = ? "
        "AND domain != 'general' ORDER BY start_date", (patient_id,)).fetchall()


def default_lengths(con, patient_id: int, on: str) -> dict[str, str]:
    rows = con.execute(
        "SELECT domain, default_length FROM patient_domains WHERE patient_id = ? AND enabled = 1 "
        "AND start_date <= ? AND (end_date IS NULL OR end_date > ?)", (patient_id, on, on)).fetchall()
    return {r["domain"]: r["default_length"] for r in rows}


def patient_default_length(con, patient_id: int, on: str) -> str:
    """The practitioner's per-domain defaults, combined: full if most optional domains default to full (a tie is full).
    General is always on and doesn't vote."""
    d = {k: v for k, v in default_lengths(con, patient_id, on).items() if k != "general"}
    full = sum(1 for v in d.values() if v == "full")
    return "full" if not d or full * 2 >= len(d) else "quick"


def set_domains(con, patient_id: int, domains: set[str], effective: str, lengths: dict[str, str] | None = None) -> None:
    """Make exactly `domains` active from `effective` onward. `lengths` sets the practitioner's default length per domain."""
    lengths = lengths or {}
    current = active_domains(con, patient_id, effective)
    for d in current - domains:
        # Ends on `effective`. A setting that would start on that same day is just removed.
        con.execute("DELETE FROM patient_domains WHERE patient_id = ? AND domain = ? AND end_date IS NULL AND start_date >= ?",
                    (patient_id, d, effective))
        con.execute("UPDATE patient_domains SET end_date = ? WHERE patient_id = ? AND domain = ? AND end_date IS NULL",
                    (effective, patient_id, d))
    for d in domains - current:
        con.execute("INSERT OR REPLACE INTO patient_domains (patient_id, domain, enabled, default_length, start_date) VALUES (?, ?, 1, ?, ?)",
                    (patient_id, d, lengths.get(d, "full"), effective))
    for d, ln in lengths.items():
        if d in domains:
            con.execute("UPDATE patient_domains SET default_length = ? WHERE patient_id = ? AND domain = ? AND end_date IS NULL",
                        (ln, patient_id, d))
    con.commit()


# ---------------------------------------------------------------- check-ins
def get_checkin(con, patient_id: int, day: str, slot: str):
    return con.execute("SELECT * FROM checkins WHERE patient_id = ? AND checkin_day = ? AND slot = ?",
                       (patient_id, day, slot)).fetchone()


def has_checkin(con, patient_id: int, day: str, slot: str) -> bool:
    return get_checkin(con, patient_id, day, slot) is not None


def save_checkin(con, patient_id: int, day: str, slot: str, rows: list[tuple], *, length: str, now: datetime,
                 started_at: str | None, via_popup: bool, edit_hours: int) -> int:
    """Insert a new completed check-in, or replace the answers of an existing one. The edit deadline is fixed when the
    check-in is first completed and never moves. rows = (question_id, value, value_numeric, status)."""
    stamp = now.isoformat(sep=" ", timespec="seconds")
    existing = get_checkin(con, patient_id, day, slot)
    if existing and existing["status"] == "completed":
        cid = existing["checkin_id"]
        con.execute("UPDATE checkins SET length = ? WHERE checkin_id = ?", (length, cid))
        con.execute("DELETE FROM answers WHERE checkin_id = ?", (cid,))
    else:
        if existing:
            con.execute("DELETE FROM checkins WHERE checkin_id = ?", (existing["checkin_id"],))
        deadline = (now + timedelta(hours=edit_hours)).isoformat(sep=" ", timespec="seconds")
        cid = con.execute(
            "INSERT INTO checkins (patient_id, checkin_day, slot, length, status, started_at, completed_at, edit_deadline, via_popup) "
            "VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?)",
            (patient_id, day, slot, length, started_at or stamp, stamp, deadline, int(via_popup))).lastrowid
    con.executemany(
        "INSERT INTO answers (checkin_id, question_id, value, value_numeric, status, answered_at) VALUES (?, ?, ?, ?, ?, ?)",
        [(cid, q, v, n, st, stamp) for q, v, n, st in rows])
    con.commit()
    return cid


def answer_rows(con, patient_id: int, day: str, slot: str | None = None) -> list[sqlite3.Row]:
    """Stored answers (answered or junk, never skipped) for check-ins whose day is `day`."""
    sql = ("SELECT a.question_id, a.value, a.value_numeric, a.status, c.slot FROM checkins c JOIN answers a ON a.checkin_id = c.checkin_id "
           "WHERE c.patient_id = ? AND c.checkin_day = ? AND c.status = 'completed' AND a.status IN ('answered','junk')")
    args = [patient_id, day]
    if slot:
        sql += " AND c.slot = ?"; args.append(slot)
    return con.execute(sql, args).fetchall()


def checkin_slots(con, patient_id: int, start: str, end: str) -> dict[str, set[str]]:
    """{day: {slots submitted}} for completed check-ins (a declined or closed one is not 'submitted')."""
    out: dict[str, set[str]] = {}
    for r in con.execute("SELECT checkin_day, slot FROM checkins WHERE patient_id = ? AND checkin_day BETWEEN ? AND ? "
                         "AND status = 'completed'", (patient_id, start, end)):
        out.setdefault(r["checkin_day"], set()).add(r["slot"])
    return out


def last_activity_day(con, patient_id: int) -> str | None:
    r = con.execute("SELECT MAX(checkin_day) FROM checkins WHERE patient_id = ? AND slot != 'weekly' "
                    "AND status IN ('completed','counted_miss','free_miss')", (patient_id,)).fetchone()
    return r[0]
