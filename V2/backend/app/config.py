"""Where things live and the few numbers that are not in the database.

Every scoring number (green zone start, skipped value, free-miss window, edit window ...) lives in the database's
`settings` table (database/build_v2_db.py lists the defaults). Change it there, not here.
"""
import os
from datetime import date, datetime, timedelta
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATABASE_DIR = Path(os.environ.get("TRACKER_DATABASE_DIR", BACKEND_DIR.parent / "database"))

# SQLite file for the app (separate from the big research database). Create it with seed_demo.py.
DB_PATH = os.environ.get("TRACKER_DB", str(BACKEND_DIR / "app.db"))

# The scoring rules are shared with the database build, so there is one copy of them.
SCORING_PATH = Path(os.environ.get("TRACKER_SCORING", DATABASE_DIR / "scoring.py"))
SCHEMA_PATH = DATABASE_DIR / "schema.sql"
QUESTIONS_PATH = DATABASE_DIR / "questions_v2.csv"
BUILD_PATH = DATABASE_DIR / "build_v2_db.py"

# The admin view flags a patient after this many days below the green zone / without a check-in.
ALERT_AFTER_DAYS_BELOW = 3
ALERT_AFTER_DAYS_MISSED = 3

# For tests and demos: pretend it is this moment (ISO, e.g. 2026-11-10T10:00:00).
NOW_OVERRIDE = os.environ.get("TRACKER_NOW")


def now() -> datetime:
    return datetime.fromisoformat(NOW_OVERRIDE) if NOW_OVERRIDE else datetime.now()


def calendar_today() -> date:
    return now().date()


def checkin_today(day_start_hour: int = 4) -> date:
    """A check-in day runs from 4 AM to 4 AM, so at 2 AM it is still 'yesterday'."""
    return (now() - timedelta(hours=day_start_hour)).date()
