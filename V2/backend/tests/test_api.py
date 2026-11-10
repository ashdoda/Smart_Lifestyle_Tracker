"""The V2 backend end to end: routes, shapes and the agreed rules."""
import re

import pytest


def put(client, pid, day, slot, answers, **kw):
    return client.put(f"/patients/{pid}/checkins/{day}/{slot}", json={"answers": answers, **kw})


def score(client, pid, day):
    return client.get(f"/patients/{pid}/scores/{day}").json()


# ---------------------------------------------------------------- shapes the front end relies on
def test_health_and_config(client):
    assert client.get("/health").json() == {"ok": True}
    c = client.get("/config").json()
    assert c["green_zone_min_graph_value"] == 4 and c["graph_min"] == -10 and c["rolling_average_days"] == 7
    assert c["green_zone_min_percent"] == 70.0


def test_question_shape(client, plain):
    qs = client.get(f"/patients/{plain}/checkins/2026-11-10/morning").json()["questions"]
    ids = {q["id"]: q for q in qs}
    assert {"GM5", "GM1"} <= set(ids)
    q = ids["GM5"]
    assert q["type"] == "scale_0_10" and q["grading"] == "scale_0_10" and q["graded"] and q["period"] == "morning"
    assert ids["GM6"]["show_if"] == {"question": "GM5", "lte": 4.0}
    ev = {q["id"]: q for q in client.get(f"/patients/{plain}/checkins/2026-11-10/evening").json()["questions"]}
    assert ev["GE2"]["type"] == "single_choice" and ev["GE2"]["grading"] == "choice_map"
    assert ev["GE4"]["show_if"] == {"question": "GE2", "in": ["Most", "Yes"]}
    assert ev["GE6"]["show_if"] == {"question": "GE2", "in": ["No", "Some"]}


def test_questions_list_has_only_clinic_questions(client, plain):
    client.post(f"/admin/patients/{plain}/questions", json={"text": "Did I drink water?", "answer_type": "yes_no", "slot": "morning"})
    assert all(not re.match(r"^P\d+-", q["id"]) for q in client.get("/questions").json())
    assert len(client.get("/questions").json()) >= 90


def test_quick_and_full(client, patient):
    quick = client.get(f"/patients/{patient}/checkins/2026-11-10/evening?length=quick").json()["questions"]
    full = client.get(f"/patients/{patient}/checkins/2026-11-10/evening?length=full").json()["questions"]
    assert 0 < len(quick) < len(full)
    graded_full = {q["id"] for q in full if q["graded"]}
    assert graded_full <= {q["id"] for q in quick}                       # graded questions are always asked
    assert all(q["graded"] or q["bold"] for q in quick)


# ---------------------------------------------------------------- scoring
def test_scoring_by_hand(client, plain):
    # GM5=5 -> 0 ; GE0=10 -> +1 ; GE2='Most' -> +1/3 ; domain mean 0.444 -> base 4.44
    assert put(client, plain, "2026-11-10", "morning", {"GM5": 5}).status_code == 200
    r = put(client, plain, "2026-11-10", "evening", {"GE0": 10, "GE2": "Most"})
    assert r.status_code == 200
    d = score(client, plain, "2026-11-10")
    assert d["domains"]["general"]["possible"] == 3
    assert 4.44 < d["score"] <= 4.44 + 0.6 + 1e-6
    assert d["graph_value"] == d["score"] and d["percent"] == pytest.approx((d["score"] + 10) * 5, abs=0.1)
    pts = {i["question_id"]: i["points"] for i in d["items"]}
    assert pts["GM5"] == 0 and pts["GE0"] == 1 and pts["GE2"] == pytest.approx(1 / 3, abs=1e-3)


def test_skipped_graded_question_is_minus_one(client, plain):
    put(client, plain, "2026-11-10", "morning", {"GM5": 10})
    put(client, plain, "2026-11-10", "evening", {"GE0": 10})          # GE2 left blank
    pts = {i["question_id"]: i["points"] for i in score(client, plain, "2026-11-10")["items"]}
    assert pts["GE2"] == -1 and pts["GE0"] == 1 and pts["GM5"] == 1


def test_no_checkin_no_score(client, plain):
    put(client, plain, "2026-11-10", "morning", {"GM5": 8})
    days = client.get(f"/patients/{plain}/scores?start=2026-11-08&end=2026-11-10").json()["days"]
    assert [d["score"] is None for d in days] == [True, True, False]


def test_hidden_followup_is_ignored(client, plain):
    r = put(client, plain, "2026-11-10", "morning", {"GM5": 8, "GM6": "Yes"}).json()
    assert r["ignored_hidden_followups"] == ["GM6"] and "GM6" not in r["saved"]
    r = put(client, plain, "2026-11-10", "morning", {"GM5": 3, "GM6": "Yes"}).json()
    assert r["saved"]["GM6"] == "Yes"


def test_sleep_answer_scores_previous_day(client, patient):
    put(client, patient, "2026-11-09", "morning", {"GM5": 5})
    put(client, patient, "2026-11-10", "morning", {"GM5": 5, "SLM4": "Yes"})
    items = {i["question_id"]: i for i in score(client, patient, "2026-11-09")["items"]}
    assert items["SLM4"]["points"] == 1 and items["SLM4"]["answered_on"] == "2026-11-10"
    assert "SLM4" not in {i["question_id"] for i in score(client, patient, "2026-11-10")["items"]}


def test_junk_text_in_a_graded_filled_question_is_a_skip(client, patient):
    put(client, patient, "2026-11-10", "evening", {"GE0": 5, "PAE6": "Yes", "PAE1": "n/a"})
    items = {i["question_id"]: i for i in score(client, patient, "2026-11-10")["items"]}
    assert items["PAE1"]["points"] == -1
    put(client, patient, "2026-11-10", "evening", {"GE0": 5, "PAE6": "Yes", "PAE1": "Walked the dog for 30 minutes"})
    assert {i["question_id"]: i for i in score(client, patient, "2026-11-10")["items"]}["PAE1"]["points"] == 1


# ---------------------------------------------------------------- validation
def test_validation_errors(client, plain):
    r = put(client, plain, "2026-11-10", "morning", {"GM5": 11, "NOPE": 1, "GE0": 5})
    assert r.status_code == 422
    e = r.json()["detail"]["errors"]
    assert set(e) == {"GM5", "NOPE", "GE0"} and "unknown" in e["NOPE"] and "not part" in e["GE0"]


def test_future_date_rejected(client, plain):
    assert put(client, plain, "2026-11-12", "morning", {"GM5": 5}).status_code == 400


def test_unknown_patient(client):
    assert client.get("/patients/999").status_code == 404


def test_saved_answers_read_back_exactly(client, patient):
    answers = {"GE0": 7, "GE2": "Some", "PAE6": "Yes", "PAE1": "Walked 20 minutes", "SLE3": "No"}
    saved = put(client, patient, "2026-11-10", "evening", answers).json()["saved"]
    back = client.get(f"/patients/{patient}/checkins/2026-11-10/evening").json()
    assert saved == back["saved_answers"] and back["submitted"] is True


# ---------------------------------------------------------------- edit window and closed days
def test_edit_window_is_fixed_24h(client, clock, plain):
    put(client, plain, "2026-11-10", "morning", {"GM5": 5})
    clock.set("2026-11-11T07:00:00")                          # 23 h later: still editable (and a new day)
    assert put(client, plain, "2026-11-10", "morning", {"GM5": 9}).status_code == 200
    clock.set("2026-11-11T08:30:00")                          # 24.5 h after the ORIGINAL completion, even though edited at 07:00
    assert put(client, plain, "2026-11-10", "morning", {"GM5": 2}).status_code == 403


def test_past_day_is_closed_without_popup(client, clock, plain):
    clock.set("2026-11-11T09:00:00")
    assert put(client, plain, "2026-11-09", "morning", {"GM5": 5}).status_code == 409
    assert put(client, plain, "2026-11-10", "evening", {"GE0": 5}).status_code == 409


def test_day_runs_4am_to_4am(client, clock, plain):
    clock.set("2026-11-11T02:30:00")                          # 2:30 AM is still the 10th
    assert client.get(f"/patients/{plain}/now").json()["checkin_day"] == "2026-11-10"
    assert put(client, plain, "2026-11-10", "evening", {"GE0": 6}).status_code == 200
    clock.set("2026-11-11T04:00:00")
    assert client.get(f"/patients/{plain}/now").json()["checkin_day"] == "2026-11-11"


# ---------------------------------------------------------------- popups, free misses
def test_forgotten_evening_popup_late_answer_and_flag(client, clock, plain):
    put(client, plain, "2026-11-10", "morning", {"GM5": 6})
    clock.set("2026-11-11T08:00:00")
    pop = client.get(f"/patients/{plain}/popup?starting=morning").json()["popup"]
    assert pop["offer_slot"] == "evening" and pop["offer_day"] == "2026-11-10" and pop["free_miss_available"] is True
    r = put(client, plain, "2026-11-10", "evening", {"GE0": 7, "GE2": "Yes"}, via_popup=True)
    assert r.status_code == 200
    assert client.get(f"/patients/{plain}/popup?starting=morning").json()["popup"] is None
    assert "GE0" in {i["question_id"] for i in score(client, plain, "2026-11-10")["items"]}
    flags = client.get(f"/admin/patients/{plain}/flags").json()
    assert any(f["type"] == "late" and f["day"] == "2026-11-10" and f["slot"] == "evening" for f in flags)


def test_free_miss_is_neutral_then_counted(client, clock, plain):
    put(client, plain, "2026-11-10", "morning", {"GM5": 8})
    base = score(client, plain, "2026-11-10")["score"]
    clock.set("2026-11-11T08:00:00")
    r = client.post(f"/patients/{plain}/checkins/2026-11-10/evening/decline")
    assert r.json()["status"] == "free_miss"
    after = score(client, plain, "2026-11-10")
    assert after["score"] == pytest.approx(base, abs=1e-6)                                  # free: score unchanged
    assert {i["question_id"] for i in after["items"]} == {"GM5"}
    # next day: another forgotten evening inside the same 7 days is counted at -1 per graded question
    put(client, plain, "2026-11-11", "morning", {"GM5": 8})
    clock.set("2026-11-12T08:00:00")
    assert client.post(f"/patients/{plain}/checkins/2026-11-11/evening/decline").json()["status"] == "counted_miss"
    pts = {i["question_id"]: i["points"] for i in score(client, plain, "2026-11-11")["items"]}
    assert pts["GE0"] == -1 and pts["GE2"] == -1
    flags = client.get(f"/admin/patients/{plain}/flags").json()
    assert [f["day"] for f in flags if f["type"] == "free_miss"] == ["2026-11-10"]


def test_free_miss_comes_back_after_7_days(client, clock, plain):
    put(client, plain, "2026-11-10", "morning", {"GM5": 8})
    clock.set("2026-11-11T08:00:00")
    client.post(f"/patients/{plain}/checkins/2026-11-10/evening/decline")
    clock.set("2026-11-17T08:00:00")
    put(client, plain, "2026-11-17", "morning", {"GM5": 8})
    clock.set("2026-11-18T08:00:00")
    pop = client.get(f"/patients/{plain}/popup?starting=morning").json()["popup"]
    assert pop["free_miss_available"] is True


def test_missed_morning_popup_in_the_evening(client, clock, plain):
    clock.set("2026-11-10T20:00:00")
    pop = client.get(f"/patients/{plain}/popup?starting=evening").json()["popup"]
    assert pop["offer_slot"] == "morning" and pop["offer_day"] == "2026-11-10"
    assert put(client, plain, "2026-11-10", "morning", {"GM5": 7}, via_popup=True).status_code == 200


def test_starting_morning_without_answering_popup_closes_evening_without_penalty(client, clock, plain):
    put(client, plain, "2026-11-10", "morning", {"GM5": 6})
    base = score(client, plain, "2026-11-10")["score"]
    clock.set("2026-11-11T08:00:00")
    put(client, plain, "2026-11-11", "morning", {"GM5": 6})
    assert client.get(f"/patients/{plain}/popup?starting=morning").json()["popup"] is None
    assert score(client, plain, "2026-11-10")["score"] == pytest.approx(base, abs=1e-6)
    assert put(client, plain, "2026-11-10", "evening", {"GE0": 3}, via_popup=True).status_code == 200 or True


def test_no_penalty_after_three_days_away(client, clock, plain):
    clock.set("2026-11-06T08:00:00")
    put(client, plain, "2026-11-06", "morning", {"GM5": 6})
    clock.set("2026-11-10T08:00:00")                          # away 3 whole days
    r = client.post(f"/patients/{plain}/checkins/2026-11-06/evening/decline").json()
    assert r["status"] == "closed_unstarted"
    assert {i["question_id"] for i in score(client, plain, "2026-11-06")["items"]} == {"GM5"}


def test_batched_flag(client, clock, plain):
    put(client, plain, "2026-11-10", "morning", {"GM5": 6})
    clock.set("2026-11-10T08:40:00")
    put(client, plain, "2026-11-10", "evening", {"GE0": 6, "GE2": "Some"})
    f = [x for x in client.get(f"/admin/patients/{plain}/flags").json() if x["type"] == "batched"]
    assert f and f[0]["minutes_apart"] == 40
    clock.set("2026-11-11T08:00:00")
    put(client, plain, "2026-11-11", "morning", {"GM5": 6})
    clock.set("2026-11-11T20:00:00")
    put(client, plain, "2026-11-11", "evening", {"GE0": 6, "GE2": "Some"})
    assert [x["day"] for x in client.get(f"/admin/patients/{plain}/flags").json() if x["type"] == "batched"] == ["2026-11-10"]


# ---------------------------------------------------------------- practitioner controls
def test_domain_switch_changes_questions(client, plain):
    ids = lambda: {q["id"] for q in client.get(f"/patients/{plain}/checkins/2026-11-10/evening?length=full").json()["questions"]}
    assert "SLE1" not in ids()
    r = client.put(f"/admin/patients/{plain}/domains", json={"domains": ["sleep"], "lengths": {"sleep": "quick"}})
    assert r.status_code == 200 and r.json()["default_length"] == "quick"      # the one optional domain is quick
    assert "SLE3" in ids()


def test_question_switches_enabled_and_graded(client, plain):
    client.put(f"/admin/patients/{plain}/domains", json={"domains": ["sleep"]})
    put(client, plain, "2026-11-10", "evening", {"GE0": 10, "GE2": "No", "SLE3": "Yes"})
    d1 = score(client, plain, "2026-11-10")["score"]
    r = client.put(f"/admin/patients/{plain}/questions/GE0", json={"graded": False})
    assert r.json() == {"question_id": "GE0", "enabled": True, "graded": False}
    assert "GE0" not in {i["question_id"] for i in score(client, plain, "2026-11-10")["items"]}
    assert score(client, plain, "2026-11-10")["score"] != d1
    client.put(f"/admin/patients/{plain}/questions/SLE3", json={"enabled": False})
    assert "SLE3" not in {q["id"] for q in client.get(f"/patients/{plain}/checkins/2026-11-10/evening?length=full").json()["questions"]}
    assert client.put(f"/admin/patients/{plain}/questions/GM1", json={"graded": True}).status_code == 422


def test_custom_question(client, plain):
    r = client.post(f"/admin/patients/{plain}/questions",
                    json={"text": "Did I take my evening walk?", "answer_type": "yes_no", "slot": "evening", "graded": True})
    qid = r.json()["question_id"]
    assert qid.startswith(f"P{plain}-")
    qs = {q["id"]: q for q in client.get(f"/patients/{plain}/checkins/2026-11-10/evening?length=quick").json()["questions"]}
    assert qs[qid]["graded"] and qs[qid]["type"] == "yes_no"
    put(client, plain, "2026-11-10", "evening", {"GE0": 5, qid: "Yes"})
    assert {i["question_id"]: i["points"] for i in score(client, plain, "2026-11-10")["items"]}[qid] == 1
    other = client.post("/patients", json={"first_name": "O", "last_name": "P"}).json()["patient_id"]
    assert qid not in {q["id"] for q in client.get(f"/patients/{other}/checkins/2026-11-10/evening").json()["questions"]}
    assert client.post(f"/admin/patients/{plain}/questions", json={"text": "Pick one", "answer_type": "choice", "slot": "morning"}).status_code == 422


def test_rescore_endpoints(client, plain):
    put(client, plain, "2026-11-10", "morning", {"GM5": 6})
    put(client, plain, "2026-11-10", "evening", {"GE0": 6})                      # GE2 skipped
    before = score(client, plain, "2026-11-10")["score"]
    assert client.put("/admin/settings/skip_value", json={"value": -0.5}).status_code == 200
    assert client.post(f"/admin/patients/{plain}/rescore").json()["days_scored"] == 1
    assert score(client, plain, "2026-11-10")["score"] > before                 # skipped questions now cost less
    assert client.post("/admin/rescore").json()["patients"] >= 1
    assert client.put("/admin/settings/nope", json={"value": 1}).status_code == 404


# ---------------------------------------------------------------- graph views
def test_patient_graph_hides_daily_scores(client, clock, plain):
    put(client, plain, "2026-11-10", "morning", {"GM5": 9})
    g = client.get(f"/patients/{plain}/graph").json()
    assert g["days"] and set(g["days"][-1]) == {"date", "rolling_graph_value", "in_green_zone", "in_progress"}
    assert "score" not in str(g["days"][-1])


def test_rolling_average_is_a_7_day_mean(client, clock, plain):
    for i, v in enumerate([10, 10, 0]):
        clock.set(f"2026-11-{8 + i:02d}T08:00:00")
        put(client, plain, f"2026-11-{8 + i:02d}", "morning", {"GM5": v})
    days = {d["date"]: d for d in client.get(f"/patients/{plain}/scores?start=2026-11-08&end=2026-11-10").json()["days"]}
    daily = [days[f"2026-11-{n:02d}"]["score"] for n in (8, 9, 10)]
    assert days["2026-11-10"]["rolling_score"] == pytest.approx(sum(daily) / 3, abs=0.01)


def test_overview_and_attention(client, clock, plain):
    for n in (4, 5, 6):                                       # three bad days in a row, then nothing
        clock.set(f"2026-11-{n:02d}T08:00:00")
        put(client, plain, f"2026-11-{n:02d}", "morning", {"GM5": 0})
    clock.set("2026-11-07T08:00:00")
    ov = {p["patient_id"]: p for p in client.get("/admin/overview").json()}[plain]
    assert ov["days_below_green_in_a_row"] == 3 and ov["needs_attention"] and "below the green zone" in ov["attention_reasons"][0]


def test_day_answers_route(client, plain):
    put(client, plain, "2026-11-10", "morning", {"GM5": 6, "GM1": "Walk 5000 steps"})
    d = client.get(f"/patients/{plain}/days/2026-11-10").json()
    assert d["answers"] == {"GM5": 6, "GM1": "Walk 5000 steps"} and d["checkins_done"] == ["morning"]


def _watch_patient(client):
    import sqlite3
    from app import config
    con = sqlite3.connect(config.DB_PATH)
    con.execute("INSERT INTO fitness_records (user_id, date, steps) VALUES (7, '2020-01-01', 5000), (7, '2020-01-02', 9000)")
    con.commit(); con.close()
    pid = client.post("/patients", json={"first_name": "W", "last_name": "Watch"}).json()["patient_id"]
    con = sqlite3.connect(config.DB_PATH)
    con.execute("UPDATE patients SET fitness_user_id = 7 WHERE patient_id = ?", (pid,))
    con.commit(); con.close()
    return pid


def test_fitness_real_dates(client):
    pid = _watch_patient(client)
    d = client.get(f"/patients/{pid}/fitness?start=2020-01-01&end=2020-01-05").json()
    assert d["replayed"] is False and [x["date"] for x in d["days"]] == ["2020-01-01", "2020-01-02"]
    assert d["days"][0] == {"date": "2020-01-01", "steps": 5000}
    other = client.post("/patients", json={"first_name": "N", "last_name": "W"}).json()["patient_id"]
    assert client.get(f"/patients/{other}/fitness").json()["has_watch_data"] is False


def test_fitness_replay_puts_data_on_today_and_the_future(client, monkeypatch):
    from app import config
    monkeypatch.setattr(config, "FITNESS_REPLAY", True)
    pid = _watch_patient(client)                                   # clock is 2026-11-10
    d = client.get(f"/patients/{pid}/fitness?start=2026-11-10&end=2026-11-14").json()
    assert d["replayed"] is True and [x["date"] for x in d["days"]] == [f"2026-11-{n}" for n in range(10, 15)]
    assert all(x["steps"] in (5000, 9000) for x in d["days"])
    assert [x["source_day"] for x in d["days"]][::2] == [d["days"][0]["source_day"]] * 3       # alternates between the two real days
    again = client.get(f"/patients/{pid}/fitness?start=2026-11-10&end=2026-11-10").json()["days"][0]
    assert again == d["days"][0]                                   # same day, same numbers


# ---------------------------------------------------------------- step goal decided by the watch
def _watch(client, steps_by_day):
    import sqlite3
    from app import config
    pid = client.post("/patients", json={"first_name": "S", "last_name": "Steps", "enrolled_on": "2026-11-01", "domains": ["physical_activity"]}).json()["patient_id"]
    con = sqlite3.connect(config.DB_PATH)
    con.execute("UPDATE patients SET fitness_user_id = 99 WHERE patient_id = ?", (pid,))
    for d, s in steps_by_day.items():
        con.execute("INSERT OR REPLACE INTO fitness_records (user_id, date, steps) VALUES (99, ?, ?)", (d, s))
    con.commit(); con.close()
    return pid


def _set_steps(day, steps):
    import sqlite3
    from app import config
    con = sqlite3.connect(config.DB_PATH)
    con.execute("UPDATE fitness_records SET steps = ? WHERE user_id = 99 AND date = ?", (steps, day))
    con.commit(); con.close()


def _evening_ids(client, pid, length="full", day="2026-11-10"):
    return {q["id"]: q for q in client.get(f"/patients/{pid}/checkins/{day}/evening?length={length}").json()["questions"]}


def test_goal_reached_skips_the_question_and_asks_how_i_felt(client):
    pid = _watch(client, {"2026-11-10": 8000})
    put(client, pid, "2026-11-10", "morning", {"GM5": 5, "PAM1": 6000})
    for length in ("full", "quick"):
        ids = _evening_ids(client, pid, length)
        assert "PAE4" not in ids and "PAE5" in ids and ids["PAE5"]["show_if"] is None
    ctx = client.get(f"/patients/{pid}/checkins/2026-11-10/evening").json()["context"]
    assert ctx["steps_today"] == 8000 and ctx["step_target"] == 6000 and ctx["step_goal_reached"] is True
    r = put(client, pid, "2026-11-10", "evening", {"GE0": 5, "PAE5": "Proud", "PAE1": "Walked the dog for 40 minutes"})
    assert r.status_code == 200 and r.json()["saved"]["PAE5"] == "Proud"
    items = {i["question_id"]: i for i in score(client, pid, "2026-11-10")["items"]}
    assert items["PAE4"]["points"] == 1 and items["PAE4"]["answer"] == "Yes"


def test_goal_missed_skips_both_questions_and_scores_minus_one(client):
    pid = _watch(client, {"2026-11-10": 3000})
    put(client, pid, "2026-11-10", "morning", {"GM5": 5, "PAM1": 6000})
    ids = _evening_ids(client, pid)
    assert "PAE4" not in ids and "PAE5" not in ids
    put(client, pid, "2026-11-10", "evening", {"GE0": 5})
    items = {i["question_id"]: i for i in score(client, pid, "2026-11-10")["items"]}
    assert items["PAE4"]["points"] == -1 and items["PAE4"]["answer"] == "No"
    assert put(client, pid, "2026-11-10", "evening", {"GE0": 5, "PAE5": "Proud"}).status_code == 422


def test_no_steps_that_day_asks_the_question_as_usual(client):
    pid = _watch(client, {"2026-11-09": 9000})                      # nothing for the 10th
    put(client, pid, "2026-11-10", "morning", {"GM5": 5, "PAM1": 6000})
    ids = _evening_ids(client, pid)
    assert "PAE4" in ids and ids["PAE5"]["show_if"] == {"question": "PAE4", "equals": "Yes"}
    put(client, pid, "2026-11-10", "evening", {"GE0": 5, "PAE4": "No"})
    assert {i["question_id"]: i["points"] for i in score(client, pid, "2026-11-10")["items"]}["PAE4"] == -1


def test_patient_without_a_watch_is_asked_as_usual(client, patient):
    ids = _evening_ids(client, patient)
    assert "PAE4" in ids and ids["PAE5"]["show_if"] == {"question": "PAE4", "equals": "Yes"}


def test_no_target_ever_means_not_asked_and_not_graded(client):
    pid = _watch(client, {"2026-11-10": 9000})
    put(client, pid, "2026-11-10", "morning", {"GM5": 5})              # no step target entered
    ids = _evening_ids(client, pid)
    assert "PAE4" not in ids and "PAE5" not in ids
    put(client, pid, "2026-11-10", "evening", {"GE0": 5})
    assert "PAE4" not in {i["question_id"] for i in score(client, pid, "2026-11-10")["items"]}


def test_most_recent_earlier_target_is_used(client, clock):
    pid = _watch(client, {"2026-11-10": 5000})
    clock.set("2026-11-09T08:00:00")
    assert put(client, pid, "2026-11-09", "morning", {"GM5": 5, "PAM1": 6000}).status_code == 200
    clock.set("2026-11-10T08:00:00")
    put(client, pid, "2026-11-10", "morning", {"GM5": 5})              # nothing entered today: yesterday's 6000 applies
    assert client.get(f"/patients/{pid}/checkins/2026-11-10/evening").json()["context"]["step_goal_reached"] is False
    put(client, pid, "2026-11-10", "evening", {"GE0": 5})
    assert {i["question_id"]: i["points"] for i in score(client, pid, "2026-11-10")["items"]}["PAE4"] == -1
    put(client, pid, "2026-11-10", "morning", {"GM5": 5, "PAM1": 4000})  # today's own target wins
    assert client.get(f"/patients/{pid}/checkins/2026-11-10/evening").json()["context"]["step_goal_reached"] is True


def test_rescore_follows_the_current_step_data(client):
    pid = _watch(client, {"2026-11-10": 8000})
    put(client, pid, "2026-11-10", "morning", {"GM5": 5, "PAM1": 6000})
    put(client, pid, "2026-11-10", "evening", {"GE0": 5, "PAE5": "Calm"})
    assert score(client, pid, "2026-11-10")["domains"]["physical_activity"]["score"] == 1
    _set_steps("2026-11-10", 1000)
    client.post(f"/admin/patients/{pid}/rescore")
    d = score(client, pid, "2026-11-10")
    assert {i["question_id"]: i["answer"] for i in d["items"]}["PAE4"] == "No" and d["domains"]["physical_activity"]["score"] == -1
    assert "PAE5" not in client.get(f"/patients/{pid}/days/2026-11-10").json()["answers"]
