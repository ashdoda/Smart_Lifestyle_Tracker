"""All the numbers the team may want to tweak live here."""
import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent

# SQLite file for the app (separate from the synthetic research database).
DB_PATH = os.environ.get("TRACKER_DB", str(BACKEND_DIR / "app.db"))

QUESTIONS_PATH = BACKEND_DIR / "questions.json"

# ---- Green zone ----------------------------------------------------------
# A day is "in the green zone" when its score is at or above this percentage.
# 70% = 7/10 = +4 on the -10..+10 graph.
GREEN_ZONE_MIN_PERCENT = 70

# The graph also gets a rolling average line over this many days, which is
# steadier than single days (most patients only have a few graded questions).
ROLLING_AVERAGE_DAYS = 7

# The admin view flags a patient once they have been below the green zone
# this many days in a row.
ALERT_AFTER_DAYS_BELOW = 3


def percent_to_graph(percent: float) -> float:
    """0% -> -10, 50% -> 0, 100% -> +10 (the whiteboard scale)."""
    return round(percent / 5 - 10, 2)


GREEN_ZONE_MIN_GRAPH = percent_to_graph(GREEN_ZONE_MIN_PERCENT)
