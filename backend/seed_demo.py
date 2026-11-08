#!/usr/bin/env python3
"""Fill app.db with demo patients and fake check-ins so the graph has something to show.

Patients (names + domains) come from the database team's sample.db; the answers are
generated here for the NEW question list, because sample.db's answers use the old one.

  python3 seed_demo.py                       # 50 patients, last 60 days
  python3 seed_demo.py --patients 10 --days 30 --source ../database/sample.db --force
"""
import argparse
import os
import random
import sqlite3
import sys
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app import config, db  # noqa: E402
from app.questions import OPTIONAL_DOMAINS, for_checkin, is_visible  # noqa: E402

TEXT = {
    "PA-M2": ["Walk after lunch", "Dance in the kitchen", "Bike to the store", "Stretch for 10 minutes"],
    "PA-E1a": ["Proud", "Tired but good", "Energized"],
    "PA-E2a": ["Yoga, 20 min", "Swim, 30 min", "Walked the dog, 25 min", "Gym, 45 min"],
    "PA-E2b": ["Relaxed", "Sore but happy", "Great"],
    "DN-M1": ["Eat a vegetable with every meal", "Drink 8 glasses of water", "No soda today", "Cook dinner at home"],
    "DN-E1": ["Oatmeal, chicken salad, rice and beans", "Eggs, sandwich, pasta", "Smoothie, soup, stir fry"],
    "DN-E2": ["Chose water over soda", "Had fruit for a snack", "Cooked at home"],
    "MF-M1a": ["Bedroom", "Park", "Living room"],
    "SC-M1": ["Mom", "My sister", "An old friend", "My neighbor", "My sponsor"],
    "SC-E4a": ["Felt tired", "Anxious about seeing people", "Wanted to be alone"],
    "SU-M1b": ["No more than 2 drinks", "Only on the weekend", "Half of yesterday"],
    "SU-E1a": ["Party with friends", "Stressful day at work"],
    "SU-E1b": ["Stress", "Loneliness", "Boredom"],
    "SU-E1c": ["Saw old friends", "Argument at home"],
    "SU-E1d": ["A few drinks", "More than planned"],
    "SU-E1e": ["Clear head", "Better sleep", "Saved money"],
}
EMPTY_TEXT = ["", "N/A", "none"]


def fake_answer(rng, q, good: bool):
    t = q["type"]
    if t == "yes_no":
        yes = good if q["grading"] != "yes_no_inverted" else not good
        return "Yes" if yes else "No"
    if t == "scale_0_10":
        return max(0, min(10, round(rng.gauss(8 if good else 4, 1.5))))
    if t == "integer":
        return rng.choice([5000, 6000, 7500, 8000, 10000])
    if t == "minutes":
        return rng.choice([5, 10, 15, 20])
    if t == "time":
        return f"{rng.choice([21, 22, 23])}:{rng.choice(['00', '15', '30', '45'])}"
    if t == "single_choice":
        if q["grading"] == "choice_map":
            return rng.choice(q["options"][2:] if good else q["options"][:2])
        return rng.choice(q["options"])
    if t == "multi_choice":
        return rng.sample(q["options"], rng.randint(1, min(2, len(q["options"]))))
    if q["grading"] == "filled" and not good:
        return rng.choice(EMPTY_TEXT)
    return rng.choice(TEXT.get(q["id"], ["Okay"]))


def fill_checkin(rng, period, domains, day_answers, p_good):
    """Walk the questions in order so follow-ups depend on earlier answers."""
    out = {}
    for q in for_checkin(period, domains):
        if not is_visible(q, {**day_answers, **out}):
            continue
        if q["grading"] == "none" and q["type"] == "text" and rng.random() < 0.3:
            continue  # people skip optional text boxes
        out[q["id"]] = fake_answer(rng, q, rng.random() < p_good)
    return out


def main():
    ap = argparse.ArgumentParser()
    here = os.path.dirname(os.path.abspath(__file__))
    ap.add_argument("--source", default=os.path.join(here, "..", "database", "sample.db"))
    ap.add_argument("--db", default=config.DB_PATH)
    ap.add_argument("--patients", type=int, default=50)
    ap.add_argument("--days", type=int, default=60)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--force", action="store_true", help="delete an existing app db first")
    a = ap.parse_args()

    if os.path.exists(a.db):
        if not a.force:
            sys.exit(f"{a.db} already exists. Use --force to replace it.")
        os.remove(a.db)
    if not os.path.exists(a.source):
        sys.exit(f"Can't find {a.source}. Point --source at the database team's sample.db.")

    src = sqlite3.connect(f"file:{a.source}?mode=ro", uri=True)
    users = src.execute(
        "SELECT u.user_id, n.first_name, n.last_name, n.preferred_name FROM users u "
        "JOIN user_names n USING (user_id) ORDER BY u.user_id LIMIT ?", (a.patients,)).fetchall()
    user_domains = {}
    for uid, dom in src.execute("SELECT user_id, domain FROM user_domains"):
        user_domains.setdefault(uid, set()).add(dom)

    rng = random.Random(a.seed)
    con = db.connect(a.db)
    db.init(con)
    today = date.today()
    start = today - timedelta(days=a.days)
    n_checkins = 0

    for uid, first, last, pref in users:
        con.execute("INSERT INTO patients (patient_id, first_name, last_name, preferred_name, enrolled_on) "
                    "VALUES (?, ?, ?, ?, ?)", (uid, first, last, pref, start.isoformat()))
        domains = {d for d in user_domains.get(uid, set()) if d in OPTIONAL_DOMAINS} or {rng.choice(OPTIONAL_DOMAINS)}
        db.set_domains(con, uid, domains, start.isoformat())

        # Each patient has a baseline and a slow drift, so some stay green and some slide out.
        base = rng.uniform(0.6, 0.97)
        drift = rng.uniform(-0.3, 0.15)
        adherence = rng.uniform(0.7, 0.98)
        for i in range(a.days + 1):
            d = start + timedelta(days=i)
            ds = d.isoformat()
            p_good = min(0.98, max(0.05, base + drift * i / a.days + rng.gauss(0, 0.08)))
            day = {}
            for period, hour in (("morning", 8), ("evening", 21)):
                if d == today and period == "evening":
                    continue  # today's evening hasn't happened yet
                if rng.random() > adherence:
                    continue  # skipped check-in
                ans = fill_checkin(rng, period, domains, day, p_good)
                day.update(ans)
                ts = datetime(d.year, d.month, d.day, hour, rng.randint(0, 59)).isoformat()
                db.save_checkin(con, uid, ds, period, ans, ts)
                n_checkins += 1

    print(f"Seeded {len(users)} patients, {n_checkins:,} check-ins, {start} to {today} -> {a.db}")


if __name__ == "__main__":
    main()
    