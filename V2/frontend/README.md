# Lifestyle Tracker frontend (iteration 1)

Multi-page HTML/CSS/JS interface served by Vite. Data comes from the FastAPI backend through the `/api` proxy (`vite.config.js`).

## Tech stack

- HTML pages, CSS for styling, and plain JavaScript (no React or Vue).
- Vite 7 runs the development server and packages the pages.

## Prerequisites

- Node.js 20.19 or newer, or 22.12 or newer. npm comes with it.
- Python 3.13.

## Set up and run

You run two things: the backend (the server that holds the data) and the frontend (the pages). Each one needs its own terminal window. Start the backend first.

### Windows (PowerShell)

Backend, from the `/backend` folder:

```
py -3.13 -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend, from this `/frontend` folder, in a second window:

```
npm install
npm run dev
```

Then open http://127.0.0.1:5173/login.html in your browser.

If PowerShell says scripts are disabled when you run `venv\Scripts\activate`, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once and try again.

### Mac (Terminal)

Backend, from the `/backend` folder:

```
python3.13 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend, from this `/frontend` folder, in a second window:

```
npm install
npm run dev
```

Then open http://127.0.0.1:5173/login.html in your browser. If `python3.13` is not found, install Python 3.13 from python.org first.

### Database

If `app.db` does not exist yet, create it once from the `backend` folder with `python seed_demo.py` (demo patients and fake check-ins). **Never run `seed_demo.py --force` on a database you want to keep: it deletes the existing file.** If `app.db` already exists, leave it alone and just start the backend.

Sign-in is for demonstration only: pick one of the demo accounts on the login page. The server has no real accounts yet.

The `/api` proxy to port 8000 exists only in the Vite dev server. `npm run build` creates `dist/`, but serving `dist/` on its own has no `/api` proxy, so the pages would load without data. Use `npm run dev` (or `npx vite preview`, which uses the same proxy settings) to see the app with data.

## Tests

- `npm run test:unit`: the unit tests. No servers needed.
- `npm test`: the unit tests plus the browser tests. The browser tests need the frontend and the backend running, and Playwright installed:
  `pip install playwright` then `playwright install chromium`.
- The browser tests add test patients to the database they run against. Point the backend at a copy of your data, not your only copy, by setting `TRACKER_DB` to the copy's path before starting the backend. On Windows (PowerShell): `$env:TRACKER_DB="C:\path\to\copy.db"`. On Mac: `export TRACKER_DB=/path/to/copy.db`.
- On Windows, the browser tests call `python3` by default, which often does not exist. Set `$env:PYTHON="python"` (PowerShell) or `set PYTHON=python` (Command Prompt) before `npm test`.

## Score scale

Every calculated score is the server's own number, shown from −10 to +10 ("Lifestyle score"). 0 percent is −10, 50 percent is 0, 70 percent is +4 (the start of the green zone) and 100 percent is +10. The axis range and the green-zone start come from `GET /config`. Differences between two scores are in points (percent difference divided by 5). Raw questionnaire answers keep their own 0 to 10 range. The score counts how many lifestyle questions earned points. It is not a measure of mood or clinical health.

Days that have already finished are scored by the server even when no check-in was submitted (an unanswered graded question earns nothing), so such a day can be as low as −10. The screens say "No check-in submitted" next to those days. Today is always provisional until the day ends.

## Backend routes used

| Route | Where |
| --- | --- |
| `GET /health` | Roster footer shows "Server connected" |
| `GET /config` | Green zone and graph range |
| `GET /questions` | Question counts and lists in the Cards dialog; question text in score detail and written answers |
| `GET /patients` | Roster |
| `POST /patients` | Add patient page |
| `GET /patients/{id}` | Read fresh when the Cards dialog opens and after a change |
| `PUT /admin/patients/{id}/domains` | Cards dialog on the roster and the patient page |
| `GET /admin/overview` | Needs-attention flags and below-green-zone streaks |
| `GET /patients/{id}/scores` | Graph, roster scores, Today, Week, weekly report |
| `GET /patients/{id}/scores/{day}` | Click a day on the graph to see points per question |
| `GET /patients/{id}/checkins/{day}/{period}` | Check-in questions and saved answers |
| `PUT /patients/{id}/checkins/{day}/{period}` | Save a check-in |
| `GET /patients/{id}/days/{day}` | Follow-up context in the check-in, recent written answers, average confidence in the weekly report |

## Notes

- `public/js/hk-boot.js` and `src/hk-backend.js` load backend data into the screens (`src/adapter.js` shapes it).
- Requests are sent one at a time (`src/logic.js`). This is a temporary workaround for intermittent server errors when requests overlap.
- Hourly scores do not exist on the server, so the 1D range is disabled. Today's score is shown as in progress until the day ends.
- Chat panel on the practitioner patient page is not connected: the server has no chat service.
- Only display preferences are kept in the browser (graph size and range, chat height, roster sort and list height, color theme) plus who is signed in for the session.

## Known limitations

- Pip, the pet, is neutral. Linking its look to the patient's score is not built, so it makes no mood claim.
- Chat is not connected (the server has no chat service). 1D range and the "why" breakdown of a day are disabled because the server has no hourly data.
- Custom questions, reminders, invitations and check-in lengths are not part of this iteration.
- Requests are queued one at a time because the backend has a shared database connection that can fail when requests overlap. Backend fix found to prevent it, `src/logic.js` can be simplified.
- The roster is current after the app loads or after a save refreshes a patient. Another person's changes show after a reload.
- The Add patient page accepts a start date in the past, as the server does.
- A patient who only has the General card (no graded questions) shows "No score".
- The "Prototype" bar and the "About this screen" notes are part of the mockup, not the product.

