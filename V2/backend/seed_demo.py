"""Fill app.db with demo data:  python seed_demo.py [--source ../database/sample.db] [--db app.db] [--reset]

Copies the V2 sample database (50 patients, about 2 months of check-ins), moves every date so the last check-in
is YESTERDAY (so today is free for the front end to test with), and re-scores everyone with the backend's rules.
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
             ("domain_scores", "day", "d"), ("fitness_records", "date", "d")]


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
    con.execute("UPDATE patients SET enrolled_on = COALESCE((SELECT MIN(checkin_day) FROM checkins c WHERE c.patient_id = patients.patient_id), enrolled_on)")
    con.execute("UPDATE settings SET value = ? WHERE key = 'as_of'", (config.checkin_today().isoformat(),))
    con.commit()
    con.close()
    con = db.connect(str(target))
    ids = [r[0] for r in con.execute("SELECT patient_id FROM patients")]
    for i in ids:
        scoring.rescore(con, i)
    con.close()
    print(f"{target}: {len(ids)} patients, dates moved {delta:+d} days (last check-in {yesterday}).")


if __name__ == "__main__":
    main()
