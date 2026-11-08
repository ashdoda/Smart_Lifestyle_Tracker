"""Daily score: graded questions earn 0-1 point each; the day is scored out of 10.

Rules
- Only questions marked as graded in questions.json count.
- Only the domains active for the patient on that day count (general is always on).
- A graded question that was not answered (or a check-in that was skipped) earns 0.
- A follow-up question that was hidden (its show_if wasn't met) doesn't count at all.
- Questions with grade_applies_to = previous_day (the sleep question) are answered
  the next morning and count toward the day before. Until that morning arrives they
  are 'pending' and left out.
"""
from datetime import date, timedelta

from . import config
from .questions import QUESTIONS, MANDATORY, is_filled, is_visible

GRADED = [q for q in QUESTIONS if q["grading"] != "none"]


def points(q: dict, value) -> float:
    g = q["grading"]
    if value is None:
        return 0.0
    if g == "yes_no":
        return 1.0 if value == "Yes" else 0.0
    if g == "yes_no_inverted":
        return 1.0 if value == "No" else 0.0
    if g == "filled":
        return 1.0 if is_filled(value) else 0.0
    if g == "scale_0_10":
        return float(value) / 10
    if g == "choice_map":
        return float(q["option_scores"].get(value, 0))
    if g == "selected":
        return 1.0 if is_filled(value) else 0.0
    raise ValueError(f"unknown grading {g}")


def _next_day(d: str) -> str:
    return (date.fromisoformat(d) + timedelta(days=1)).isoformat()


def score_day(day: str, domains: set[str], answers: dict[str, dict], today: str) -> dict:
    """answers = {date: {question_id: value}}; needs `day` and the day after (for sleep)."""
    domains = domains | MANDATORY
    items = []
    for q in GRADED:
        if q["domain"] not in domains:
            continue
        source_day = _next_day(day) if q.get("grade_applies_to") == "previous_day" else day
        if source_day > today:
            continue  # pending: not asked yet
        day_answers = answers.get(source_day, {})
        if not is_visible(q, day_answers):
            continue
        value = day_answers.get(q["id"])
        items.append({"question_id": q["id"], "domain": q["domain"], "answer": value,
                      "points": round(points(q, value), 3), "answered_on": source_day})

    by_domain = {}
    for it in items:
        d = by_domain.setdefault(it["domain"], {"earned": 0.0, "possible": 0})
        d["earned"] += it["points"]
        d["possible"] += 1
    for d in by_domain.values():
        d["earned"] = round(d["earned"], 3)
        d["percent"] = round(100 * d["earned"] / d["possible"], 1)

    possible = len(items)
    earned = sum(it["points"] for it in items)
    result = {"date": day, "earned": round(earned, 3), "possible": possible,
              "in_progress": day == today, "domains": by_domain, "items": items}
    result.update(summary_numbers(100 * earned / possible if possible else None))
    return result


def summary_numbers(percent: float | None) -> dict:
    if percent is None:
        return {"percent": None, "score_out_of_10": None, "graph_value": None, "in_green_zone": None}
    return {
        "percent": round(percent, 1),
        "score_out_of_10": round(percent / 10, 2),
        "graph_value": config.percent_to_graph(percent),
        "in_green_zone": percent >= config.GREEN_ZONE_MIN_PERCENT,
    }


def with_rolling_average(days: list[dict], window: int = config.ROLLING_AVERAGE_DAYS) -> list[dict]:
    """Adds rolling_* fields: average percent over the last `window` scored days (calendar days)."""
    for i, d in enumerate(days):
        recent = [x["percent"] for x in days[max(0, i - window + 1): i + 1] if x["percent"] is not None]
        avg = sum(recent) / len(recent) if recent else None
        r = summary_numbers(avg)
        d["rolling_percent"] = r["percent"]
        d["rolling_graph_value"] = r["graph_value"]
        d["rolling_in_green_zone"] = r["in_green_zone"]
    return days


def days_below_green_streak(days: list[dict]) -> int:
    """Consecutive most-recent finished days below the green zone (today is skipped while in progress)."""
    n = 0
    for d in reversed(days):
        if d["in_progress"] or d["percent"] is None:
            continue
        if d["in_green_zone"]:
            break
        n += 1
    return n
