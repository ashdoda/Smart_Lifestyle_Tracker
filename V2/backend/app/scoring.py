"""Scores in the shape the front end already reads.

The rules themselves live in database/scoring.py (one copy, shared with the database build). This file
  - loads that module (as `core`) and re-scores a patient after every save,
  - reads the stored daily/domain scores back as day objects (percent, graph_value, rolling_*, in_green_zone ...),
  - works out the flags the practitioner sees.
V2 scores run 0..100, so percent and graph_value are the score itself (score_out_of_10 = score / 10).
"""
import importlib.util
from datetime import date, datetime, timedelta

from . import config

_spec = importlib.util.spec_from_file_location("lifestyle_scoring", config.SCORING_PATH)
core = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(core)


def _d(s: str) -> date:
    return date.fromisoformat(s)


def _plus(s: str, n: int) -> str:
    return (_d(s) + timedelta(days=n)).isoformat()


def rescore(con, patient_id: int, days: list[str] | None = None):
    """Re-score the given days (or everything). A day depends only on its own check-ins and the next morning's sleep answer."""
    results = core.score_patient(con, patient_id, True, days=days)
    con.commit()
    return results


def to_percent(score: float) -> float:
    return round(score, 1)


def summary_numbers(score: float | None, green_min: float) -> dict:
    if score is None:
        return {"percent": None, "score_out_of_10": None, "graph_value": None, "in_green_zone": None}
    p = to_percent(score)
    return {"percent": p, "score_out_of_10": round(score / 10, 2), "graph_value": round(score, 2),
            "in_green_zone": score >= green_min}


def day_items(con, patient_id: int, day: str) -> list[dict]:
    """Per-question points counted toward `day` (the sleep answer given the next morning counts for this day)."""
    rows = con.execute("""
        SELECT a.question_id, q.domain, a.value, a.value_numeric, a.status, a.points_earned, c.checkin_day, q.text
        FROM answers a JOIN checkins c ON c.checkin_id = a.checkin_id JOIN questions q ON q.question_id = a.question_id
        WHERE c.patient_id = ? AND a.graded = 1
          AND ((c.checkin_day = ? AND q.score_day = 'same') OR (c.checkin_day = ? AND q.score_day = 'previous'))
        ORDER BY q.domain, q.sort_order""", (patient_id, day, _plus(day, 1))).fetchall()
    return [{"question_id": r["question_id"], "domain": r["domain"], "answer": r["value"], "status": r["status"],
             "points": r["points_earned"], "answered_on": r["checkin_day"]} for r in rows]


def day_list(con, patient_id: int, start: str, end: str, today: str, with_items: bool = False) -> list[dict]:
    """One object per calendar day from start to end, with 7-day rolling averages (computed with the days before start)."""
    green = core.setting(con, "green_min")
    window = int(core.setting(con, "rolling_days"))
    lookback = _plus(start, -(window - 1))
    scored = {r["day"]: r["score"] for r in con.execute(
        "SELECT day, score FROM daily_scores WHERE patient_id = ? AND day BETWEEN ? AND ?", (patient_id, lookback, end))}
    doms: dict[str, dict] = {}
    for r in con.execute("SELECT day, domain, score, n_graded FROM domain_scores WHERE patient_id = ? AND day BETWEEN ? AND ?",
                         (patient_id, start, end)):
        doms.setdefault(r["day"], {})[r["domain"]] = {"earned": round(r["score"] * r["n_graded"], 3), "possible": r["n_graded"],
                                                       "score": round(r["score"], 3), "percent": round((r["score"] + 1) * 50, 1)}
    slots = {}
    for r in con.execute("SELECT checkin_day, slot, status FROM checkins WHERE patient_id = ? AND checkin_day BETWEEN ? AND ? AND slot != 'weekly'",
                         (patient_id, start, end)):
        slots.setdefault(r["checkin_day"], {})[r["slot"]] = r["status"]
    out, d = [], _d(start)
    while d.isoformat() <= end:
        ds = d.isoformat()
        s = scored.get(ds)
        recent = [scored[k] for k in (_plus(ds, -i) for i in range(window)) if k in scored]
        roll = sum(recent) / len(recent) if recent else None
        item = {"date": ds, "score": None if s is None else round(s, 2), "in_progress": ds == today,
                "domains": doms.get(ds, {}),
                "possible": sum(x["possible"] for x in doms.get(ds, {}).values()),
                "earned": round(sum(x["earned"] for x in doms.get(ds, {}).values()), 3),
                "checkins_done": sorted(k for k, v in slots.get(ds, {}).items() if v == "completed"),
                "checkins_status": slots.get(ds, {})}
        item.update(summary_numbers(s, green))
        r = summary_numbers(roll, green)
        item["rolling_score"] = None if roll is None else round(roll, 2)
        item["rolling_percent"], item["rolling_graph_value"], item["rolling_in_green_zone"] = r["percent"], r["graph_value"], r["in_green_zone"]
        if with_items:
            item["items"] = day_items(con, patient_id, ds)
        out.append(item)
        d += timedelta(days=1)
    return out


def days_below_green_streak(days: list[dict]) -> int:
    """Consecutive most-recent finished, scored days below the green zone (today is skipped while in progress)."""
    n = 0
    for d in reversed(days):
        if d["in_progress"] or d["score"] is None:
            continue
        if d["in_green_zone"]:
            break
        n += 1
    return n


def days_missed(con, patient_id: int, today: str) -> int:
    """Whole check-in days since the last real activity (0 when they checked in yesterday or today)."""
    last = con.execute("SELECT MAX(checkin_day) FROM checkins WHERE patient_id = ? AND slot != 'weekly' AND status = 'completed'",
                       (patient_id,)).fetchone()[0]
    if not last:
        return 0
    return max(0, (_d(today) - _d(last)).days - 1)


def flags(con, patient_id: int, today: str, since: str | None = None) -> list[dict]:
    """Practitioner flags, newest first: late (via popup), batched (both slots within batch_minutes), free miss used,
    3 days below green, 3+ days missed."""
    since = since or _plus(today, -30)
    out = []
    for r in con.execute("SELECT checkin_day, slot, completed_at FROM checkins WHERE patient_id = ? AND via_popup = 1 AND checkin_day >= ?",
                         (patient_id, since)):
        out.append({"type": "late", "day": r["checkin_day"], "slot": r["slot"], "at": r["completed_at"],
                    "text": f"{r['slot'].capitalize()} check-in for {r['checkin_day']} was filled in late, through the reminder."})
    mins = core.setting(con, "batch_minutes")
    for r in con.execute("""SELECT m.checkin_day, m.completed_at AS mc, e.completed_at AS ec,
            ROUND(ABS(julianday(e.completed_at) - julianday(m.completed_at)) * 1440) AS apart
            FROM checkins m JOIN checkins e ON e.patient_id = m.patient_id AND e.checkin_day = m.checkin_day AND e.slot = 'evening'
            WHERE m.patient_id = ? AND m.slot = 'morning' AND m.status = 'completed' AND e.status = 'completed'
              AND m.checkin_day >= ? AND ABS(julianday(e.completed_at) - julianday(m.completed_at)) * 1440 <= ?""",
                          (patient_id, since, mins)):
        out.append({"type": "batched", "day": r["checkin_day"], "minutes_apart": r["apart"],
                    "text": f"Morning and evening for {r['checkin_day']} were completed {int(r['apart'])} minutes apart."})
    for r in con.execute("SELECT checkin_day, slot FROM checkins WHERE patient_id = ? AND status = 'free_miss' AND checkin_day >= ?",
                         (patient_id, since)):
        out.append({"type": "free_miss", "day": r["checkin_day"], "slot": r["slot"],
                    "text": f"Free miss used for the {r['slot']} check-in on {r['checkin_day']}."})
    days = day_list(con, patient_id, _plus(today, -13), today, today)
    streak = days_below_green_streak(days)
    if streak >= config.ALERT_AFTER_DAYS_BELOW:
        out.append({"type": "below_green", "day": today, "days": streak, "text": f"{streak} days in a row below the green zone."})
    missed = days_missed(con, patient_id, today)
    if missed >= config.ALERT_AFTER_DAYS_MISSED:
        out.append({"type": "missed", "day": today, "days": missed, "text": f"No check-in for {missed} days."})
    return sorted(out, key=lambda f: f["day"], reverse=True)
