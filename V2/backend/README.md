# Smart Lifestyle Tracker – V2 backend

Same shape as V1 (FastAPI, `app/main.py`, `config.py`, `db.py`, `questions.py`, `scoring.py`, `seed_demo.py`, SQLite `app.db`),
now running on the **V2 database** and the agreed V2 scoring rules. The existing front end works with it (see "Front end").

## Run it
```bash
cd V2/backend
pip install -r requirements.txt
python seed_demo.py            # app.db from ../database/sample.db, dates moved so the last check-in is yesterday
uvicorn app.main:app --reload  # http://127.0.0.1:8000/docs
pytest                         # 32 tests, uses a throwaway database
```
No `app.db`? The server creates an empty V2 database on first start (tables, settings, question bank).
Point at another database with `TRACKER_DB=/path/to/file.db` (e.g. a full one built by `database/build_v2_db.py`).
`TRACKER_NOW=2026-11-10T08:00:00` pretends it is that moment (demos and tests).

## Where things are
| File | What it does |
|---|---|
| `app/config.py` | paths, the clock (`now()`, 4 AM check-in day), alert thresholds |
| `app/db.py` | all SQL for patients, domains (dated), check-ins and answers |
| `app/questions.py` | question bank from the database, quick/full, show_if, validation, how answers are stored |
| `app/scoring.py` | loads `database/scoring.py` (the one copy of the rules), builds day objects, rolling average, flags |
| `app/main.py` | the routes |
| `seed_demo.py` | demo data |

Every scoring number (green zone 4, skipped = -1, 60-minute batch window, 24 h edit window, 7-day free-miss window ...) is a row in the
`settings` table: `GET/PUT /admin/settings`, then `POST /admin/rescore`.

## Routes
Unchanged from V1 (same paths and response shapes): `/health /config /questions /patients /patients/{id}`, `PUT /admin/patients/{id}/domains`,
`/admin/overview`, `GET|PUT /patients/{id}/checkins/{day}/{period}`, `/patients/{id}/days/{day}`, `/patients/{id}/scores`, `/patients/{id}/scores/{day}`.

New in V2:
| Route | Purpose |
|---|---|
| `GET /patients/{id}/now` | today's state: what is done, what is still editable, which popup to show |
| `GET /patients/{id}/popup?starting=morning\|evening` | the popup to show before a check-in (or `null`) |
| `POST /patients/{id}/checkins/{day}/{slot}/decline` | patient said No: free miss, or counted at -1 |
| `GET /patients/{id}/graph` | **patient** graph: rolling line only, no daily scores |
| `GET /admin/patients/{id}/questions`, `PUT .../questions/{qid}` | practitioner switches per question: `enabled`, `graded` |
| `POST /admin/patients/{id}/questions` | add a first-person question (yes/no, 0-10, text, choice) |
| `GET /admin/patients/{id}/flags` | late, batched, free miss used, 3 days below green, 3+ days missed |
| `POST /admin/patients/{id}/rescore`, `POST /admin/rescore` | recompute stored scores |
| `PUT .../domains` also takes `lengths` | default quick/full per domain |

`GET .../checkins/..?length=quick|full` picks the version; graded questions are always asked. `PUT` accepts `length`, `via_popup`, `started_at`.

## The rules, as implemented
- Graded answer: best +1, worst -1 (0-10 -> (v-5)/5; goal No/Some/Most/Yes -> -1, -1/3, +1/3, +1). Skipped, blank, N/A or gibberish = -1.
- Domain score = mean of its graded answers (morning + evening pooled). Day score (0-100) = 50 + 50 x mean of domain scores + completion credit
  (2.5 quick / 3 full x answered/asked), clamped to 0..100. A day with no check-in has no score. The sleep question answered this morning scores yesterday.
- Green zone starts at 70. Rolling average = mean of scored days in the last 7 calendar days.
- Free miss: declining a whole check-in is neutral once per slot per rolling 7 days; after that every graded question counts -1.
- Popups: forgotten evening -> offered when the next morning check-in starts (yes = late answer, flagged; no = decline). Missed morning -> offered when the evening starts.
  If the morning check-in is submitted without answering the popup, last night closes with no penalty. Away 3+ days: nothing is counted against them.
- Edit window: 24 h from the original completion (never moves). Days are 4 AM to 4 AM. Past days are closed, except last night's evening via the popup.
- Step goal (patients with a watch): "Did I reach my step target today?" (PAE4) is not asked. It is worked out from that day's steps against
  the latest step target the patient entered (PAM1; today's, else the most recent earlier one) and graded like a Yes/No. Reaching the goal brings up
  "How did I feel after reaching my step target?" (PAE5), in quick and full. Missed goal: neither is asked. No target ever: neither is asked or graded.
  No steps that day (or no watch): the question is asked as before. Recomputed on every scoring run, so `POST /admin/rescore` follows the current step data.
- Flags: late (via popup), batched (morning and evening within 60 min), free miss used, 3 days below green, 3+ days missed.

## Front end
`../frontend/frontend_compat.patch` (two small edits): `visible()` in `src/logic.js` understands the new `show_if` forms (`in`, `lte`, `gte`) and
`hk-backend.js` reads confidence from `GM5` instead of `G-M1`. Question ids are the V2 ids (GM5, GE0, GE2, PAE4 ...). Apply with `git apply`.

## Known limits
- No login or authorisation (prototype). Anyone who can reach the API can read or change any patient.
- The front end sends the calendar date. Between midnight and 4 AM it still belongs to yesterday's check-in day; `GET /patients/{id}/now` has the right day.
- Starting the morning check-in without answering the popup closes last night with no penalty. A patient could use that to avoid a counted miss.
- Switching a question's `graded` setting changes how history counts (the whole patient is rescored).
