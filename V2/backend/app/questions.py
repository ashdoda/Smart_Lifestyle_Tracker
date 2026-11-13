"""The question bank (from the database), which questions a patient gets, and what answers are valid.

The database stores questions in its own words (slot, answer_type, score_rule, show_if as '=Yes' / '<=4').
This file turns them into the shape the front end already uses (period, type, grading, show_if as an object),
so the screens did not have to change. New fields are added alongside: graded, bold, parent, optional.
"""
import re

from . import scoring

OPTIONAL_DOMAINS = ["physical_activity", "nutrition", "mindfulness", "sleep", "social", "substance_use"]
MANDATORY = {"general"}
ALL_DOMAINS = ["general"] + OPTIONAL_DOMAINS
PERIODS = ("morning", "evening")
SLOTS = ("morning", "evening", "weekly")
LENGTHS = ("quick", "full")

_EMPTY = {"", "n/a", "na", "none", "nothing", "no", "-", "null"}

_TYPE = {"yes_no": "yes_no", "scale10": "scale_0_10", "text": "text", "choice": "single_choice",
         "multi_choice": "multi_choice", "time": "time"}
_GRADING = {"yes1": "yes_no", "no1": "yes_no_inverted", "scale10": "scale_0_10", "goal4": "choice_map", "filled": "filled"}


def is_filled(value) -> bool:
    """A real answer: not missing, not blank, not 'N/A' / 'none' and the like."""
    if value is None:
        return False
    if isinstance(value, list):
        return len(value) > 0
    if isinstance(value, str):
        return value.strip().lower().rstrip(".") not in _EMPTY
    return True


# ---------------------------------------------------------------- the bank
def load_bank(con) -> dict[str, dict]:
    return {r["question_id"]: dict(r) for r in con.execute("SELECT * FROM questions WHERE active = 1")}


def _options(row) -> list[str] | None:
    if row["answer_type"] not in ("choice", "multi_choice") or not row.get("options"):
        return None                                  # e.g. scale questions carry '0-10' as a label, not as choices
    return row["options"].split("|")


def _legacy_type(row) -> str:
    if row["answer_type"] == "number":
        return "minutes" if "minute" in row["text"].lower() else "integer"
    return _TYPE[row["answer_type"]]


def _show_if(row, bank) -> dict | None:
    cond, parent = row.get("show_if"), row.get("parent_id")
    if not parent:
        return None
    if not cond:
        return {"question": parent, "filled": True}
    m = re.match(r"^(<=|>=|=)(.*)$", cond)
    op, val = m.group(1), m.group(2)
    if op == "=":
        return {"question": parent, "equals": val}
    opts = _options(bank[parent])
    if opts:                                   # a threshold on a choice (No/Some/Most/Yes) becomes a list of labels
        n = float(val)
        keep = [o for i, o in enumerate(opts) if (i <= n if op == "<=" else i >= n)]
        return {"question": parent, "in": keep}
    return {"question": parent, "lte" if op == "<=" else "gte": float(val)}


def legacy(row, bank, graded: bool) -> dict:
    q = {"id": row["question_id"], "domain": row["domain"], "period": row["slot"], "order": row["sort_order"],
         "type": _legacy_type(row), "text": row["text"],
         "grading": _GRADING.get(row["score_rule"], "none") if graded else "none",
         "graded": bool(graded), "bold": bool(row["is_bold"]), "parent": row["parent_id"],
         "optional": bool(row["parent_id"]) and not graded,
         "show_if": _show_if(row, bank)}
    opts = _options(row)
    if opts:
        q["options"] = opts
    if row["score_day"] == "previous":
        q["grade_applies_to"] = "previous_day"
    return q


def patient_questions(con, patient_id: int, day: str, slot: str) -> list[dict]:
    """Every question this patient could be asked in this slot on this day (before the quick/full cut)."""
    rows = con.execute("""
        SELECT q.*, COALESCE(pq.graded, q.default_graded) AS graded_now
        FROM questions q
        LEFT JOIN patient_domains pd ON pd.patient_id = ? AND pd.domain = q.domain AND pd.enabled = 1
             AND pd.start_date <= ? AND (pd.end_date IS NULL OR pd.end_date > ?)
        LEFT JOIN patient_questions pq ON pq.patient_id = ? AND pq.question_id = q.question_id
        WHERE q.slot = ? AND q.active = 1 AND (pd.domain IS NOT NULL OR q.domain = 'provider')
          AND COALESCE(pq.enabled, 1) = 1 AND (q.assigned_only = 0 OR pq.question_id IS NOT NULL)
          AND (q.scope = 'clinic' OR q.patient_id = ?)""", (patient_id, day, day, patient_id, slot, patient_id)).fetchall()
    return [dict(r) for r in rows]


def for_checkin(con, patient_id: int, day: str, slot: str, length: str = "full") -> list[dict]:
    """Questions to show, in the order the screens walk through them. Quick keeps the always-asked (bold) questions and
    every graded one; full adds the rest. A follow-up appears only when its parent does (and its show_if is met)."""
    bank = load_bank(con)
    out = []
    goal = scoring.core.step_goal(con, patient_id, day) if slot == "evening" else None
    rows = patient_questions(con, patient_id, day, slot)
    if goal is not None:
        # The watch decides the step goal: PAE4 is not asked. Reaching the goal is what brings up "how did I feel".
        for r in rows:
            if r["question_id"] == scoring.core.STEP_FEEL_Q and goal["reached"]:
                r.update(parent_id=None, show_if=None)
        rows = [r for r in rows if r["question_id"] != scoring.core.STEP_GOAL_Q
                and (r["question_id"] != scoring.core.STEP_FEEL_Q or goal["reached"])]
    for r in rows:
        graded = bool(r["graded_now"])
        if slot != "weekly" and length == "quick" and not (graded or r["is_bold"]):
            continue
        out.append((r, graded))
    ids = {r["question_id"] for r, _ in out}
    out = [(r, g) for r, g in out if not r["parent_id"] or r["parent_id"] in ids or r["parent_id"] in bank]
    out.sort(key=lambda rg: (rg[0]["domain"] != "general", rg[0]["domain"], rg[0]["sort_order"]))
    return [legacy(r, bank, g) for r, g in out]


# ---------------------------------------------------------------- show_if and validation
def is_visible(q: dict, day_answers: dict) -> bool:
    """Evaluate show_if against all of that day's answers (morning + evening)."""
    cond = q.get("show_if")
    if not cond:
        return True
    parent = day_answers.get(cond["question"])
    if "equals" in cond:
        return parent == cond["equals"]
    if "in" in cond:
        return parent in cond["in"]
    if "lte" in cond:
        return isinstance(parent, (int, float)) and parent <= cond["lte"]
    if "gte" in cond:
        return isinstance(parent, (int, float)) and parent >= cond["gte"]
    if cond.get("filled"):
        return is_filled(parent)
    return True


_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def validate(q: dict, value):
    """Return the cleaned value, or raise ValueError with a message for the front end."""
    t = q["type"]
    if t == "yes_no":
        if value not in ("Yes", "No"):
            raise ValueError("must be 'Yes' or 'No'")
        return value
    if t == "scale_0_10":
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 10:
            raise ValueError("must be a number from 0 to 10")
        return value
    if t in ("integer", "minutes"):
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise ValueError("must be a whole number, 0 or more")
        return value
    if t == "time":
        if not isinstance(value, str) or not _TIME.match(value):
            raise ValueError("must be a time as HH:MM (24-hour)")
        return value
    if t == "text":
        if not isinstance(value, str):
            raise ValueError("must be text")
        return value.strip()
    if t == "single_choice":
        if q.get("options") and value not in q["options"]:
            raise ValueError(f"must be one of {q['options']}")
        if not isinstance(value, str):
            raise ValueError("must be text")
        return value
    if t == "multi_choice":
        opts = q.get("options") or []
        if not isinstance(value, list) or (opts and any(v not in opts for v in value)) or len(set(value)) != len(value):
            raise ValueError(f"must be a list using only {opts}")
        return value
    raise ValueError(f"unknown question type {t}")


def is_junk(q: dict, value) -> bool:
    """A graded 'filled' question answered with N/A, none or gibberish counts as skipped."""
    if q["grading"] != "filled":
        return False
    return (not is_filled(value)) or (isinstance(value, str) and scoring.core.is_junk(value))


# ---------------------------------------------------------------- how answers are stored
def encode(q: dict, value) -> tuple[str, float | None]:
    """(value text, numeric value) as the database stores them."""
    t = q["type"]
    if t in ("scale_0_10", "integer", "minutes"):
        return (str(int(value)) if float(value).is_integer() else str(value)), float(value)
    if t == "time":
        h, m = value.split(":")
        return value, float(int(h) * 60 + int(m))
    if t == "single_choice" and q["grading"] == "choice_map":
        return value, float(q["options"].index(value))
    if t == "multi_choice":
        return "|".join(value), None
    return str(value), None


def decode(q: dict, value: str | None, numeric: float | None):
    if value is None:
        return None
    t = q["type"]
    if t in ("scale_0_10", "integer", "minutes"):
        n = numeric if numeric is not None else float(value)
        return int(n) if float(n).is_integer() else n
    if t == "multi_choice":
        return [v for v in value.split("|") if v]
    return value
