"""Smart Lifestyle Tracker API.  Run:  uvicorn app.main:app --reload   then open /docs"""
from datetime import date, datetime, timedelta
from typing import Any, Literal

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import config, db, scoring
from .questions import ALL_DOMAINS, BY_ID, MANDATORY, OPTIONAL_DOMAINS, QUESTIONS, for_checkin, is_visible, validate

app = FastAPI(title="Smart Lifestyle Tracker API", version="0.1.0",
              description="Daily check-ins, admin domain settings and green-zone scores. No auth yet (hackathon prototype).")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_con = db.connect()
db.init(_con)


def get_db():
    return _con


Period = Literal["morning", "evening"]
Domain = Literal["physical_activity", "nutrition", "mindfulness", "sleep", "social", "substance_use"]


# ---- helpers -----------------------------------------------------------------

def _patient_or_404(con, pid: int):
    p = db.get_patient(con, pid)
    if not p:
        raise HTTPException(404, f"Patient {pid} not found")
    return p


def _check_date(d: date) -> str:
    if d.isoformat() > db.today():
        raise HTTPException(400, "Date is in the future")
    return d.isoformat()


def _patient_json(con, p) -> dict:
    t = db.today()
    return {**dict(p),
            "domains": sorted(db.active_domains(con, p["patient_id"], t)),
            "mandatory_domains": sorted(MANDATORY)}


def _scores(con, pid: int, start: str, end: str) -> list[dict]:
    """Daily scores from start to end, including rolling averages (computed with earlier days)."""
    p = _patient_or_404(con, pid)
    today = db.today()
    end = min(end, today)
    start = max(start, p["enrolled_on"])
    if start > end:
        return []
    lookback = (date.fromisoformat(start) - timedelta(days=config.ROLLING_AVERAGE_DAYS - 1)).isoformat()
    lookback = max(lookback, p["enrolled_on"])
    answers = db.answers_by_date(con, pid, lookback, (date.fromisoformat(end) + timedelta(days=1)).isoformat())
    periods = db.checkin_periods(con, pid, lookback, end)
    days, d = [], date.fromisoformat(lookback)
    while d.isoformat() <= end:
        ds = d.isoformat()
        s = scoring.score_day(ds, db.active_domains(con, pid, ds), answers, today)
        s["checkins_done"] = sorted(periods.get(ds, set()))
        days.append(s)
        d += timedelta(days=1)
    scoring.with_rolling_average(days)
    return [x for x in days if x["date"] >= start]


# ---- meta ----------------------------------------------------------------------

@app.get("/health", tags=["meta"])
def health():
    return {"ok": True}


@app.get("/config", tags=["meta"], summary="Green zone settings for drawing the graph")
def get_config():
    return {
        "green_zone_min_percent": config.GREEN_ZONE_MIN_PERCENT,
        "green_zone_min_graph_value": config.GREEN_ZONE_MIN_GRAPH,
        "graph_min": -10, "graph_max": 10,
        "rolling_average_days": config.ROLLING_AVERAGE_DAYS,
        "alert_after_days_below": config.ALERT_AFTER_DAYS_BELOW,
        "domains": ALL_DOMAINS, "mandatory_domains": sorted(MANDATORY), "optional_domains": OPTIONAL_DOMAINS,
    }


@app.get("/questions", tags=["questions"], summary="The full question bank")
def list_questions(period: Period | None = None, domain: str | None = None):
    return [q for q in QUESTIONS if (not period or q["period"] == period) and (not domain or q["domain"] == domain)]


# ---- patients ------------------------------------------------------------------

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
    enrolled = (body.enrolled_on or date.today()).isoformat()
    cur = con.execute(
        "INSERT INTO patients (first_name, last_name, preferred_name, enrolled_on) VALUES (?, ?, ?, ?)",
        (body.first_name, body.last_name, body.preferred_name or body.first_name, enrolled))
    con.commit()
    db.set_domains(con, cur.lastrowid, set(body.domains), enrolled)
    return _patient_json(con, db.get_patient(con, cur.lastrowid))


@app.get("/patients/{patient_id}", tags=["patients"])
def get_patient(patient_id: int, con=Depends(get_db)):
    return _patient_json(con, _patient_or_404(con, patient_id))


# ---- admin -----------------------------------------------------------------------

class DomainUpdate(BaseModel):
    domains: list[Domain] = Field(description="The full set of optional domains that should be ON. General is always on.")
    effective_date: date | None = Field(None, description="Defaults to today. Earlier days keep their old settings.")


@app.put("/admin/patients/{patient_id}/domains", tags=["admin"], summary="Turn optional domains on/off")
def update_domains(patient_id: int, body: DomainUpdate, con=Depends(get_db)):
    _patient_or_404(con, patient_id)
    eff = (body.effective_date or date.today()).isoformat()
    db.set_domains(con, patient_id, set(body.domains), eff)
    return {**get_patient(patient_id, con),
            "history": [dict(r) for r in db.domain_rows(con, patient_id)]}


@app.get("/admin/overview", tags=["admin"], summary="Every patient's latest score and green-zone status")
def admin_overview(con=Depends(get_db)):
    today = date.today()
    start = (today - timedelta(days=13)).isoformat()
    out = []
    for p in con.execute("SELECT * FROM patients ORDER BY patient_id").fetchall():
        days = _scores(con, p["patient_id"], start, today.isoformat())
        finished = [d for d in days if not d["in_progress"] and d["percent"] is not None]
        last = finished[-1] if finished else None
        streak = scoring.days_below_green_streak(days)
        out.append({
            "patient_id": p["patient_id"],
            "name": f"{p['first_name']} {p['last_name']}",
            "domains": sorted(db.active_domains(con, p["patient_id"], today.isoformat())),
            "last_full_day": last and {k: last[k] for k in ("date", "percent", "graph_value", "in_green_zone",
                                                            "rolling_percent", "rolling_in_green_zone")},
            "days_below_green_in_a_row": streak,
            "needs_attention": streak >= config.ALERT_AFTER_DAYS_BELOW,
        })
    return out


# ---- check-ins ---------------------------------------------------------------------

@app.get("/patients/{patient_id}/checkins/{day}/{period}", tags=["check-ins"],
         summary="Questions to show for this check-in, plus any saved answers")
def get_checkin(patient_id: int, day: date, period: Period, con=Depends(get_db)):
    _patient_or_404(con, patient_id)
    ds = _check_date(day)
    domains = db.active_domains(con, patient_id, ds)
    yesterday = (day - timedelta(days=1)).isoformat()
    answers = db.answers_by_date(con, patient_id, yesterday, ds)
    today_answers = answers.get(ds, {})
    saved = {q["id"]: today_answers[q["id"]] for q in for_checkin(period, domains) if q["id"] in today_answers}
    context = {}
    if period == "morning" and "SL-M3" in answers.get(yesterday, {}):
        context["planned_bedtime_last_night"] = answers[yesterday]["SL-M3"]
    if period == "evening" and "SC-M1" in today_answers:
        context["person_to_connect_with"] = today_answers["SC-M1"]
    if period == "evening" and "PA-M1" in today_answers:
        context["step_target"] = today_answers["PA-M1"]
    return {
        "patient_id": patient_id, "date": ds, "period": period,
        "domains": sorted(domains | MANDATORY),
        "questions": for_checkin(period, domains),
        "note": "Follow-ups have a show_if rule: show them only when the parent answer matches. "
                "show_if.filled means the parent (possibly from this morning) has a real answer.",
        "context": context,
        "saved_answers": saved,
        "submitted": bool(saved),
    }


class CheckinBody(BaseModel):
    answers: dict[str, Any] = Field(
        description="question_id -> answer. Yes/No as 'Yes'/'No', scales as numbers, checkboxes as a list, times as 'HH:MM'.",
        examples=[{"G-E1": "Most", "G-E2": 7, "PA-E1": "Yes", "PA-E1a": "Great", "PA-E2": "No"}])


@app.put("/patients/{patient_id}/checkins/{day}/{period}", tags=["check-ins"],
         summary="Submit (or re-submit) a check-in; returns the updated day score")
def submit_checkin(patient_id: int, day: date, period: Period, body: CheckinBody, con=Depends(get_db)):
    _patient_or_404(con, patient_id)
    ds = _check_date(day)
    allowed = {q["id"]: q for q in for_checkin(period, db.active_domains(con, patient_id, ds))}
    errors, clean = {}, {}
    for qid, value in body.answers.items():
        if qid not in allowed:
            errors[qid] = ("not part of this check-in (wrong period or domain not switched on)"
                           if qid in BY_ID else "unknown question id")
            continue
        if value is None:
            continue
        try:
            clean[qid] = validate(allowed[qid], value)
        except ValueError as e:
            errors[qid] = str(e)
    if errors:
        raise HTTPException(422, {"errors": errors})

    # Visibility uses the whole day (an evening question can depend on the morning).
    day_answers = {**db.answers_by_date(con, patient_id, ds, ds).get(ds, {}), **clean}
    ignored = [qid for qid in list(clean) if not is_visible(allowed[qid], day_answers)]
    for qid in ignored:
        del clean[qid]

    db.save_checkin(con, patient_id, ds, period, clean, datetime.now().isoformat(timespec="seconds"))
    affected = [ds]
    if any(allowed[q].get("grade_applies_to") == "previous_day" for q in clean):
        affected.insert(0, (day - timedelta(days=1)).isoformat())
    return {
        "saved": clean,
        "ignored_hidden_followups": ignored,
        "scores": [s for d in affected for s in _scores(con, patient_id, d, d)],
    }


@app.get("/patients/{patient_id}/days/{day}", tags=["check-ins"], summary="All answers for a day")
def get_day(patient_id: int, day: date, con=Depends(get_db)):
    _patient_or_404(con, patient_id)
    ds = day.isoformat()
    return {"date": ds, "answers": db.answers_by_date(con, patient_id, ds, ds).get(ds, {}),
            "checkins_done": sorted(db.checkin_periods(con, patient_id, ds, ds).get(ds, set()))}


# ---- scores ------------------------------------------------------------------------

@app.get("/patients/{patient_id}/scores", tags=["scores"], summary="Daily scores for the green-zone graph")
def get_scores(patient_id: int,
               start: date | None = Query(None, description="Default: 30 days ago"),
               end: date | None = Query(None, description="Default: today"),
               include_items: bool = Query(False, description="Include the per-question breakdown"),
               con=Depends(get_db)):
    end = end or date.today()
    start = start or end - timedelta(days=29)
    days = _scores(con, patient_id, start.isoformat(), end.isoformat())
    if not include_items:
        for d in days:
            d.pop("items")
    finished = [d for d in days if not d["in_progress"] and d["percent"] is not None]
    green = sum(1 for d in finished if d["in_green_zone"])
    return {
        "patient_id": patient_id,
        "green_zone_min_percent": config.GREEN_ZONE_MIN_PERCENT,
        "green_zone_min_graph_value": config.GREEN_ZONE_MIN_GRAPH,
        "summary": {
            "days_scored": len(finished),
            "days_in_green_zone": green,
            "percent_of_days_in_green_zone": round(100 * green / len(finished), 1) if finished else None,
            "average_percent": round(sum(d["percent"] for d in finished) / len(finished), 1) if finished else None,
            "days_below_green_in_a_row": scoring.days_below_green_streak(days),
        },
        "days": days,
    }


@app.get("/patients/{patient_id}/scores/{day}", tags=["scores"], summary="One day's score with per-question detail")
def get_day_score(patient_id: int, day: date, con=Depends(get_db)):
    days = _scores(con, patient_id, day.isoformat(), day.isoformat())
    if not days:
        raise HTTPException(404, "No score for that day (before enrollment or in the future)")
    return days[0]
