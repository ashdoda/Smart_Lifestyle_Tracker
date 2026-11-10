"""Smart Lifestyle Tracker API (V2).  Run:  uvicorn app.main:app --reload   then open /docs

Same routes and response shapes as V1, so the front end keeps working, plus the V2 rules: free misses, popups,
quick/full check-ins, practitioner switches, flags, rescore. Data lives in the V2 SQLite database (app.db).
"""
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from typing import Any, Literal

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from . import config, db, questions as Q, scoring

LENGTHS = ("quick", "full")
Slot = Literal["morning", "evening", "weekly"]
Period = Slot
Length = Literal["quick", "full"]
Domain = Literal["physical_activity", "nutrition", "mindfulness", "sleep", "social", "substance_use"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    con = db.connect()
    db.init(con)
    con.close()
    yield


app = FastAPI(title="Smart Lifestyle Tracker API", version="2.0.0", lifespan=lifespan,
              description="Daily check-ins, practitioner settings and green-zone scores (V2 rules). No auth yet (hackathon prototype).")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def get_db():
    """One connection per request (SQLite connections can't be shared between threads)."""
    con = db.connect()
    try:
        yield con
    finally:
        con.close()


# ---------------------------------------------------------------- helpers
def _patient_or_404(con, pid: int):
    p = db.get_patient(con, pid)
    if not p:
        raise HTTPException(404, f"Patient {pid} not found")
    return p


def _checkin_today_str() -> str:
    con = db.connect()
    try:
        return config.checkin_today(int(db.setting_float(con, "day_start_hour"))).isoformat()
    finally:
        con.close()


def _qinfo(con) -> dict[str, dict]:
    bank = Q.load_bank(con)
    return {qid: Q.legacy(r, bank, bool(r["default_graded"])) for qid, r in bank.items()}


def _decode_rows(rows, info) -> dict:
    out = {}
    for r in rows:
        q = info.get(r["question_id"])
        if q is not None:
            out[r["question_id"]] = Q.decode(q, r["value"], r["value_numeric"])
    return out


def _day_answers(con, pid: int, day: str, info, slot: str | None = None, exclude_slot: str | None = None) -> dict:
    rows = [r for r in db.answer_rows(con, pid, day) if (not slot or r["slot"] == slot) and r["slot"] != exclude_slot]
    return _decode_rows(rows, info)


def _check_not_future(d: date) -> str:
    if d > config.calendar_today():
        raise HTTPException(400, "Date is in the future")
    return d.isoformat()


def _patient_json(con, p) -> dict:
    t = _checkin_today_str()
    return {**dict(p),
            "domains": sorted(db.active_domains(con, p["patient_id"], t)),
            "mandatory_domains": sorted(Q.MANDATORY),
            "default_length": db.patient_default_length(con, p["patient_id"], t)}


def _scores_for(con, pid: int, days: list[str]) -> list[dict]:
    today = _checkin_today_str()
    return [scoring.day_list(con, pid, d, d, today, with_items=True)[0] for d in days]


def _range(con, p, start: str, end: str, items=False) -> list[dict]:
    today = _checkin_today_str()
    end = min(end, today)
    start = max(start, p["enrolled_on"])
    return scoring.day_list(con, p["patient_id"], start, end, today, with_items=items) if start <= end else []


# ---------------------------------------------------------------- meta
@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse("/docs")


@app.get("/health", tags=["meta"])
def health():
    return {"ok": True}


@app.get("/config", tags=["meta"], summary="Green zone settings for drawing the graph")
def get_config(con=Depends(get_db)):
    s = db.settings(con)
    green = float(s["green_min"])
    return {
        "green_zone_min_percent": scoring.to_percent(green), "green_zone_min_graph_value": green,
        "graph_min": -10, "graph_max": 10,
        "rolling_average_days": int(s["rolling_days"]), "graph_min_days": int(s["graph_min_days"]),
        "alert_after_days_below": config.ALERT_AFTER_DAYS_BELOW, "alert_after_days_missed": config.ALERT_AFTER_DAYS_MISSED,
        "edit_hours": int(s["edit_hours"]), "batch_minutes": int(s["batch_minutes"]), "day_start_hour": int(s["day_start_hour"]),
        "domains": Q.ALL_DOMAINS, "mandatory_domains": sorted(Q.MANDATORY), "optional_domains": Q.OPTIONAL_DOMAINS,
        "lengths": list(LENGTHS),
    }


@app.get("/questions", tags=["questions"], summary="The question bank (clinic questions)")
def list_questions(period: Slot | None = None, domain: str | None = None, con=Depends(get_db)):
    info = _qinfo(con)
    keep = {r["question_id"] for r in con.execute("SELECT question_id FROM questions WHERE scope = 'clinic' AND active = 1 AND assigned_only = 0")}
    out = [q for qid, q in info.items() if qid in keep and (not period or q["period"] == period) and (not domain or q["domain"] == domain)]
    return sorted(out, key=lambda q: (q["domain"] != "general", q["domain"], q["period"], q["order"]))


# ---------------------------------------------------------------- patients
class NewPatient(BaseModel):
    first_name: str
    last_name: str
    preferred_name: str | None = None
    enrolled_on: date | None = None
    domains: list[Domain] = Field(default_factory=list, description="Optional domains to switch on")


@app.get("/patients", tags=["patients"])
def list_patients(con=Depends(get_db)):
    return [_patient_json(con, p) for p in con.execute("SELECT * FROM patients ORDER BY patient_id")]


@app.post("/patients", tags=["patients"], status_code=201)
def create_patient(body: NewPatient, con=Depends(get_db)):
    enrolled = (body.enrolled_on or config.calendar_today()).isoformat()
    pid = db.create_patient(con, body.first_name, body.last_name, body.preferred_name, enrolled, set(body.domains))
    return _patient_json(con, db.get_patient(con, pid))


@app.get("/patients/{patient_id}", tags=["patients"])
def get_patient(patient_id: int, con=Depends(get_db)):
    return _patient_json(con, _patient_or_404(con, patient_id))


# ---------------------------------------------------------------- admin: domains, question switches, custom questions
class DomainUpdate(BaseModel):
    domains: list[Domain] = Field(description="The full set of optional domains that should be ON. General is always on.")
    effective_date: date | None = Field(None, description="Defaults to today. Earlier days keep their old settings.")
    lengths: dict[Domain, Length] | None = Field(None, description="Default check-in length per domain (quick or full).")


@app.put("/admin/patients/{patient_id}/domains", tags=["admin"], summary="Turn optional domains on/off (and set their default length)")
def update_domains(patient_id: int, body: DomainUpdate, con=Depends(get_db)):
    _patient_or_404(con, patient_id)
    eff = (body.effective_date or date.fromisoformat(_checkin_today_str())).isoformat()
    db.set_domains(con, patient_id, set(body.domains), eff, dict(body.lengths or {}))
    return {**get_patient(patient_id, con), "history": [dict(r) for r in db.domain_rows(con, patient_id)]}


@app.get("/admin/patients/{patient_id}/questions", tags=["admin"], summary="Every question with this patient's two switches")
def admin_questions(patient_id: int, con=Depends(get_db)):
    _patient_or_404(con, patient_id)
    rows = con.execute("""
        SELECT q.question_id, q.domain, q.slot, q.text, q.parent_id, q.is_bold, q.default_graded, q.score_rule, q.assigned_only, q.scope,
               pq.enabled AS pq_enabled, pq.graded AS pq_graded
        FROM questions q LEFT JOIN patient_questions pq ON pq.patient_id = ? AND pq.question_id = q.question_id
        WHERE q.active = 1 AND (q.scope = 'clinic' OR q.patient_id = ?)
        ORDER BY q.domain = 'general' DESC, q.domain, q.slot, q.sort_order""", (patient_id, patient_id)).fetchall()
    return [{"question_id": r["question_id"], "domain": r["domain"], "period": r["slot"], "text": r["text"], "parent": r["parent_id"],
             "bold": bool(r["is_bold"]), "can_be_graded": r["score_rule"] is not None,
             "enabled": bool(r["pq_enabled"]) if r["pq_enabled"] is not None else not r["assigned_only"],
             "graded": bool(r["pq_graded"]) if r["pq_graded"] is not None else bool(r["default_graded"]),
             "default_graded": bool(r["default_graded"]), "custom": r["scope"] == "patient"} for r in rows]


class QuestionSwitch(BaseModel):
    enabled: bool | None = Field(None, description="Ask this question of this patient at all")
    graded: bool | None = Field(None, description="Count this question in the score")


@app.put("/admin/patients/{patient_id}/questions/{question_id}", tags=["admin"], summary="Switch a question on/off or graded/not for one patient")
def switch_question(patient_id: int, question_id: str, body: QuestionSwitch, con=Depends(get_db)):
    _patient_or_404(con, patient_id)
    q = con.execute("SELECT * FROM questions WHERE question_id = ? AND active = 1", (question_id,)).fetchone()
    if not q:
        raise HTTPException(404, "Unknown question")
    if body.graded and not q["score_rule"]:
        raise HTTPException(422, "This question has no scoring rule, so it can't be graded.")
    cur = con.execute("SELECT enabled, graded FROM patient_questions WHERE patient_id = ? AND question_id = ?", (patient_id, question_id)).fetchone()
    enabled = body.enabled if body.enabled is not None else (bool(cur["enabled"]) if cur else not q["assigned_only"])
    graded = body.graded if body.graded is not None else (bool(cur["graded"]) if cur else bool(q["default_graded"]))
    con.execute("INSERT INTO patient_questions (patient_id, question_id, enabled, graded, updated_at) VALUES (?,?,?,?,?) "
                "ON CONFLICT(patient_id, question_id) DO UPDATE SET enabled = excluded.enabled, graded = excluded.graded, updated_at = excluded.updated_at",
                (patient_id, question_id, int(enabled), int(graded), config.now().isoformat(sep=" ", timespec="seconds")))
    con.commit()
    scoring.rescore(con, patient_id)       # the switches decide what counts, so the stored scores follow
    return {"question_id": question_id, "enabled": enabled, "graded": graded}


class NewQuestion(BaseModel):
    text: str = Field(min_length=3, description="First person ('Did I ...?')")
    answer_type: Literal["yes_no", "scale10", "text", "choice"]
    slot: Literal["morning", "evening"]
    options: list[str] | None = Field(None, description="Required for 'choice'")
    graded: bool = False
    good_answer: Literal["Yes", "No"] = Field("Yes", description="For graded yes/no: which answer is the good one")
    bold: bool = False


@app.post("/admin/patients/{patient_id}/questions", tags=["admin"], status_code=201, summary="Add a question for one patient")
def add_question(patient_id: int, body: NewQuestion, con=Depends(get_db)):
    _patient_or_404(con, patient_id)
    if body.answer_type == "choice" and (not body.options or len(body.options) < 2):
        raise HTTPException(422, "A choice question needs at least two options.")
    if body.graded and body.answer_type == "choice":
        raise HTTPException(422, "Choice questions can't be graded.")
    rule = {"yes_no": "yes1" if body.good_answer == "Yes" else "no1", "scale10": "scale10", "text": "filled"}.get(body.answer_type)
    n = con.execute("SELECT COUNT(*) FROM questions WHERE scope = 'patient' AND patient_id = ?", (patient_id,)).fetchone()[0] + 1
    qid = f"P{patient_id}-{n}"
    while con.execute("SELECT 1 FROM questions WHERE question_id = ?", (qid,)).fetchone():
        n += 1
        qid = f"P{patient_id}-{n}"
    con.execute("INSERT INTO questions (question_id, domain, text, answer_type, options, slot, is_bold, default_graded, score_rule, "
                "score_day, assigned_only, scope, patient_id, sort_order) VALUES (?, 'provider', ?, ?, ?, ?, ?, ?, ?, 'same', 1, 'patient', ?, ?)",
                (qid, body.text.strip(), body.answer_type, "|".join(body.options) if body.options else None, body.slot, int(body.bold),
                 int(body.graded), rule, patient_id, 1000 + n))
    con.execute("INSERT INTO patient_questions (patient_id, question_id, enabled, graded) VALUES (?, ?, 1, ?)", (patient_id, qid, int(body.graded)))
    con.commit()
    if body.graded:
        scoring.rescore(con, patient_id)
    return {"question_id": qid, "graded": body.graded, "enabled": True}


@app.get("/admin/settings", tags=["admin"], summary="Every tunable scoring number")
def admin_settings(con=Depends(get_db)):
    return [dict(r) for r in con.execute("SELECT key, value, note FROM settings ORDER BY key")]


class SettingValue(BaseModel):
    value: float | int | str


@app.put("/admin/settings/{key}", tags=["admin"], summary="Change a scoring number (then POST /admin/rescore)")
def put_setting(key: str, body: SettingValue, con=Depends(get_db)):
    if not con.execute("SELECT 1 FROM settings WHERE key = ?", (key,)).fetchone():
        raise HTTPException(404, "Unknown setting")
    con.execute("UPDATE settings SET value = ? WHERE key = ?", (str(body.value), key))
    con.commit()
    return {"key": key, "value": str(body.value), "note": "Run POST /admin/rescore to apply it to past days."}


@app.post("/admin/patients/{patient_id}/rescore", tags=["admin"], summary="Recompute every stored score for one patient")
def rescore_patient(patient_id: int, con=Depends(get_db)):
    _patient_or_404(con, patient_id)
    return {"patient_id": patient_id, "days_scored": len(scoring.rescore(con, patient_id))}


@app.post("/admin/rescore", tags=["admin"], summary="Recompute every stored score for everyone")
def rescore_all(con=Depends(get_db)):
    ids = [r[0] for r in con.execute("SELECT patient_id FROM patients")]
    return {"patients": len(ids), "days_scored": sum(len(scoring.rescore(con, i)) for i in ids)}


@app.get("/admin/patients/{patient_id}/flags", tags=["admin"], summary="Why a patient may need attention")
def patient_flags(patient_id: int, since: date | None = None, con=Depends(get_db)):
    _patient_or_404(con, patient_id)
    return scoring.flags(con, patient_id, _checkin_today_str(), since.isoformat() if since else None)


@app.get("/admin/overview", tags=["admin"], summary="Every patient's latest score, green-zone status and flags")
def admin_overview(con=Depends(get_db)):
    today = _checkin_today_str()
    start = (date.fromisoformat(today) - timedelta(days=13)).isoformat()
    out = []
    for p in con.execute("SELECT * FROM patients ORDER BY patient_id").fetchall():
        pid = p["patient_id"]
        days = _range(con, p, start, today)
        finished = [d for d in days if not d["in_progress"] and d["score"] is not None]
        last = finished[-1] if finished else None
        streak = scoring.days_below_green_streak(days)
        missed = scoring.days_missed(con, pid, today)
        fl = scoring.flags(con, pid, today, (date.fromisoformat(today) - timedelta(days=6)).isoformat())
        reasons = ([f"{streak} days in a row below the green zone"] if streak >= config.ALERT_AFTER_DAYS_BELOW else []) + \
                  ([f"No check-in for {missed} days"] if missed >= config.ALERT_AFTER_DAYS_MISSED else [])
        out.append({
            "patient_id": pid, "name": f"{p['first_name']} {p['last_name']}",
            "domains": sorted(db.active_domains(con, pid, today)),
            "last_full_day": last and {k: last[k] for k in ("date", "percent", "graph_value", "in_green_zone",
                                                            "rolling_percent", "rolling_graph_value", "rolling_in_green_zone")},
            "days_below_green_in_a_row": streak, "days_missed": missed,
            "flags": [f for f in fl], "needs_attention": bool(reasons), "attention_reasons": reasons,
        })
    return out


# ---------------------------------------------------------------- check-in state and popups
def _slot_state(con, pid: int, day: str, slot: str, now: datetime) -> dict:
    c = db.get_checkin(con, pid, day, slot)
    if not c:
        return {"status": "none"}
    st = {"status": c["status"], "length": c["length"], "completed_at": c["completed_at"], "via_popup": bool(c["via_popup"])}
    if c["status"] == "completed":
        st["editable_until"] = c["edit_deadline"]
        st["editable"] = bool(c["edit_deadline"]) and now.isoformat(sep=" ") <= c["edit_deadline"]
    return st


def _popup(con, pid: int, starting: str, day: str) -> dict | None:
    hit = scoring.core.popup_needed(con, pid, starting, day)
    if not hit:
        return None
    slot, pday, free = hit
    if starting == "morning":
        text = "I didn't do my evening check-in last night. Would I like to reflect on last night now?"
    else:
        text = "I didn't do my morning check-in today. Would I like to answer the morning questions now?"
    return {"offer_slot": slot, "offer_day": pday, "free_miss_available": free, "text": text,
            "if_yes": f"PUT /patients/{pid}/checkins/{pday}/{slot} with via_popup=true",
            "if_no": f"POST /patients/{pid}/checkins/{pday}/{slot}/decline"}


@app.get("/patients/{patient_id}/now", tags=["check-ins"], summary="Today's check-in state: what's done, what's editable, which popup to show")
def checkin_now(patient_id: int, con=Depends(get_db)):
    p = _patient_or_404(con, patient_id)
    now, day = config.now(), _checkin_today_str()
    return {"patient_id": patient_id, "checkin_day": day, "calendar_date": now.date().isoformat(),
            "slots": {s: _slot_state(con, patient_id, day, s, now) for s in ("morning", "evening")},
            "popup_before_morning": _popup(con, patient_id, "morning", day),
            "popup_before_evening": _popup(con, patient_id, "evening", day),
            "default_length": db.patient_default_length(con, patient_id, day),
            "days_away": scoring.days_missed(con, patient_id, day)}


@app.get("/patients/{patient_id}/popup", tags=["check-ins"], summary="Popup to show when the patient is about to start a check-in (or null)")
def popup(patient_id: int, starting: Literal["morning", "evening"], con=Depends(get_db)):
    _patient_or_404(con, patient_id)
    return {"popup": _popup(con, patient_id, starting, _checkin_today_str())}


# ---------------------------------------------------------------- check-ins
@app.get("/patients/{patient_id}/checkins/{day}/{period}", tags=["check-ins"],
         summary="Questions to show for this check-in, plus any saved answers")
def get_checkin(patient_id: int, day: date, period: Period, length: Length | None = Query(None, description="quick or full (default: the saved one, else the practitioner's default)"),
                con=Depends(get_db)):
    _patient_or_404(con, patient_id)
    ds = _check_not_future(day)
    now = config.now()
    existing = db.get_checkin(con, patient_id, ds, period)
    length = length or (existing["length"] if existing and existing["status"] == "completed" else db.patient_default_length(con, patient_id, ds))
    info = _qinfo(con)
    shown = Q.for_checkin(con, patient_id, ds, period, length)
    full = {q["id"] for q in Q.for_checkin(con, patient_id, ds, period, "full")}
    saved_all = _day_answers(con, patient_id, ds, info, slot=period) if existing and existing["status"] == "completed" else {}
    saved = {k: v for k, v in saved_all.items() if k in full}
    yesterday = (day - timedelta(days=1)).isoformat()
    today_all = _day_answers(con, patient_id, ds, info)
    context = {}
    if period == "morning" and "SLM2" in _day_answers(con, patient_id, yesterday, info):
        context["planned_bedtime_last_night"] = _day_answers(con, patient_id, yesterday, info)["SLM2"]
    if period == "evening" and "SCM1" in today_all:
        context["person_to_connect_with"] = today_all["SCM1"]
    if period == "evening" and "PAM1" in today_all:
        context["step_target"] = today_all["PAM1"]
    goal = scoring.core.step_goal(con, patient_id, ds) if period == "evening" else None
    if goal is not None:
        context["steps_today"] = goal["steps"]
        context["step_target"] = goal["target"]
        context["step_goal_reached"] = goal["reached"]
    return {
        "patient_id": patient_id, "date": ds, "period": period, "length": length, "lengths": list(LENGTHS) if period != "weekly" else ["full"],
        "domains": sorted(db.active_domains(con, patient_id, ds) | Q.MANDATORY),
        "questions": shown,
        "note": "Follow-ups have a show_if rule: show them only when the parent answer matches (equals / in / lte / gte / filled). "
                "Graded questions are always asked, in quick and in full.",
        "context": context, "saved_answers": saved, "submitted": bool(saved) or bool(existing and existing["status"] == "completed"),
        "state": _slot_state(con, patient_id, ds, period, now),
        "popup": _popup(con, patient_id, period, ds) if period != "weekly" and ds == _checkin_today_str() and not existing else None,
    }


class CheckinBody(BaseModel):
    answers: dict[str, Any] = Field(
        description="question_id -> answer. Yes/No as 'Yes'/'No', scales as numbers, checkboxes as a list, times as 'HH:MM'.",
        examples=[{"GE0": 7, "GE2": "Most", "PAE4": "Yes", "PAE5": "Great", "PAE6": "No"}])
    length: Length | None = Field(None, description="quick or full: which version the patient was shown")
    via_popup: bool = Field(False, description="True when answered through the 'reflect on last night / this morning' popup")
    started_at: datetime | None = Field(None, description="When the patient opened the check-in (for the practitioner's timing flags)")


@app.put("/patients/{patient_id}/checkins/{day}/{period}", tags=["check-ins"],
         summary="Submit (or re-submit within 24 h) a check-in; returns the updated day score")
def submit_checkin(patient_id: int, day: date, period: Period, body: CheckinBody, con=Depends(get_db)):
    _patient_or_404(con, patient_id)
    ds = _check_not_future(day)
    now, today = config.now(), _checkin_today_str()
    existing = db.get_checkin(con, patient_id, ds, period)
    settings = db.settings(con)

    # --- may this check-in be saved right now?
    if existing and existing["status"] == "completed":
        if existing["edit_deadline"] and now.isoformat(sep=" ") > existing["edit_deadline"]:
            raise HTTPException(403, f"This check-in can't be changed any more (the {settings['edit_hours']}-hour edit window ended {existing['edit_deadline']}).")
    elif existing and existing["status"] in ("free_miss", "counted_miss"):
        raise HTTPException(409, "This check-in was skipped, so it can't be filled in now.")
    elif period != "weekly" and ds != today:
        prev_day = (date.fromisoformat(today) - timedelta(days=1)).isoformat()
        popup_ok = body.via_popup and ((period == "evening" and ds == prev_day) or (period == "morning" and ds == today))
        if not popup_ok:
            raise HTTPException(409, "This day is closed. Only last night's evening check-in can still be filled in, and only from the reminder popup.")

    info = _qinfo(con)
    full_qs = {q["id"]: q for q in Q.for_checkin(con, patient_id, ds, period, "full")}
    length = body.length or (existing["length"] if existing and existing["status"] == "completed" else db.patient_default_length(con, patient_id, ds))
    shown = {q["id"]: q for q in Q.for_checkin(con, patient_id, ds, period, length)}

    # --- validate
    errors, clean = {}, {}
    for qid, value in body.answers.items():
        if qid not in full_qs:
            errors[qid] = ("not part of this check-in (wrong period or domain not switched on)" if qid in info else "unknown question id")
            continue
        if value is None:
            continue
        try:
            clean[qid] = Q.validate(full_qs[qid], value)
        except ValueError as e:
            errors[qid] = str(e)
    if errors:
        raise HTTPException(422, {"errors": errors})

    # --- follow-ups depend on the whole day (an evening question can depend on the morning)
    day_answers = {**_day_answers(con, patient_id, ds, info, exclude_slot=period), **clean}
    ignored = [qid for qid in clean if not Q.is_visible(full_qs[qid], day_answers)]
    for qid in ignored:
        del clean[qid]

    # --- rows to store: everything asked and visible; answered, junk, skipped (graded) or optional_skip (not graded)
    rows = []
    for qid, q in {**shown, **{k: full_qs[k] for k in clean}}.items():
        if qid in clean:
            v = clean[qid]
            if q["type"] == "text" and not Q.is_filled(v) and not q["graded"]:
                rows.append((qid, None, None, "optional_skip"))
                clean.pop(qid)
                continue
            text, num = Q.encode(q, v)
            rows.append((qid, text, num, "junk" if Q.is_junk(q, v) else "answered"))
        elif Q.is_visible(q, day_answers):
            rows.append((qid, None, None, "skipped" if q["graded"] else "optional_skip"))
    # --- store
    db.save_checkin(con, patient_id, ds, period, rows, length=length if period != "weekly" else "full", now=now,
                    started_at=body.started_at.isoformat(sep=" ", timespec="seconds") if body.started_at else None,
                    via_popup=body.via_popup, edit_hours=int(settings["edit_hours"]))

    # --- starting this slot closes the other one that was left open (no penalty): see README, "Popups"
    if not body.via_popup and ds == today and not (existing and existing["status"] == "completed"):
        if period == "morning":
            prev = (date.fromisoformat(ds) - timedelta(days=1)).isoformat()
            prev_m = db.get_checkin(con, patient_id, prev, "morning")
            if prev_m and prev_m["status"] == "completed" and not db.has_checkin(con, patient_id, prev, "evening"):
                con.execute("INSERT INTO checkins (patient_id, checkin_day, slot, status) VALUES (?, ?, 'evening', 'closed_unstarted')", (patient_id, prev))
        elif period == "evening" and not db.has_checkin(con, patient_id, ds, "morning"):
            con.execute("INSERT INTO checkins (patient_id, checkin_day, slot, status) VALUES (?, ?, 'morning', 'closed_unstarted')", (patient_id, ds))
        con.commit()

    affected = [ds]
    if any(r[0] in info and info[r[0]].get("grade_applies_to") == "previous_day" for r in rows):
        affected.insert(0, (date.fromisoformat(ds) - timedelta(days=1)).isoformat())
    scoring.rescore(con, patient_id, sorted(set(affected + [(date.fromisoformat(ds) - timedelta(days=1)).isoformat()])))
    saved_state = _slot_state(con, patient_id, ds, period, now)
    return {"saved": clean, "ignored_hidden_followups": ignored, "length": length, "state": saved_state,
            "scores": _scores_for(con, patient_id, [d for d in affected if d >= db.get_patient(con, patient_id)["enrolled_on"]])}


class DeclineBody(BaseModel):
    via_popup: bool = True


@app.post("/patients/{patient_id}/checkins/{day}/{period}/decline", tags=["check-ins"],
          summary="The patient said No to a whole check-in (free miss once per slot per 7 days, then counted)")
def decline_checkin(patient_id: int, day: date, period: Literal["morning", "evening"], body: DeclineBody | None = None, con=Depends(get_db)):
    _patient_or_404(con, patient_id)
    ds = _check_not_future(day)
    if db.get_checkin(con, patient_id, ds, period):
        raise HTTPException(409, "There is already a check-in (or a decision) for that slot.")
    if scoring.days_missed(con, patient_id, _checkin_today_str()) >= 3:
        # Away for 3+ days: nothing is counted against them, so they can come back and rebound.
        con.execute("INSERT INTO checkins (patient_id, checkin_day, slot, status) VALUES (?, ?, ?, 'closed_unstarted')", (patient_id, ds, period))
        con.commit()
        return {"status": "closed_unstarted", "scores": []}
    status = scoring.core.decline_checkin(con, patient_id, ds, period, int(body.via_popup if body else True))
    con.commit()
    scoring.rescore(con, patient_id, [ds])
    return {"status": status, "free": status == "free_miss", "scores": _scores_for(con, patient_id, [ds])}


@app.get("/patients/{patient_id}/days/{day}", tags=["check-ins"], summary="All answers for a day")
def get_day(patient_id: int, day: date, con=Depends(get_db)):
    _patient_or_404(con, patient_id)
    ds = day.isoformat()
    info = _qinfo(con)
    slots = db.checkin_slots(con, patient_id, ds, ds).get(ds, set())
    return {"date": ds, "answers": _day_answers(con, patient_id, ds, info), "checkins_done": sorted(slots - {"weekly"}),
            "states": {s: _slot_state(con, patient_id, ds, s, config.now()) for s in ("morning", "evening")}}


# ---------------------------------------------------------------- scores
@app.get("/patients/{patient_id}/scores", tags=["scores"], summary="Daily scores for the green-zone graph (practitioner view: daily + rolling)")
def get_scores(patient_id: int,
               start: date | None = Query(None, description="Default: 30 days ago"),
               end: date | None = Query(None, description="Default: today"),
               include_items: bool = Query(False, description="Include the per-question breakdown"),
               con=Depends(get_db)):
    p = _patient_or_404(con, patient_id)
    today = _checkin_today_str()
    end = end or date.fromisoformat(today)
    start = start or end - timedelta(days=29)
    days = _range(con, p, start.isoformat(), end.isoformat(), include_items)
    finished = [d for d in days if not d["in_progress"] and d["score"] is not None]
    green = sum(1 for d in finished if d["in_green_zone"])
    s = db.settings(con)
    return {
        "patient_id": patient_id, "green_zone_min_percent": scoring.to_percent(float(s["green_min"])),
        "green_zone_min_graph_value": float(s["green_min"]),
        "summary": {
            "days_scored": len(finished), "days_in_green_zone": green,
            "percent_of_days_in_green_zone": round(100 * green / len(finished), 1) if finished else None,
            "average_percent": round(sum(d["percent"] for d in finished) / len(finished), 1) if finished else None,
            "days_below_green_in_a_row": scoring.days_below_green_streak(days),
            "days_missed": scoring.days_missed(con, patient_id, today),
        },
        "flags": scoring.flags(con, patient_id, today, start.isoformat()),
        "days": days,
    }


@app.get("/patients/{patient_id}/graph", tags=["scores"], summary="What the PATIENT sees: only the rolling line, no daily scores")
def patient_graph(patient_id: int, start: date | None = None, end: date | None = None, con=Depends(get_db)):
    p = _patient_or_404(con, patient_id)
    today = _checkin_today_str()
    end = end or date.fromisoformat(today)
    start = start or end - timedelta(days=29)
    need = int(db.setting_float(con, "graph_min_days"))
    first_ok = con.execute("SELECT day FROM daily_scores WHERE patient_id = ? ORDER BY day LIMIT 1 OFFSET ?", (patient_id, max(need - 1, 0))).fetchone()
    days = [d for d in _range(con, p, start.isoformat(), end.isoformat())
            if d["rolling_graph_value"] is not None and first_ok and d["date"] >= first_ok[0]]
    s = db.settings(con)
    return {"patient_id": patient_id, "green_zone_min_graph_value": float(s["green_min"]), "graph_min": -10, "graph_max": 10,
            "days": [{"date": d["date"], "rolling_graph_value": d["rolling_graph_value"], "in_green_zone": d["rolling_in_green_zone"],
                      "in_progress": d["in_progress"]} for d in days]}


@app.get("/patients/{patient_id}/scores/{day}", tags=["scores"], summary="One day's score with per-question detail")
def get_day_score(patient_id: int, day: date, con=Depends(get_db)):
    p = _patient_or_404(con, patient_id)
    days = _range(con, p, day.isoformat(), day.isoformat(), True)
    if not days:
        raise HTTPException(404, "No score for that day (before enrollment or in the future)")
    return days[0]


# ---------------------------------------------------------------- watch data (steps)
@app.get("/patients/{patient_id}/fitness", tags=["fitness"], summary="Daily steps from the watch data, one row per day")
def get_fitness(patient_id: int, start: date | None = Query(None, description="Default: 30 days ago"),
                end: date | None = Query(None, description="Default: today. May be in the future (seed_demo.py stores 35 days ahead)."),
                con=Depends(get_db)):
    """Returns what is stored (seed_demo.py moves the dates to run from 365 days back to 35 days ahead). Days with no reading are
    simply absent. TRACKER_FITNESS_REPLAY=1 instead hands any requested day one of the patient's stored days (same day, same numbers);
    `source_day` says which."""
    p = _patient_or_404(con, patient_id)
    end = end or date.fromisoformat(_checkin_today_str())
    start = start or end - timedelta(days=29)
    uid = p["fitness_user_id"]
    if uid is None:
        return {"patient_id": patient_id, "has_watch_data": False, "days": []}
    if not config.FITNESS_REPLAY:
        rows = con.execute("SELECT date, steps FROM fitness_records WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date",
                           (uid, start.isoformat(), end.isoformat())).fetchall()
        last = con.execute("SELECT MAX(date) FROM fitness_records WHERE user_id = ?", (uid,)).fetchone()[0]
        return {"patient_id": patient_id, "has_watch_data": True, "replayed": False, "latest_watch_day": last,
                "days": [dict(r) for r in rows]}
    source = [dict(r) for r in con.execute("SELECT date, steps FROM fitness_records WHERE user_id = ? ORDER BY date", (uid,))]
    if not source:
        return {"patient_id": patient_id, "has_watch_data": False, "days": []}
    out, d = [], start
    while d <= end:
        src = source[(d - date(2023, 1, 1)).days % len(source)]
        out.append({"date": d.isoformat(), "steps": src["steps"], "source_day": src["date"]})
        d += timedelta(days=1)
    return {"patient_id": patient_id, "has_watch_data": True, "replayed": True, "latest_watch_day": end.isoformat(), "days": out}
