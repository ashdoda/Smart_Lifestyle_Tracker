<p align="center"><img src="assets/pip-scene.svg" alt="Pip, the app's friendly companion, on a hill" width="360"></p>

<p align="center">

https://github.com/user-attachments/assets/c974acd0-1ddf-4263-9746-188521cdd718

</p>

# Smart Lifestyle Tracker for Mental Health

A daily check-in app that turns a morning and an evening reflection into one simple score. Patients see whether they are staying in a healthy "green zone." Practitioners see who is slipping early enough to step in.

**Team:** Derek Ashdown, Cole Hanson, Doga Eski · **Proposer:** Megan Nickell · UMKC School of Science and Engineering
**Repo:** https://github.com/ashdoda/Smart_Lifestyle_Tracker

> **All data is synthetic.** 50 simulated patients built on a public fitness-tracker dataset. There is no real patient data anywhere in this project, and the app is a prototype with no real authentication.

---

## 1. Why it exists

Lifestyle habits (movement, nutrition, sleep, stress, social connection, substance use) shape long-term health. Between clinic visits, practitioners rarely see how patients are doing day to day, and patients lose momentum without feedback. The app is the bridge: a clear, shared picture of how lifestyle actions relate to mental health, so practitioners can build a bespoke plan for each patient.

## 2. What it does

| Feature | Details |
|---|---|
| **Question bank** | 95 first-person questions across six domains: physical activity, nutrition, mindfulness, sleep, social connection, avoiding harmful substances. Plus general goal questions asked of everyone. |
| **Check-ins** | A morning and an evening reflection, each in quick or full length. Follow-up questions appear only when relevant. |
| **Lifestyle Score** | One daily score from 0 to 100%. The green zone starts at 70%. |
| **Wearable data** | Step goals are checked automatically against watch step counts. |
| **Patient view** | Today screen, check-in flow, weekly graph (rolling line only, no raw daily scores), and **Pip**, a friendly companion to keep the experience engaging. |
| **Practitioner view** | Patient list with sparklines and alerts, per-patient report with domain breakdown, written responses, and per-question switches. |
| **Flags** | Late, batched, free miss used, 3 days below green, 3+ days missed. |

## 3. How scoring works

All numbers live in the database `settings` table and can be changed without code edits.

1. Each **graded answer** earns -1 (worst) to +1 (best): 0-10 answers use `(v-5)/5`; goal answers No/Some/Most/Yes map to `-1 / -1/3 / +1/3 / +1`; yes/no is `+1/-1`.
2. Skipped, blank, N/A or gibberish answers on a graded question count **-1**.
3. **Domain score** = plain average of its graded answers (morning and evening pooled). Every domain has equal weight.
4. **Daily score** = `50 + 50 × (mean of domain scores)` plus completion credit (2.5 quick, 3 full, scaled by answered/asked), clamped to 0-100.
5. **Green zone** starts at 70. The patient graph shows a 7-day rolling average.
6. A day with no check-in has no score. The sleep question answered this morning scores yesterday.
7. **Free miss:** declining a whole check-in is neutral once per slot per rolling 7 days. After that, every graded question counts -1.
8. **Check-in day** runs 4 AM to 4 AM. At 2 AM it is still "yesterday."

## 4. Architecture

```
Browser (HTML/CSS/JS, Vite dev server :5173)
        │  /api/*  (proxied by vite.config.js)
        ▼
FastAPI backend (:8000)  ──reads/writes──►  SQLite  V2/backend/app.db
        │
        └── loads V2/database/scoring.py  (the single copy of the scoring rules)
```

| Layer | Tech |
|---|---|
| Frontend | Plain HTML/CSS/JavaScript, Vite 7 (no React/Vue) |
| Backend | Python, FastAPI, Uvicorn |
| Database | SQLite |
| Tests | pytest (backend), Node test runner + Playwright (frontend) |

### Repository layout

```
Smart_Lifestyle_Tracker/
├── Quick-Start Set-up.md        short setup guide
└── V2/
    ├── backend/
    │   ├── app/                 config.py, db.py, questions.py, scoring.py, main.py
    │   ├── seed_demo.py         builds app.db from sample.db and shifts dates to today
    │   ├── tests/               32 API tests (use a throwaway database)
    │   └── requirements.txt
    ├── database/
    │   ├── schema.sql           tables, flag views, indexes
    │   ├── questions_v2.csv     the 95-question bank (edit to change questions)
    │   ├── scoring.py           scoring rules (shared with the backend)
    │   ├── build_v2_db.py       full database build (research use)
    │   ├── check_v2_db.py       read-only sanity checks
    │   ├── sample.db            ready-made 50-patient database (committed)
    │   └── scripts/             data generators
    └── frontend/
        ├── *.html               login, patient-*, provider-* pages
        ├── public/              css and js
        ├── src/                 logic, adapter, backend client + unit tests
        └── package.json
```

---

## 5. Set up on any computer

### What you need

| Tool | Version | Notes |
|---|---|---|
| Python | **3.13 recommended**; 3.10+ should work | The seed script was verified on 3.10. The backend uses modern type syntax, so avoid anything older than 3.10. |
| Node.js | 20.19+ or 22.12+ | Install the LTS from https://nodejs.org (npm comes with it). Check with `node --version`. |
| Git | any recent | |

Check which Python you have:

| OS | Command |
|---|---|
| Windows | `py -0` lists every installed version, `python --version` shows the default |
| Mac / Linux | `python3 --version` |

Don't have one? Windows: `winget install Python.Python.3.13`, then **open a new terminal**. Mac: install from https://python.org or `brew install python@3.13`.

> **Pick the right launcher.** The commands below use `PY` as a placeholder for your Python command:
> - Windows: `py -3.13` (or just `py` if `py -0` shows only another 3.10+ version)
> - Mac / Linux: `python3` (or `python3.13`)

### Step 1: Get the code
```
git clone https://github.com/ashdoda/Smart_Lifestyle_Tracker.git
cd Smart_Lifestyle_Tracker
```

### Step 2: Create the database
`sample.db` is a fixed snapshot with old dates. `seed_demo.py` copies it to `app.db` and shifts every date so the last check-in is **yesterday**. Run from `V2/backend`. This step only needs Python's standard library, so no virtual environment is required.

Windows (PowerShell):
```
cd V2\backend
PY seed_demo.py --reset
```
Mac / Linux:
```
cd V2/backend
PY seed_demo.py --reset
```
Expected output: `app.db: 50 patients, check-ins 365 days back to <yesterday>; watch data ...`

### Step 3: Start the backend
Still in `V2/backend`.

Windows (PowerShell):
```
PY -m venv venv
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned   # once, if activate is blocked
venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000
```
Mac / Linux:
```
PY -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000
```
Your prompt should show `(venv)`. Leave this terminal running. Confirm the backend is up at http://127.0.0.1:8000/docs.

### Step 4: Start the frontend (second terminal)
```
cd V2/frontend
npm install
npm run dev
```
Open http://127.0.0.1:5173 and pick a demo account on the login page.

> Start the **backend before the frontend**. The frontend sends `/api` requests to port 8000.

---

## 6. Keep the dates fresh (important)

`app.db` goes stale. The app treats "now" as the real clock, but the data is stored on fixed dates, so a database seeded days ago leaves today (and recent days) empty. This is why the database must be rebuilt whenever you want data to reach the present, and **always on demo day**.

1. Stop the backend (Ctrl+C). On Windows the script cannot replace `app.db` while the server has it open.
2. From `V2/backend`: `PY seed_demo.py --reset`
3. Restart the backend.

Notes:
- Check-in days run 4 AM to 4 AM, so before 4 AM the data ends two calendar days back rather than one.
- `--reset` deletes the existing `app.db`. That is intended here, but never run it on a database you want to keep.
- `app.db` and `demo.db` are git-ignored. Rebuilding them never creates changes to commit.
- Pretend it is another moment (demos and tests): `TRACKER_NOW=2026-11-10T08:00:00` (PowerShell: `$env:TRACKER_NOW="2026-11-10T08:00:00"`).
- Use a different database file: set `TRACKER_DB` to its path before starting the backend.

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `No suitable Python runtime found` with `py -3.13` | Python 3.13 isn't installed | Run `py -0`, then use `py` or the version it lists. Or `winget install Python.Python.3.13` and open a new terminal. |
| `venv\Scripts\activate` "module could not be loaded" | The venv was never created (earlier step failed) | Fix the Python step, re-run `PY -m venv venv`. |
| Activate blocked by execution policy | PowerShell script restrictions | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once. |
| App shows old or empty data | Stale `app.db` | Section 6. |
| Pages load but no data | Backend not running, or opened a `dist/` build | Start the backend first. Use `npm run dev`, not a plain build. |
| Port 8000 or 5173 already in use | Old server still running | Close the other terminal or use a different `--port` (and update `vite.config.js`). |
| Seed fails: "file in use" / permission | Backend still has `app.db` open | Stop the backend, then re-run. |
| `git status` shows dozens of modified files you didn't edit | Windows vs. Unix line endings (CRLF/LF) | `git config core.autocrlf true`, then `git restore .`. Long-term fix: commit a `.gitattributes` containing `* text=auto`. |
| `pip install` can't find a package | Wrong Python or venv not active | Check the `(venv)` prompt and `python --version`. |

## 8. Tests

```
# Backend (32 tests, throwaway database) from V2/backend, venv active
pytest

# Frontend unit tests, no servers needed, from V2/frontend
npm run test:unit

# Frontend browser tests (backend + frontend running, Playwright installed)
pip install playwright
playwright install chromium
npm test
```
The browser tests add test patients to whatever database the backend is using. Point `TRACKER_DB` at a **copy**, not your only database. On Windows, set `$env:PYTHON="python"` first because the tests call `python3` by default.

## 9. Working on the database

- **Change questions:** edit `V2/database/questions_v2.csv`, then rebuild.
- **Change scoring numbers** (green zone, skip value, free-miss window, credits): update the `settings` table (`GET/PUT /admin/settings`), then `POST /admin/rescore`.
- **Change scoring rules:** edit `V2/database/scoring.py`. The backend loads this exact file, so the rules live in one place.
- **Sanity-check a database:** `PY check_v2_db.py sample.db` from `V2/database` (read-only, 9 checks including an independent SQL recomputation of the scores).
- **Full research build** (about 2 minutes, ~880 MB `v2.db`, git-ignored): see `V2/database/README.md`.

## 10. Known limits

- No login or authorization (demo accounts only). Anyone who can reach the API can read or change any patient.
- Sub-questions (show-if), weekly scoring and the 24-hour edit window are stored but not fully enforced yet.
- The patient-graph start rule (`graph_min_days`, currently 1) and whether late-popup answers count as "batched" are still undecided.
- The frontend sends the calendar date; between midnight and 4 AM the correct check-in day comes from `GET /patients/{id}/now`.
- Not a clinical tool. The score counts how many lifestyle questions earned points; it is not a measure of mood or clinical health.

## 11. Further development (from the poster)

- Role-based secure login.
- Encrypted storage and API calls to meet privacy requirements (HIPAA, HITECH) **before any real patient data is used**.
- Pilot with real patients and practitioners to refine the questions and the green-zone threshold.
- Push notifications and reminders.
- Direct wearable integration (Apple Health, Fitbit) for steps and sleep.
- Provider-added custom questions and secure messaging.
- Link Pip's mood to the patient's progress.
- Local LLM so a practitioner can query a patient's data.
- Machine-learning model to predict mood from recorded actions.

## 12. Key API routes

Docs with every route: http://127.0.0.1:8000/docs

| Route | Purpose |
|---|---|
| `GET /health`, `GET /config` | liveness, green-zone settings |
| `GET /patients/{id}/now` | today's state, what's editable, which popup to show |
| `GET\|PUT /patients/{id}/checkins/{day}/{period}` | read or save a check-in |
| `POST /patients/{id}/checkins/{day}/{slot}/decline` | patient declines: free miss or counted at -1 |
| `GET /patients/{id}/graph` | patient graph (rolling line only) |
| `GET /admin/overview`, `GET /admin/patients/{id}/flags` | practitioner dashboard and flags |
| `GET\|PUT /admin/settings`, `POST /admin/rescore` | change scoring numbers and recompute |
