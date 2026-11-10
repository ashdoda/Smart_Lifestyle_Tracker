"""Fill app.db with demo data:  python seed_demo.py [--source ../database/sample.db] [--db app.db] [--reset]

Copies the V2 sample database, moves every check-in date so the last check-in is YESTERDAY (so today is free for the front
end to test with), keeps 365 days of history, places the watch data from 365 days back to 35 days ahead, and re-scores everyone.
"""
import argparse
import shutil
import sqlite3
import sys
from datetime import timedelta
from pathlib import Path

from app import config, db, scoring

DATE_COLS = [("patients", "enrolled_on", "d"), ("patient_domains", "start_date", "d"), ("patient_domains", "end_date", "d"),
             ("checkins", "checkin_day", "d"), ("checkins", "started_at", "t"), ("checkins", "completed_at", "t"),
             ("checkins", "edit_deadline", "t"), ("answers", "answered_at", "t"), ("daily_scores", "day", "d"),
             ("domain_scores", "day", "d")]       # watch data is placed separately (see place_fitness)

DAYS_BACK = 365          # check-ins and watch data reach this far back from today
DAYS_AHEAD = 35          # watch data also exists this far into the future
SOURCE_SPAN = DAYS_BACK + DAYS_AHEAD   # 400 days of real watch data


def place_fitness(con, today):
    """Keep only the linked patients' watch data (steps), take the last 400 days of the source (real gaps stay gaps), and move the dates so the slice runs from 365 days before today to 35 days after."""
    src_end = con.execute("SELECT MAX(date) FROM fitness_records").fetchone()[0]
    shift = int(con.execute("SELECT julianday(?) - julianday(?)", (today.isoformat(), src_end)).fetchone()[0]) + DAYS_AHEAD
    con.execute("DROP TABLE IF EXISTS _fit")
    con.execute("""CREATE TABLE _fit AS
        SELECT user_id, date(date, ?) AS date, steps FROM fitness_records
        WHERE user_id IN (SELECT fitness_user_id FROM patients WHERE fitness_user_id IS NOT NULL) AND date > date(?, ?)""",
                (f"{shift:+d} days", src_end, f"-{SOURCE_SPAN} days"))
    con.execute("DELETE FROM fitness_records")
    con.execute("INSERT INTO fitness_records (user_id, date, steps) SELECT user_id, date, steps FROM _fit ORDER BY user_id, date")
    con.execute("DROP TABLE _fit")


def trim_history(con, start):
    """Drop check-ins (and their answers and scores) older than `start`."""
    s = start.isoformat()
    con.execute("DELETE FROM answers WHERE checkin_id IN (SELECT checkin_id FROM checkins WHERE checkin_day < ?)", (s,))
    con.execute("DELETE FROM checkins WHERE checkin_day < ?", (s,))
    con.execute("DELETE FROM daily_scores WHERE day < ?", (s,))
    con.execute("DELETE FROM domain_scores WHERE day < ?", (s,))
    con.execute("DELETE FROM patient_domains WHERE end_date IS NOT NULL AND end_date <= ?", (s,))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default=str(config.DATABASE_DIR / "sample.db"))
    ap.add_argument("--db", default=config.DB_PATH)
    ap.add_argument("--reset", action="store_true", help="replace an existing database")
    a = ap.parse_args()
    target = Path(a.db)
    if target.exists() and not a.reset:
        sys.exit(f"{target} already exists. Use --reset to replace it.")
    for ext in ("", "-wal", "-shm"):
        Path(str(target) + ext).unlink(missing_ok=True)
    shutil.copyfile(a.source, target)
    con = sqlite3.connect(target)
    last = con.execute("SELECT MAX(checkin_day) FROM checkins").fetchone()[0]
    yesterday = (config.checkin_today() - timedelta(days=1)).isoformat()
    delta = (sqlite3.connect(":memory:").execute("SELECT julianday(?) - julianday(?)", (yesterday, last)).fetchone()[0])
    delta = int(delta)
    for table, col, kind in DATE_COLS:
        fn = "date" if kind == "d" else "datetime"
        for step in (4000, delta - 4000):       # two hops so rows never collide with each other on the way
            con.execute(f"UPDATE {table} SET {col} = {fn}({col}, '{step:+d} days') WHERE {col} IS NOT NULL")
    today = config.checkin_today()
    trim_history(con, today - timedelta(days=DAYS_BACK))
    place_fitness(con, today)
    con.execute("UPDATE patients SET enrolled_on = COALESCE((SELECT MIN(checkin_day) FROM checkins c WHERE c.patient_id = patients.patient_id), enrolled_on)")
    con.execute("UPDATE settings SET value = ? WHERE key = 'as_of'", (config.checkin_today().isoformat(),))
    con.commit()
    con.execute("VACUUM")
    con.close()
    con = db.connect(str(target))
    ids = [r[0] for r in con.execute("SELECT patient_id FROM patients")]
    for i in ids:
        scoring.rescore(con, i)
    fit = con.execute("SELECT COUNT(*), COUNT(DISTINCT user_id), MIN(date), MAX(date) FROM fitness_records").fetchone()
    con.close()
    print(f"{target}: {len(ids)} patients, check-ins {DAYS_BACK} days back to {yesterday}; "
          f"watch data {fit[0]} rows for {fit[1]} people, {fit[2]} to {fit[3]}.")


if __name__ == "__main__":
    main()
