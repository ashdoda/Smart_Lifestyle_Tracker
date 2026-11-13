# Quick-Start Set-up

Smart Lifestyle Tracker: a FastAPI backend, a SQLite database and a Vite frontend, all inside `V2/`.

**You need:** Python 3.13 and Node.js 20.19+ (or 22.12+) (see the notes at the end for install links). Start in the repo's top folder (the one that contains `V2`). You'll use two terminal windows: one for the backend, one for the frontend.

## 1. Database

Nothing to build or download. `V2/database/sample.db` is the ready-made database (50 patients, 400 days of check-ins and steps). This step copies it to your own `app.db` and moves the dates so check-ins run 365 days back to yesterday and steps run from 365 days back to 35 days ahead.

If you experience issues with py -3.13/python3.13 calls we have found that switching those calls to python only works best to ressolve the issues.

Windows (PowerShell):

```
cd V2\backend
py -3.13 seed_demo.py --reset
```

Mac:

```
cd V2/backend
python3.13 seed_demo.py --reset
```

Run it again any time to start clean, and again on demo day to refresh the dates.

## 2. Backend (same terminal)

Windows (PowerShell):

```
py -3.13 -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000
```

Mac:

```
python3.13 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000
```

Leave it running.

## 3. Frontend (second terminal)

```
cd V2/frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173 (it goes straight to the login page) and pick a demo account.

## Notes

- Node.js: install the LTS version from https://nodejs.org/ (npm comes with it). Check with `node --version`. You can install it from any folder.
  - Windows (PowerShell): `winget install OpenJS.NodeJS.LTS`, then open a new terminal window and run `node --version`.
- Start the backend before the frontend. The frontend sends `/api` requests to port 8000.
- If PowerShell blocks `activate`, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.
- API docs: http://127.0.0.1:8000/docs
- More detail is in the README inside `backend`, `database` and `frontend`.
