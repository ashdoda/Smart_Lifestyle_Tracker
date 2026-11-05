# BACKEND HANDOFF: Lifestyle Tracker prototype

Audience: the person who owns the **BACKEND** (server, API, sign-in, e-mail, scheduled jobs).
Written from the real code in `js/` and from measurements of the shipped pages (nothing here is guessed). If this file and the code ever disagree, the code wins; tell the front-end owner.

> **How to use this file with an AI assistant:** paste the whole file. It is self-contained. The tables behind the data are in `DATABASE_HANDOFF.md` (the DATABASE owner reads that one; this file refers to its sections by number). Reference content (cards, 77 questions, barrier labels, quick-log buttons, validation rules) is in `docs/seed/*.json`; an example of the exact data shapes is `docs/examples/hk-data.sample.json` / `.js`.

---

## 0. What this document gives you

1. **Section 1**: how the front end is built (10 plain HTML pages, 17 scripts, hash routes, URL parameters).
2. **Section 2**: how the screens get their data (`window.HK`) and the exact point where the server plugs in.
3. **Section 3**: sign-in, sessions, roles and which pages each role may open (the prototype has **no** protection at all).
4. **Section 4**: for each page, the data it reads (measured), and how the server builds it.
5. **Section 5**: every button that **writes** something: what it does in the prototype, the exact validation messages the screens already show, and the API call that replaces it.
6. **Section 6**: business rules the BACKEND must own (scoring, adaptive check-in length, reminders, invites).
7. **Section 7**: what the browser already computes (do not re-implement).
8. **Sections 8 to 13**: browser storage to retire, loading/error gaps, security, an integration test, known quirks left as they are, and planned additions (**do not build yet**).
9. **Section 14**: setup and secrets: the settings the server needs, how to create the first provider account, and what to get from and give to the DATABASE owner. The database is **SQLite** (one file, no password).

**Ground rules**

* The front end is a finished prototype. **Do not change the look, the features or the mechanics** to suit the server; the server serves the screens exactly the data they expect (section 3 of `DATABASE_HANDOFF.md`). Where a small front-end change is unavoidable it is listed in section 5 as a **seam** (a function whose body is replaced by an API call) and is made by the front-end owner or with the front-end owner.
* Out of scope: visual design, the database design (see `DATABASE_HANDOFF.md`) and features not in the prototype (only listed in section 13, "Planned additions").

---

## 1. The front end, as the server sees it

### 1.1 Folder

```
index.html            redirects to login.html
login.html  invite.html  provider-patients.html  provider-add.html  provider-patient.html
provider-cards.html  provider-report.html  patient-today.html  patient-checkin.html  patient-week.html
css/   fonts.css themes.css base.css pet.css login.css provider.css patient-page.css cards.css phone.css week.css
js/    hk-data.js hk-example-data.js icons.js core.js data.js pet.js chart.js login.js provider.js patient-page.js cards.js checkin.js private.js patient-app.js week.js hk-state.js main.js
fonts/ two .woff2 files    palette/ palette.md + palette.png    docs/ seed/ examples/ (+ these two handoff files)
```

Everything is static (no build step, no framework, no network calls, no external fonts or scripts). Every page loads the **same** ten stylesheets and the **same** seventeen scripts in the same order; each page differs only by its `<body data-page="...">` and by which screen the router draws in it.

### 1.2 The ten pages

| Page file | Route inside the page (after `#`) | Who | What it is | Data it reads (measured, section 4) |
|---|---|---|---|---|
| `login.html` | `/login` | anyone | sign-in form | `patients` (only for a convenience link, see section 12), `config.demoLogins`, `config.demoNote` |
| `invite.html` | `/invite/<token>` | invited patient | choose a password to create the account | `patients` (the invited patient), `config.providerName`; `accounts` only when the patient is already active (to show "already used") |
| `provider-patients.html` | `/provider` | provider | patient list: search, filters, sort, status, sparkline, send invites | `patients`, `events`, `config.providerName`, `config.providerEmail` |
| `provider-add.html` | `/provider/add` | provider | add one patient / import a list | `patients` (duplicate check), `accounts` (duplicate check) |
| `provider-patient.html` | `/provider/patient/<patientId>` | provider | one patient: Overall Score chart, snapshot, note, week by card, recent check-ins, shared goals | `patients`, `events`, `domainScores`, `answers`, `notes`, `privateGoals` |
| `provider-cards.html` | `/provider/patient/<patientId>/cards` | provider | card settings (unlock cards, length, reminders, quick-log buttons, custom questions) | `patients`, `customQuestions` |
| `provider-report.html` | `/provider/patient/<patientId>/report` | provider | weekly report | `patients`, `domainScores`, `answers`, `week`, `customQuestions`, `customResults` |
| `patient-today.html` | `/patient` | patient | Today: pet, rating, next check-in, quick log, ideas, private goals | `patients`, `domainScores`, `today`, `privateGoals`, `customQuestions` |
| `patient-checkin.html` | `/patient/checkin` | patient | the morning/evening check-in | `patients`, `customQuestions` |
| `patient-week.html` | `/patient/week` | patient | weekly summary + reflection | `patients`, `domainScores`, `week`, `privateGoals`, `config.providerName` |

Every page also reads `config.now` and, because the app updates every loaded patient's "last check-in" time at start-up, **`events` for every patient that is loaded**. Reads that only happen on an action: `config.defaultScore` (Today, and the check-in finish screen, when the patient has no score), `accounts` (sign-in submit; the "invite already used" check).

`<patientId>` is the patient id (`[^/?#]+`, see `DATABASE_HANDOFF.md` section 2).

### 1.3 URL conventions

* **Hash routes.** The screen is chosen by the part after `#`; the page file is chosen by the file name. If the hash belongs to a different page file the app moves there by itself (`location.replace(file + hash)`); an unknown hash goes to `login.html#/login`. With no hash the page opens its own default screen. So a server only has to serve the 10 static files and `docs`/`css`/`js`/`fonts`; the server never sees the hash.
* **Query parameters (inside the hash, after `?`):** `p=<patientId>` (which patient's phone app to show; ignored unless that patient is in the loaded data; falls back to the signed-in patient, then to the first loaded patient), `when=am|pm` (which check-in to open; default `pm`), `clean=1` (hides the "Prototype" navigation bar; the app keeps it on every link it builds). In production a patient's own data is the only record loaded, so `p` is never needed.
* **Tab bar** of the patient app: Today (`/patient`), Check-in (`/patient/checkin`), Week (`/patient/week`).

### 1.4 The seventeen scripts (all loaded by every page, in this order)

| Script | Role |
|---|---|
| `hk-data.js` | **the adapter**: `window.HK` (config, data tables, hooks). The only file the server needs to feed (section 2) |
| `hk-example-data.js` | **example data, development only**: one provider login, one patient (Alex Sample) and the two press-to-fill login buttons. Loaded right after `hk-data.js`; delete it and its `<script>` line in the 10 pages for real use |
| `icons.js` | inline icon set |
| `core.js` | helpers, date formatting, `store` (localStorage wrapper), toast, dialog, theme switcher, **router and the `PAGES` table**, the "Prototype" bar |
| `data.js` | content (general goal questions, 6 cards with their questions/ideas/resources, barriers, quick-log buttons), patient loading and the derived fields (`analyze`, section 7) |
| `pet.js` | Pip the pet: scenes, moods, animation |
| `chart.js` | the Overall Score chart (range buttons, zoom, custom range, "what changed" panel) |
| `login.js` | sign-in and invite pages |
| `provider.js` | provider shell, patient list, add/import patients, invites |
| `patient-page.js` | provider's patient page |
| `cards.js` | card settings and the custom-question builder |
| `checkin.js` | the check-in flow (queue, adaptive follow-ups, finish) |
| `private.js` | private goals (patient) and the shared-goals box (provider) |
| `patient-app.js` | patient Today screen, phone frame, quick log, resources |
| `week.js` | patient weekly summary and provider weekly report |
| `hk-state.js` | **mock-only** plumbing: carries in-memory state across page files through `sessionStorage` (retire it, section 8) |
| `main.js` | start-up (inside `HK.ready`) |

Start-up order (in `main.js`, inside `HK.ready(cb)`): `hkLoadPatients(HK.data.patients)` → `restoreEnrollment()` (**mock-only**) → `hkRestoreState()` (**mock-only**) → update every patient's last-check-in time from `events` → draw the "Prototype" bar → draw the screen.

### 1.5 Palette and fonts

Five switchable palettes (`sage` default, `lavender`, `tide`, `oat`, `pine`) are set by `data-theme` on `<html>` and remembered in `localStorage hk.theme`. Fonts: **Bricolage Grotesque** (headings/numbers) and **Atkinson Hyperlegible Next** (body), files in `fonts/`, rules in `css/fonts.css`. Token table: `palette/palette.md`. None of this involves the server.

---

## 2. How the screens get their data (`window.HK`) and where the server plugs in

### 2.1 The adapter

Every screen reads data **synchronously from memory** through one object, `window.HK`, defined in `js/hk-data.js` (the first script on every page). Nothing in the app calls a server. `js/hk-data.js` itself is empty; the second script on every page, `js/hk-example-data.js`, fills it with **one example provider login and one example patient** so every screen can be opened and clicked (the example logins are listed at the start of section 3). In real use, delete that file and its `<script>` line from the 10 pages; the pages then open in their empty states.

```
HK.config      small settings: providerName, providerEmail, now, defaultScore, demoLogins, demoNote
HK.data        plain tables: patients, accounts, domainScores, events, answers, week, customResults,
               privateGoals, customQuestions, notes, today          (shapes: DATABASE_HANDOFF.md section 3)
HK.provider    11 functions the screens call; each default reads the matching table in HK.data
HK.ready(cb)   runs cb once data is in place (default: calls cb immediately)
HK.now()       the clock (HK.config.now, or the real time)
```

`js/main.js` starts the whole app inside `HK.ready(...)`. So the contract is: **fill `HK.config` and `HK.data`, then call `cb()` once.** Because every read is synchronous, **all data a page needs must already be in `HK.data` before `cb()` is called**; there is no "load more later" path.

The 11 hooks in `HK.provider` (you normally do **not** override them; filling the table is enough):

| Hook | Called with | Returns | Default reads |
|---|---|---|---|
| `domainScores(p, date, score)` | patient, a Date, that day's Overall Score or null | `{ cardId: 0-100 }` | `data.domainScores[p.id]['YYYY-MM-DD']` |
| `dayEvents(p, date)` | patient, a Date | `{ ev: [[hour, label, tag], ...], r }` (`r` = seeded random function for chart noise) | `data.events[p.id]['YYYY-MM-DD']` |
| `recentAnswers(p)` | patient | newest-first `[{ d: Date, when, dom, txt, barrier }]` | `data.answers[p.id]` |
| `weekBarriers(p)` | patient | `[[label, days], ...]` | `data.week[p.id].barriers` |
| `weekConfidence(p, ctx)` | patient, `{ avg, pavg }` | `{ conf, pconf }` | `data.week[p.id].conf / pconf` |
| `weekCheckins(p, W)` | patient, week data | number 0 to 14 | `data.week[p.id].checkins` |
| `customResult(p, q, W)` | patient, a custom question, week data | one-line text | `data.customResults[p.id][q.id]` |
| `seedPrivateGoals(pid)` | patient id | array of private goals | `data.privateGoals[pid]` |
| `defaultCustomQuestions(pid)` | patient id | array of custom questions | `data.customQuestions[pid]` |
| `providerNote(p)` | patient | string | `data.notes[p.id]` |
| `todayStatus(pid)` | patient id | `{ amDone, amTime, pmDone }` | `data.today[pid]` |

All hooks are **synchronous**; a hook cannot call the server per request. Server data therefore has to be loaded into `HK.data` ahead of time (next section).

### 2.2 Two ways to feed it (choose one; both need no change to any screen)

**A. One bootstrap request per page (recommended).** Replace `HK.ready` at the end of `js/hk-data.js` (the file's own header comment shows this seam):

```js
HK.ready = function (cb) {
  var page = document.body.dataset.page;                        // 'login.html', 'provider-patients.html', ...
  if (page === 'login.html') { cb(); return; }                  // the sign-in page needs no data and must NEVER receive a roster
  var url = '/api/hk?page=' + encodeURIComponent(page);
  if (page === 'invite.html') {                                 // invite link: invite.html#/invite/<token>
    var m = location.hash.match(/\/invite\/([^/?#]+)/);
    url = '/api/hk/invite/' + encodeURIComponent(m ? m[1] : '');
  }
  fetch(url, { credentials: 'same-origin' })
    .then(function (r) { if (r.status === 401 || r.status === 403) { location.replace('login.html#/login'); return null; } return r.json(); })
    .then(function (d) {
      if (!d) return;
      Object.assign(HK.config, d.config || {});
      Object.keys(d.data || {}).forEach(function (k) { HK.data[k] = d.data[k]; });   // omitted tables stay empty
      cb();
    });                                                          // add error handling: section 9
};
```

The response shape is exactly `{ "config": { ... }, "data": { "patients": [...], "events": {...}, ... } }`, i.e. the content of `docs/examples/hk-data.sample.json`. Each navigation to another page file is a **full page load**, so each page fetches again (this keeps data fresh after writes).

**B. A server-rendered `js/hk-data.js`.** The server serves `js/hk-data.js` dynamically, session-aware: the static content of the file plus two lines `Object.assign(HK.config, {...}); Object.assign(HK.data, {...});` (the layout of `docs/examples/hk-data.sample.js`). Zero front-end change, but the same script URL serves every page, so it must send the **union** of what the signed-in role may see on any page, and it must not be cached across users.

**Never** put real data in a static file served to everyone.

### 2.3 Rules that apply to both

* **`HK.config.now` must be `null`** (or omitted) in production. The calendar date used by every screen is fixed **when `js/core.js` loads**, which is **before** `HK.ready` runs, so a `now` that arrives later has no effect on "today", and a wrong `now` would show wrong dates in the parts that do re-read it (greeting and phone clock).
* "Today" is the **browser's** local date; the server must build day keys (`YYYY-MM-DD`) in the viewer's time zone (`DATABASE_HANDOFF.md`, section 4.4).
* Load only what the signed-in user may see (section 3.4). The prototype pages load a whole roster for everyone.
* `HK.config.demoLogins` must be `[]` and `HK.data.accounts` must be omitted in production (section 3.1).
* After a write, the screens update their own in-memory copy (as in the prototype); the BACKEND's write responses must return what the page needs (section 5). The next page load re-reads everything from the server.

---

## 3. Sign-in, sessions, roles

**Example logins in the delivered folder (development only; made-up addresses and one shared password):** `provider@example.org` (role provider, shown as "Dr. Provider") and `alex.sample@example.org` (role patient, id `pat-7f3a`, the one example patient), both with the password `Test1234!`. The sign-in page shows them as two buttons ("Provider", "Patient (Alex)") that fill the e-mail and password boxes. They come from `js/hk-example-data.js` (`HK.config.demoLogins` and `HK.data.accounts`); delete that file for real use. There are **no other credentials anywhere in the folder**: no API keys, no server address, no database connection string. The BACKEND and DATABASE owners create their own (see section 10 for what the server must keep secret).

### 3.1 What the prototype does (all mock)

* **Sign-in** (`login.js`): validates the form in the browser (messages below), waits 650 ms, then looks the e-mail up in `HK.data.accounts` plus `localStorage hk.extraAccounts` and compares the **plain-text password** in the browser. Success sets `session.role` / `session.id` in memory and goes to `/provider` (role `provider`) or `/patient` (role `patient`; `?p=<id>` is added only when that patient is not the first loaded patient). Failure shows "Email or password is incorrect." under the form.
* **Sign-out**: the provider's "Sign out" button sets `session.role = null` and goes to the sign-in screen. The patient's weekly summary has a "Sign out" **link** that only navigates to the sign-in screen and does **not** clear anything (it is a seam, section 5.17).
* **Session**: the `session` object lives in memory and is copied into `sessionStorage` (`hk.state`) when a page is left and restored on the next page, so it survives page hops but not a refresh (a reload clears it) or a new tab.
* **No protection**: no screen checks the role; any page opens for anyone, with whatever is in `HK.data`.
* **Invite page**: see sections 5.3 to 5.5.
* **Not in the prototype at all** (and therefore not specified by any screen): provider registration, forgot / reset password, change password, e-mail verification, multi-factor sign-in, session time-out, "remember me", account deletion, patient-initiated invitations. The BACKEND must provision providers outside the UI (script or admin) and decide on the rest.

### 3.2 Required endpoints

| Endpoint | Purpose | Request | Success | Failure |
|---|---|---|---|---|
| `POST /api/auth/login` | sign in | `{ email, password }` | `200 { role: "provider" \| "patient", patientId: string \| null }` and a session cookie | `401 { error: "Email or password is incorrect." }` for **both** unknown e-mail and wrong password (same message, same timing); `429` when throttled |
| `POST /api/auth/logout` | sign out | none | `204`, session destroyed | none |
| `GET /api/hk?page=<file>` | page data (section 4) | session | `200 { config, data }` | `401` no session, `403` wrong role |
| `GET /api/hk/invite/<token>` and `POST /api/invite/<token>/accept` | invite flow | sections 5.4 and 5.5 | | |

**Seam for sign-in** (`js/login.js`, the `submit` handler of `#signin`): the body of the `setTimeout(..., 650)` callback (the `accounts()` look-up) is replaced by a `fetch('/api/auth/login', ...)`. On success: `session.role = d.role; session.id = d.patientId; go(keepClean(d.role === 'provider' ? '/provider' : '/patient'))` (a patient needs no `?p=` because only their own record is loaded). On failure: the existing lines that re-enable the button (`btn.disabled = false; btn.textContent = 'Log in'`) and show "Email or password is incorrect." (the message element already exists).

**Sign-in screen validation (already in the screen; the server validates again):**

| Field | Message |
|---|---|
| E-mail empty | `Enter your email.` |
| E-mail not an address (`/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/`) | `Enter a valid email, like name@example.com.` |
| Password empty | `Enter your password.` |
| Wrong credentials | `Email or password is incorrect.` |

### 3.3 Password rules (must match the screens)

Used on account creation (invite page): **at least 8 characters**, **at least 1 capital letter** (`[A-Z]`), **at least 1 symbol** (a character that is not a letter, a digit or whitespace; regex `[^A-Za-z0-9\s]`), and the confirmation must be identical. Screen messages: `Password does not meet all the requirements below.`, `Confirm the password.`, `Passwords do not match.`, and above the button `Fix the highlighted fields and try again.`. The server must enforce the same rules (never trust the browser), store only a **salted hash** (argon2id or bcrypt), and compare e-mails **lower-case**. Sign-in does not apply the rules (it only checks that the password is not empty).

### 3.4 Who may open what

| Page file / data | Public | Patient (own data only) | Provider (own patients only) |
|---|---|---|---|
| `index.html`, `login.html`, `css/`, `js/`, `fonts/`, `palette/` | yes | yes | yes |
| `invite.html` | with a valid invite token | n/a | n/a |
| `patient-today.html`, `patient-checkin.html`, `patient-week.html` | no | yes | **preview only** (section 3.5) |
| `provider-patients.html`, `provider-add.html`, `provider-patient.html`, `provider-cards.html`, `provider-report.html` | no | **no** | yes |
| `docs/` (these handoff files, seed, examples) | **do not serve in production** | no | no |

The static page files contain **no data**, so serving them is harmless; the **data** endpoints (and every write) are what must enforce the matrix. A provider may only request data of patients with `patient.provider_id = their id`; a patient only their own; changing an id in the URL must never reveal another person's data.

### 3.5 "Preview as patient" (decision needed)

Three links open **patient screens inside a provider session**: "Preview as patient" (card settings → `patient-checkin.html#/patient/checkin?p=<id>`), "See patient version" (weekly report → `patient-week.html#/patient/week?p=<id>`) and, in the invite dialog, "Open it as the patient" (`invite.html#/invite/<id>`). Recommended: allow it **only for the provider's own patients**, serve the **same data the patient would get except unshared private goals** (provider payload rules, `DATABASE_HANDOFF.md` section 9), and make every patient **write** endpoint reject provider sessions with `403` so the preview can never record answers, quick logs or goals as the patient. (The screens do not handle a rejected write; they would still show their success toast. If that matters, remove the preview links or add a read-only mode: both are front-end changes to agree on.)

---

## 4. What each page needs (read side)

### 4.1 Page by page: who gets what

The columns say **which patients** and **which keys** the bootstrap response must contain for each page (the "reads" were measured by opening every page with the example data; see section 1.2). Anything not listed may be left out (an omitted table is simply empty; every screen has an empty state). How to **build** each key is in `DATABASE_HANDOFF.md` section 4.3; the shape of each key is in its section 3.

| Page | Signed-in role | `patients` | Other keys |
|---|---|---|---|
| `provider-patients.html` | provider | **all** of the provider's patients, full records (the list needs the whole `series` for status, sparkline, "days on the app") | `events`: for each patient the **last check-in day** only (used for the "Last check-in: Today, 12:36 PM" clock). `config.providerName`, `config.providerEmail` |
| `provider-add.html` | provider | all of the provider's patients as **slim** records `{ id, name, email, state }` (the page uses them only for the "already on your list" check; the server must check again) | none. `config.providerName`, `config.providerEmail` |
| `provider-patient.html` | provider | **that patient only**, full record | `events` (every day with an Overall Score: the 1D chart and one-day custom windows read any day), `domainScores` (every scored day), `answers` (newest 10), `notes`, `privateGoals` (**shared goals only**). `config.providerName`, `config.providerEmail` |
| `provider-cards.html` | provider | that patient only | `cardConfig` (new key, section 4.3), `customQuestions`. `config.providerName`, `config.providerEmail` |
| `provider-report.html` | provider | that patient only | `domainScores` (last 14 days), `answers` (newest 10), `week`, `customResults`, `customQuestions` and `cardConfig` (the report lists the custom questions from the card configuration). `config.providerName`, `config.providerEmail` |
| `patient-today.html` | patient (or provider preview, 3.5) | that patient only | `domainScores` (**today's date key**), `today`, `privateGoals` (**all** of the patient's goals), `cardConfig`. `config.providerName`, `config.defaultScore` |
| `patient-checkin.html` | patient | that patient only | `cardConfig`, `customQuestions`. `config.providerName`, `config.defaultScore` |
| `patient-week.html` | patient | that patient only | `domainScores` (last 14 days), `week`, `privateGoals` (all of the patient's), `config.providerName` |
| `invite.html` | not signed in (invite token) | **one** record whose `id` is the invite token (section 5.4) | `config.providerName`. For an already-used invite also `accounts` (section 5.4) |
| `login.html` | not signed in | **none** (see section 12: the sign-in page shows a link to an "example invite page" whenever any loaded patient is in the `invited` state) | none |

In every response: `config.now = null`, `config.demoLogins = []`, no `accounts` (except the used-invite stub in 5.4), and day keys built in the viewer's time zone.

Why "that patient only" is safe: the patient and card pages work with exactly one record (an unknown id sends the provider back to the list), and a patient's own device only ever has their own record. The provider list is the only page that needs the whole roster.

### 4.2 Building the keys

Follow `DATABASE_HANDOFF.md` section 4.3 for each key (queries and rules). Three points that matter at the API layer:

* **Dense `series`.** For every `active` patient the server must send one entry per calendar day from the join date to **today in the viewer's time zone** (null where there is no check-in). If the server's "today" differs from the browser's, the last entry is wrong and "this week" is shifted. (`DATABASE_HANDOFF.md` 3.2 and 4.4.)
* **`lastActiveAt`** = the time of the patient's latest completed check-in, ISO 8601 **with an offset** (for example `2026-11-03T21:15:00-06:00` or `...Z`); the browser shows only its hour and minute in the viewer's time zone.
* **Provider payloads never contain unshared private goals, other providers' patients, other patients' notes, or any password data.**

### 4.3 Seam S1: the saved card configuration is **not** in `HK.data` today

In the prototype the card settings a provider saves (`js/cards.js` `saveCfg`) are written to the **browser's own** `localStorage` (`hk.cfg.<patientId>`), and every screen that needs them (`cfg(pid)`: the Today screen's quick-log buttons, the check-in's length and automatic shortening, the custom questions in the check-in, the weekly report's custom questions) reads them from the **same browser**. That only works because the demo runs in one browser. Across devices (provider's computer, patient's phone) the configuration would be missing: `cfg()` would fall back to defaults built from the patient record (`unlocked`, `lengthChosen`, and `HK.data.customQuestions`). So with the keys that exist today, **only unlocked cards, default length and custom questions reach a patient's phone; quick-log buttons, automatic shortening and every other option do not.**

**Required change** (the one place the adapter needs a new key): add a table `HK.data.cardConfig` (`patientId -> configuration object`) and make `cfg(pid)` in `js/cards.js` use it first:

```js
// js/cards.js  cfg(pid): replace  const d = store.get('cfg.' + p.id, null);   with
const d = (HK.data.cardConfig || {})[p.id] || null;      // server value; falls back to the defaults below when missing
```

and make `saveCfg(pid, c)` call the API (section 5.8) instead of `store.set('cfg.' + pid, c)` (keep the two lines that update `p.unlocked` and `p.lengthChosen`, and keep the object in memory: `HK.data.cardConfig[pid] = c`, because the screen re-reads `cfg()` after a change).

The object is exactly what `cfg()` builds today (defaults shown):

```jsonc
{
  "unlocked": ["activity","diet","mind","sleep","social"],   // card ids, display order (DATABASE_HANDOFF.md 4.2 "position")
  "length": "standard",                       // "quick" | "standard" | "extended"  (= patient.lengthChosen)
  "autoShorten": true, "offerLonger": true,
  "remindAm": "08:00", "remindPm": "20:00", "skipIfDone": true,          // "HH:MM" 24-hour
  "quick": { "drink": true, "food": true, "urge": false, "smoke": false, "intimacy": false, "drip": false },
  "steps": "4,000",                           // "2,000" | "4,000" | "6,000" | "8,000"
  "photoLog": false, "foodIdeas": true,
  "mindLen": "3 minutes",                     // "1 minute" | "3 minutes" | "5 minutes" | "10 minutes"
  "cbti": false, "windDown": "21:30", "socialIdeas": true,
  "subGoal": "Stay within my limit",          // "Abstain today" | "Stay within my limit" | "Cut back from yesterday"
  "subLimit": "No more than 2 drinks, and none before 6 PM",   // free text
  "craving": true, "subNote": true,
  "custom": [ { "id": "q-1", "dom": "activity", "when": "pm", "type": "yesno", "text": "...", "options": ["..."] } ]   // = HK.data.customQuestions[pid] in the same shape
}
```

It is stored in `patient_card_config` plus `patient_card` (`unlocked`), `patient.length_chosen` and `custom_question` (`DATABASE_HANDOFF.md` 4.2). Missing keys fall back to the defaults, so the server may omit any field that still has its default. Which of these fields have a **visible effect** on patient screens today is listed in `DATABASE_HANDOFF.md` section 5 (`unlocked`, `length`, `autoShorten`, `quick`, `custom`); the rest are stored as the provider's instructions for later versions.

### 4.4 `HK.config` by role

| Field | Provider pages | Patient pages | Invite page |
|---|---|---|---|
| `providerName` | the provider's display name | the patient's provider's display name | the inviting provider's display name |
| `providerEmail` | the provider's e-mail | not used | not used |
| `now` | `null` | `null` | `null` |
| `defaultScore` | not used | the rating shown when the patient has no score yet; **a placeholder** (default 56), see `DATABASE_HANDOFF.md` 8 | not used |
| `demoLogins`, `demoNote` | `[]`, `''` | `[]`, `''` | `[]`, `''` |

### 4.5 Size and speed

The provider list is the only heavy request (full `series` for every patient: about 1,000 small objects for 3 years of history per patient). For a typical practice (tens to a few hundred patients) send it as one JSON response, compressed (gzip/br), with `ETag`. Each page change re-requests (section 2.2 A); caching the roster for a few seconds is fine. See `DATABASE_HANDOFF.md` section 10 for larger rosters.

### 4.6 Empty states the screens already handle

No patients, no check-ins, no events, no answers, no week data, no private goals, no custom questions, no note: each key may be empty or missing and the page shows its own empty message. **What a screen does with wrong data** (unknown enumeration values, non-dense `series`, malformed `answers`) is listed in `DATABASE_HANDOFF.md` section 3 under "If wrong"; the BACKEND should validate its own output against that list.

---

## 5. Write endpoints (one per action that changes data)

Every action below looks like it saves something in the prototype, but **nothing reaches a server**: the data lives in `localStorage` (keys start with `hk.`), in page memory, or in a toast only. This section lists each action once, in the same order as the DATABASE document's section 5 table, with: where it is in the code, what the screen does today, the **exact on-screen messages**, the request and response, the rules the server must enforce, and the **seam** (the smallest front-end change that connects it). The seam code is **documentation only**: no screen file has been changed.

### 5.0 Conventions for every write

| Topic | Rule |
|---|---|
| Format | JSON in and out, `Content-Type: application/json; charset=utf-8`, over HTTPS. Dates are `YYYY-MM-DD`; times of day are `HH:MM` (24 hour); instants are ISO 8601 with offset. |
| Session | The session cookie from sign-in (section 3). Cookie flags `HttpOnly; Secure; SameSite=Lax` (or `Strict`). |
| CSRF | Every write also sends a header `X-CSRF-Token` (value delivered in the bootstrap response, section 2.2 A, e.g. a `csrf` field next to `config`/`data`). Reject writes without it with `403`. |
| Errors | `{ "error": "<message for a person>", "fields": { "<fieldName>": "<message>" } }`; `fields` only for validation errors. `400` invalid input, `401` no session (the seam below sends the browser to the sign-in page), `403` wrong role, not your patient, or a provider session on a patient endpoint (section 3.5), `404` unknown id, `409` conflict (duplicate / already done), `410` expired invite, `413` body too large, `429` throttled. Never include internals or other people's data in an error. |
| Messages the screens already show | Quoted below in `monospace`. Where the server needs a message that **no screen contains**, it is marked **(suggested)**; the screens have no place for most of them, so see the seam. |
| Ids | The **server** creates every id. Ids end up inside URLs (`#/provider/patient/<id>/cards`, `?p=<id>`), so use only `A-Za-z0-9_-` (the router matches `[^/?#]+`). The prototype invents ids in the browser (`p03`, `c1730000000000`, `g1730000000000`); the seams below replace them with the server's id. |
| Ownership | The provider id / patient id always comes from the **session**, never from the body. A provider may only touch rows where `patient.provider_id` is their own id; a patient only their own rows. Answer `404` (not `403`) for an id that belongs to someone else, so ids cannot be probed. |
| Double clicks | Most buttons in the prototype do not disable themselves, and nothing shows a spinner. Make writes **idempotent or de-duplicated** where noted (e-mail uniqueness, one check-in per period per day, `Idempotency-Key` on check-ins). |
| Order | The screens update their own in-memory copy first and never re-read until the next page load. Return, in every response, the **canonical stored values** so the seam can overwrite its copy. |
| Rate limits | Suggested: sign-in 10 per 10 minutes per e-mail and per IP; invites 1 per patient per 5 minutes; all other writes 120 per minute per session. |
| Size | Suggested body limit 64 KB (the largest write is the card-settings object, section 5.8, about 2 KB; a roster import of 500 rows is about 40 KB). |

**The one helper every seam uses.** Put this in `js/hk-data.js` (the first script on every page, the file this hand-off already expects you to edit), next to `HK.ready`:

```js
HK.csrf = '';                                   // set from the bootstrap response (e.g. d.csrf) in HK.ready
HK.api = function (method, url, body) {         // resolves with the parsed JSON (or null), rejects with an Error that has .status and .body
  return fetch(url, { method: method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': HK.csrf },
    body: body === undefined ? undefined : JSON.stringify(body) })
    .then(function (r) {
      if (r.status === 401) { location.replace('login.html#/login'); return new Promise(function () {}); }   // session ended: leave the page
      return r.text().then(function (t) {
        var d = t ? JSON.parse(t) : null;
        if (!r.ok) { var e = new Error((d && d.error) || 'Request failed'); e.status = r.status; e.body = d; throw e; }
        return d;
      });
    });
};
```

Everything below calls `HK.api('POST', url, body)` and uses the existing global helpers `toast(text)`, `go(route)`, `setErr(root, fieldId, message)` and `render()` (all defined in `js/core.js` / `js/login.js`). The prototype has **no error handling for a failed write** (section 9 lists what to add); each seam shows a minimal `.catch`.

---

### 5.1 Add one patient

| | |
|---|---|
| Where | `js/provider.js`, page `provider-add.html` (`#/provider/add`), form `#addform` (submit handler), helpers `createPatient` and `addPatient`. |
| Today | `createPatient` builds the patient in memory with a made-up id (`'p' + (count + 1)` zero-padded to two digits, e.g. `p07`) and appends `{ name, email, length }` to `localStorage hk.newPatients`; `restoreEnrollment()` re-creates them on the next load. Nothing leaves the browser. |
| Fields | `#aname` full name, `#aemail` e-mail, `#alen` three buttons `quick` / `standard` (default) / `extended` (labels "Quick 1 min", "Standard 3 min", "Extended 5 min"). |
| Screen checks (also on blur) | name empty after trim: `Enter the patient’s full name.` E-mail empty: `Enter an email address.` E-mail not matching `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/`: `Enter a valid email, like name@example.com.` E-mail already used (compared lower-case against every patient on the list **and** every sign-in account): `This email is already on your list.` Submitting with errors focuses the first bad field and sends nothing. |
| After success | The form is hidden; a card says "`<name>` was added. No email has been sent yet." with buttons "Send invite now" (section 5.3), "Choose their cards first" (link to `#/provider/patient/<id>/cards`), "Add another patient" (resets the form) and "Back to patient list"; toast `Patient added`. |

**Request:** `POST /api/patients`

```json
{ "name": "Jamie Rivera", "email": "jamie@example.com", "length": "standard" }
```

* `name`: trimmed, 1 to 120 characters (the screen sets no limit; **keep the first name first**, the screens take the text before the first space as the first name). `email`: trimmed and **lower-cased by the server** (the screen already lower-cases it), 3 to 254 characters, the regex above. `length`: one of `quick`, `standard`, `extended`; default `standard`.

**Response `201`:** `{ "patient": <one record of HK.data.patients, DATABASE_HANDOFF.md section 3.2> }`, e.g.

```json
{ "patient": { "id": "pat-5d2e", "name": "Jamie Rivera", "email": "jamie@example.com", "state": "none", "fav": false,
               "age": null, "pronouns": "", "goal": "Goal to be set at the first visit", "invitedOn": null,
               "lengthChosen": "standard", "lengthNow": "standard",
               "unlocked": ["activity","diet","mind","sleep","social"], "series": [ { "d": "2026-11-04", "score": null } ] } }
```

**Errors:** `400 { fields: { "email": "Enter a valid email, like name@example.com." } }` (use the same texts as above, keyed by the form field names `name` / `email`); `409 { fields: { "email": "This email is already on your list." } }` (duplicate e-mail). Use the same duplicate message when the e-mail belongs to **another** provider's patient or to any user account (do not say which).

**Server rules:** create `patient` with the defaults in `DATABASE_HANDOFF.md` section 5 ("New patient defaults"): `state` `none`, `unlocked` = `activity, diet, mind, sleep, social` (not `substance`), `length_chosen` = `length_now` = the chosen length, `goal` = `Goal to be set at the first visit`, `age` null, `pronouns` `''`, one `patient_card_config` row with the DDL defaults, `joined_on` = today in the provider's time zone. **No e-mail is sent** and no invite row is created (the card says so in words).

**Seam** (`js/provider.js`): in the `submit` handler, replace `const p = createPatient({ ... })` and make the rest of the handler run in the `.then`:

```js
HK.api('POST', '/api/patients', { name: $('#aname', root).value.trim(), email: $('#aemail', root).value.trim().toLowerCase(),
                                  length: $('#alen [aria-pressed="true"]', root).dataset.v })
  .then(function (d) {
    var p = addPatient(d.patient);           // addPatient must keep the server id: change its first line to  const id = info.id || 'p' + ...  and destructure `id: sid` / `invitedOn` as needed
    /* ...the existing code from  $('#addform', root).classList.add('hide')  down to  toast('Patient added')  stays as it is... */
  })
  .catch(function (e) { var f = (e.body && e.body.fields) || {}; if (f.name) setErr(root, 'aname', f.name); if (f.email) setErr(root, 'aemail', f.email); if (!f.name && !f.email) toast('Could not add the patient. Try again.'); });   // last text is (suggested)
```

Also delete the `store.set('newPatients', ...)` line inside `createPatient` and the `store.get('newPatients', ...)` loop in `restoreEnrollment` (section 8).

---

### 5.2 Import a list of patients

| | |
|---|---|
| Where | `js/provider.js`, same page, card "Import a list": `#itext` (paste), `#ifile` (choose a CSV or text file), `#iprev` (preview), `#iadd` (button), helper `parseRoster`. |
| Today | The page parses the text, shows a preview, and on "Import" calls `createPatient({ ...row, length: 'standard' })` for each good row (so every imported patient gets `standard`), toasts, and goes to the patient list. Nothing is saved on a server. |
| Parsing rules (in the browser, shown to the user as a preview) | Split on line breaks, trim, drop empty lines. Split each line on `,` or tab or `;`; trim each part and remove a double quote at its start and one at its end. **E-mail** = the first part that matches the e-mail regex; **name** = the first part that is non-empty, is not the e-mail and does not itself look like an e-mail. The browser keeps the e-mail **exactly as typed** (it does not lower-case it here, unlike the single-patient form), so the server must lower-case it. If the **first line** has no e-mail and contains the word "email" (any case) it is treated as a header and skipped. A line without both a name and an e-mail is skipped as `<first 40 characters of the line> (needs a name and an email)`. An e-mail that is already on the list (or repeated earlier in the pasted text, compared lower-case) is skipped as `<email> (already on your list)`. Limitations to know: a quoted field that itself contains a comma ("Rivera, Jamie") is split in two; only the first e-mail and first name per line are used. |
| Preview text | `<n> ready to import` in bold, and if any were skipped a line `<k> skipped: <first three reasons joined by "; ">` plus `...` when there are more than three. Button label: `Import <n> patient` / `Import <n> patients` (disabled while `n = 0`); with nothing: `Nothing to import yet.` |
| File | "Choose a CSV file" reads the file **in the browser** (`.csv`, `.txt`) and puts its first 200,000 characters in the text box; the file itself is never uploaded. Pasted text has no limit. |
| After success | Toast `<n> patients added. Invite them from the list when you are ready.` (it says "patients" even when `n` is 1) and the browser goes to the patient list (`#/provider`, a full page load). |

**Request:** `POST /api/patients/import`

```json
{ "rows": [ { "name": "Jamie Rivera", "email": "jamie.rivera@example.com" }, { "name": "Sam Ortiz", "email": "sam.ortiz@example.com" } ] }
```

The browser sends only the rows it parsed as good (the server must **re-validate every row exactly like section 5.1**; never trust the preview). Limit: 500 rows per request (suggested; the screen has no limit).

**Response `200`:**

```json
{ "created": [ <patient record>, ... ],
  "skipped": [ { "email": "sam.ortiz@example.com", "reason": "already on your list" } ] }
```

Partial success is allowed: create the valid rows, list the others in `skipped`. Every created patient gets the **`standard`** length (the screen does not offer a choice here).

**Seam** (`#iadd` click handler, `js/provider.js`): replace the loop with

```js
HK.api('POST', '/api/patients/import', { rows: parsed.ok })
  .then(function (d) { toast(d.created.length + ' patients added. Invite them from the list when you are ready.'); go('/provider'); })
  .catch(function () { toast('Could not import the list. Try again.'); });      // (suggested text)
```

`go('/provider')` loads `provider-patients.html`, which fetches the new roster, so nothing else is needed. If rows were skipped by the server that the browser thought were fine (race with another import), the toast count shows the real number.

---

### 5.3 Send or resend an invite (one patient, or several)

| | |
|---|---|
| Where | `js/provider.js` `sendInvite`, `setEnroll`, `bulkInviteDialog`, `inviteEmailDialog`; buttons: roster row ("Send invite" when state is `none`, "Resend" when `invited`; patients who are `active` have no button), patient page `#invBtn` ("Send invite" / "Resend invite", only for non-active patients), the add-patient success card "Send invite now", and the roster header button "Send invites" (`#bulk`). |
| Today | `setEnroll(p, 'invited', 'Nov 4')` sets the state and the date text in memory and in `localStorage hk.enroll`; a dialog shows a **preview** of the e-mail. No e-mail exists. |
| Single: dialog | Title `Invite sent` (first time) or `Invite sent again` (when the state was already `invited`); notice "`<name>` will get this email at `<email>`."; preview with To, Subject and body (below); the line `This is a preview. In the full app the email is sent automatically.`; buttons "Open it as the patient" (link to the invite page) and "Done". |
| Bulk: dialog | Title "Send invites". It lists **only patients whose state is `none`**, sorted by name, each with a checkbox, plus "Select all `<n>`". The button reads `Send invites` (disabled until one is ticked) then `Send <n> invite` / `Send <n> invites`. If nobody is left: "Everyone on your list has been invited." After sending: the dialog closes, toast `<n> invite sent` / `<n> invites sent`, and the roster counters update. The bulk path never resends and never shows an e-mail preview. |
| Roster text | After an invite the row shows state "Invite sent", reason `Invite sent <Mon D>` (for example `Invite sent Nov 4`); before it, status "Not invited" / reason "Added, not invited yet". |

**E-mail the server sends** (text copied from the preview; `<provider>` = the provider's display name, `<first>` = the text before the first space of the patient's name):

* **To:** the patient's e-mail. **Subject:** `<provider> invited you to Lifestyle Tracker`.
* **Body:** "Hi `<first>`," / "`<provider>` set up a space for you to track small daily habits between visits. A check-in takes about a minute, and you choose how much to answer." / a button **"Set up my account"** that opens the invite link / "This link works once and expires in 7 days. Your answers stay on a private server and are never shared with other companies."
* **The link:** `https://<your host>/invite.html#/invite/<token>`. The part after `#` is never sent to a server by the browser; the page reads `<token>` itself and calls `GET /api/hk/invite/<token>` (section 5.4). `<token>` is a long random secret (at least 32 random bytes, URL-safe); store **only its hash** (`invite.token_hash`). Send plain text **and** HTML parts; no tracking pixels and no click-tracking redirects (the screens promise nothing is shared with other companies).

**Requests**

* `POST /api/patients/{id}/invite` (single, no body). `200 { "patient": { "id", "state": "invited", "invitedOn": "Nov 4" }, "resent": false }`. `resent` is `true` when the state was already `invited`. `409 { "error": "This patient has already set up an account." }` **(suggested)** when the state is `active` (the screens never offer the button then).
* `POST /api/patients/invites` (bulk) with `{ "patientIds": ["pat-1", "pat-2"] }` → `200 { "sent": 2, "patients": [ { "id", "state", "invitedOn" } ] }`. Ignore ids that are not `none` for this provider (do not fail the whole request); `sent` is the number actually invited. Limit 200 ids.

**Server rules:** in one transaction create an `invite` row (new token, `expires_at` = now + 7 days, `accepted_at` null), **invalidate older unaccepted invites for the patient** (a resend replaces the earlier link; the e-mail text says the link "works once"), set `patient.state = 'invited'` (never change an `active` patient) and `patient.invited_at = now`; **send the e-mail after the commit**; if the mail provider fails, keep the invite row and answer `502 { "error": "The email could not be sent. Try again." }` **(suggested)** so the provider can press the button again. `invitedOn` in responses is `invited_at` in the provider's time zone formatted `Mon D` with the **English** 3-letter month (`Jan`..`Dec`) and no leading zero on the day.

**Seam** (`js/provider.js`): `sendInvite(p, done)` becomes

```js
function sendInvite(p, done) {
  var re = p.state === 'invited';
  HK.api('POST', '/api/patients/' + encodeURIComponent(p.id) + '/invite')
    .then(function (d) { p.state = 'invited'; p.invitedOn = d.patient.invitedOn; applyState(p); done && done(); inviteEmailDialog(p, d.resent); })
    .catch(function () { toast('The invite could not be sent. Try again.'); });                // (suggested text)
}
```

and in `bulkInviteDialog`, the `#sendsel` click handler sends `{ patientIds: ids }`, then for each id in the response runs `p.state = 'invited'; p.invitedOn = ...; applyState(p)` before `close(); done && done(); toast(...)`. Remove `setEnroll`'s `store.set('enroll', ...)` (section 8). **Two wording items to change together with the real e-mail:** the dialog line `This is a preview. In the full app the email is sent automatically.` and the link target `#/invite/<patientId>` inside `inviteEmailDialog` (it must show the real token only if you want the provider to see it; recommended: remove the "Open it as the patient" button and the preview link, because a provider must not receive the patient's one-time link). See section 12.

---

### 5.4 Open the invite page

| | |
|---|---|
| Where | `js/login.js`, route `/invite/<id>`, page `invite.html`. |
| Today | The page finds the patient with `PAT[id]` in the roster that is loaded in the browser. **Production rule:** the id in the URL is the **invite token**, and the server sends a roster with **exactly one record whose `id` equals the token** (everything else in the record as in section 3.2 of the DATABASE document). No screen change is needed. |
| What the page shows | **Pending invite** (state is not `active`): "Welcome, `<first>`." / "`<provider>` invited you to track small steps between visits." / "Set up your account" form with the e-mail shown read-only. **Used invite** (the patient's state is `active` **and** `accounts()` contains the patient's e-mail): "You are all set" / "This invite was already used." and a "Go to sign in" button. **Unknown id** (not in the loaded roster): the browser silently goes to the sign-in page (`#/login`). The special id `none` shows "No invite yet" (a prototype helper; never send it). |

**Request:** `GET /api/hk/invite/<token>` → `200 { "config": { "providerName": "Dr. Provider" }, "data": { "patients": [ { "id": "<token>", "name": "...", "email": "...", "state": "invited", "invitedOn": "Nov 4", "lengthChosen": "standard", "lengthNow": "standard", "unlocked": [...], "series": [ { "d": "2026-11-04", "score": null } ] } ] } }`

| Token situation | What to return |
|---|---|
| valid, not accepted, not expired | the one-record roster above (state `invited`) |
| already accepted | the one-record roster with `"state": "active"` **and** `"accounts": { "<patient e-mail>": { "used": true } }` inside `data` (this is the only way the page can know; the object is only read for truthiness and holds no password) |
| expired, unknown or revoked | `"data": { "patients": [] }` (the page then goes to sign-in) or `410`; **there is no "link expired" screen** (section 9 lists the gap) |

Do not include any other patient, the provider's roster, scores or notes in this response. Throttle by IP (30 per minute) and answer unknown tokens in the same time as valid ones.

---

### 5.5 Create the account from the invite

| | |
|---|---|
| Where | `js/login.js`, route `/invite/<id>`, form `#setup`. |
| Today | The browser checks the password, waits 700 ms, writes `{ pw, role: 'patient', id, name }` into `localStorage hk.extraAccounts` **in plain text**, sets the state to `active` and signs the patient in. |
| Screen checks | Rules list (live): "8 or more characters", "1 capital letter", "1 symbol, like ! or #" (a symbol = any character that is not a letter, digit or whitespace). On submit: password not meeting all rules: `Password does not meet all the requirements below.`; confirmation empty: `Confirm the password.`; different: `Passwords do not match.`; any error: the line above the button `Fix the highlighted fields and try again.`. While it works the button reads `Creating account...`. A live "Passwords match." hint appears under the confirmation. |
| After success | Toast `Account created. Welcome!` and the browser goes to `patient-today.html` (`#/patient?p=<id>`). |

**Request:** `POST /api/invite/<token>/accept`

```json
{ "password": "Sunny-day-42!" }
```

(The screen shows the e-mail read-only; the server takes the e-mail from the invite, never from the body. The confirmation is checked in the browser only; the server may also accept `"password2"` and compare.)

**Response `200`:** sets the session cookie and returns `{ "role": "patient", "patientId": "<real patient id>" }`.

**Errors:** `400 { "fields": { "password": "Password does not meet all the requirements below." } }` (same rules as section 3.3, enforced again), `410 { "error": "This invite link has expired or was already used." }` **(suggested)** for an expired, used or unknown token, `429` throttled.

**Server rules (one transaction):** verify the token hash, `accepted_at is null`, `expires_at > now`; create `app_user` (`role = 'patient'`, `email` = the patient's e-mail, salted password hash, `time_zone`: see the note below); set `patient.user_id`, `patient.state = 'active'`; set `invite.accepted_at = now`; set `patient.joined_on` to today in the user's time zone (the first entry of the patient's `series`); invalidate every other open invite of the patient. A second submit with the same token must fail with `410`.

**Time zone:** the prototype has no screen for it and the browser's own clock decides what "today" is. Recommended: read it in the browser and send it as an extra field, `Intl.DateTimeFormat().resolvedOptions().timeZone` (for example `America/Chicago`); the server stores it in `app_user.time_zone` (default `America/Chicago`). This is an addition to the request body only; no screen changes.

**Seam** (`#setup` submit handler): replace the whole `setTimeout(..., 700)` body with

```js
HK.api('POST', '/api/invite/' + encodeURIComponent(id) + '/accept', { password: $('#ipw', root).value, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
  .then(function (d) { session.role = 'patient'; session.id = d.patientId; toast('Account created. Welcome!'); go(keepClean('/patient?p=' + d.patientId)); })
  .catch(function (e) { btn.disabled = false; btn.textContent = 'Create my account';
    var m = (e.body && e.body.fields && e.body.fields.password) || (e.body && e.body.error) || 'Something went wrong. Try again.';
    fe.classList.add('show'); $('span', fe).textContent = m; });
```

(`id` is the route's token; `btn` and `fe` are the variables already defined in that handler.) After sign-in the patient's own page loads a roster with **their one real record** (the id in `?p=` is then the real patient id, and `phonePid()` finds it).

---

### 5.6 Favorite a patient

| | |
|---|---|
| Where | Two places, same data. Roster star button `[data-star]` (`js/provider.js`) and the patient page button `#favBtn` (`js/patient-page.js`). |
| Today | Flips `p.fav` in memory (`sessionStorage hk.state` keeps it while hopping between pages). Roster toast: `<name> added to favorites` / `<name> removed from favorites`. Patient page toast: `Added to favorites` / `Removed from favorites`. The patient page button text switches between "Add to favorites" and "Favorite". |

**Request:** `PUT /api/patients/{id}/favorite` with `{ "favorite": true }` → `200 { "favorite": true }`. Idempotent (setting the same value twice is fine). The favorite flag is the provider's private view: never returned to the patient.

**Seam:** in both click handlers keep the existing code (it already updates the screen immediately) and add the call; on failure undo and tell the user:

```js
HK.api('PUT', '/api/patients/' + encodeURIComponent(p.id) + '/favorite', { favorite: p.fav })
  .catch(function () { p.fav = !p.fav; view(); toast('Could not save. Try again.'); });   // roster: view() redraws; patient page: also reset #favBtn (suggested text)
```

---

### 5.7 Save the note "Notes for the next visit"

| | |
|---|---|
| Where | `js/patient-page.js`, textarea `#pnote`, button `#noteSave` ("Save note"), page `provider-patient.html`. |
| Today | The button only shows the toast `Note saved (prototype only)`. The text in the box is **never read**, never stored. The box starts with the saved note (`HK.data.notes[<id>]`, empty if none), HTML-escaped. No length limit, no auto-save, no warning when leaving with unsaved text. |

**Request:** `PUT /api/patients/{id}/note` with `{ "body": "text" }` → `200 { "updatedAt": "2026-11-04T18:30:00Z" }`. The note is **one text per patient** (last save wins, no history); an empty string clears it. Suggested limit 10,000 characters (`400` beyond it); store as plain text (the screen escapes it when drawing). Private to the provider: never included in any patient payload; never written to logs.

**Seam:** `on(root, 'click', '#noteSave', ...)` becomes

```js
HK.api('PUT', '/api/patients/' + encodeURIComponent(p.id) + '/note', { body: $('#pnote', root).value })
  .then(function () { HK.data.notes[p.id] = $('#pnote', root).value; toast('Note saved'); })      // the text 'Note saved (prototype only)' must change (section 12)
  .catch(function () { toast('Could not save the note. Try again.'); });                       // (suggested)
```

---

### 5.8 Card settings (one endpoint for the whole page)

| | |
|---|---|
| Where | `js/cards.js`, page `provider-cards.html` (`#/provider/patient/<id>/cards`), helpers `cfg(pid)` (read) and `saveCfg(pid, C)` (write), `commit()` inside `mount`. |
| Today | **Every** change on this page (unlock/lock a card, per-card options, check-in length, the two automatic-length switches, reminder times, quick-log buttons, adding or deleting a custom question) updates the in-memory object `C` and calls `saveCfg(id, C)`, which writes the **whole** object to `localStorage hk.cfg.<patientId>` and copies two values into the patient record in memory: `p.unlocked = C.unlocked` and `p.lengthChosen = C.length`. The page flashes a "Saved" label for 1.8 seconds after most changes. |
| The object | See section 4.3 for the full JSON (this is the `cardConfig` seam S1): `unlocked[]`, `length`, `autoShorten`, `offerLonger`, `remindAm`, `remindPm`, `skipIfDone`, `quick{drink,food,urge,smoke,intimacy,drip}`, `steps`, `photoLog`, `foodIdeas`, `mindLen`, `cbti`, `windDown`, `socialIdeas`, `subGoal`, `subLimit`, `craving`, `subNote`, `custom[]`. |

**Request:** `PUT /api/patients/{id}/card-config` with the whole object (the screen always has the whole object, so a full replace is the simplest correct contract; the server reconciles it into tables):

| Key | Column / table | Allowed values (what the controls can produce) |
|---|---|---|
| `unlocked` | `patient_card` rows (insert missing, delete removed; **keep the array order** as `position`) | any subset of `activity, diet, mind, sleep, social, substance`; it may be empty (the screen lets a provider lock every card) |
| `length` | `patient.length_chosen` | `quick`, `standard`, `extended` |
| `autoShorten`, `offerLonger`, `skipIfDone`, `photoLog`, `foodIdeas`, `cbti`, `socialIdeas`, `craving`, `subNote` | `patient_card_config` booleans | true / false |
| `remindAm`, `remindPm`, `windDown` | `remind_am`, `remind_pm`, `wind_down` (`HH:MM` text) | `HH:MM` 24 hour. **A cleared time box sends `""`** (the `change` event fires with an empty value): answer `400` with the field name and let the seam restore the previous value |
| `quick` | `quick_buttons` json | object with the 6 keys, true / false |
| `steps` | `steps` | exactly one of `2,000`, `4,000`, `6,000`, `8,000` (strings with the comma) |
| `mindLen` | `mind_len` | one of `1 minute`, `3 minutes`, `5 minutes`, `10 minutes` |
| `subGoal` | `sub_goal` | one of `Abstain today`, `Stay within my limit`, `Cut back from yesterday` |
| `subLimit` | `sub_limit` | free text (a text box; sent on **every keystroke** today). No limit in the screen; suggested maximum 200 characters |
| `custom` | `custom_question` rows | section 5.9 |

**Response `200`:** `{ "config": <the stored object, same shape>, "savedAt": "..." }`. Always return the canonical stored object (including server-assigned ids in `custom`).

**Server rules**

1. Validate every value against the table; reject unknown keys with `400`.
2. In one transaction: replace `patient_card` rows, update `patient.length_chosen`, upsert `patient_card_config`, reconcile `custom_question` (section 5.9).
3. **Length quirk (decision needed).** The prototype updates `lengthChosen` but **not** `lengthNow` when a provider changes the default length, so after the change the patient screens say "shortened automatically" although nothing was shortened (section 12). Recommended server rule: if `length_now` was equal to the **old** `length_chosen` (no automatic shortening in effect), set `length_now` to the new value as well; if shortening is in effect, keep `length_now`. This removes the symptom without any screen change.
4. Unlocking a card gives the patient that card's questions in the next check-in (the check-in builds its questions from `unlocked` at the time the check-in page opens). Locking a card removes it from the **future**; past answers and scores for that card stay (never delete history).
5. Only the patient's own provider may write; a patient session gets `403`.
6. Audit: store who changed what and when (the next version will want it; no screen reads it today).

**Seam** (`js/cards.js`). Three small edits, because `commit` and `list` live inside the page's `mount` function and `saveCfg` is at the top level:

```js
var cfgSeq = 0;
function saveCfg(pid, c) {                 // top level: no localStorage; returns a promise
  var p = PAT[pid]; if (p) { p.unlocked = [...c.unlocked]; p.lengthChosen = c.length; }
  (HK.data.cardConfig = HK.data.cardConfig || {})[pid] = c;      // keep the object in memory: cfg() re-reads it (section 4.3)
  var mine = ++cfgSeq;                     // newest request wins; older answers are ignored
  return HK.api('PUT', '/api/patients/' + encodeURIComponent(pid) + '/card-config', c)
    .then(function (d) { return { stale: mine !== cfgSeq, config: d.config }; });
}
/* inside mount(): the existing  const commit = () => { saveCfg(id, C); saved(); };  becomes */
const commit = () => saveCfg(id, C)
  .then(r => { if (r.stale) return; C.custom = r.config.custom; list(); saved(); })
  .catch(() => toast('Could not save the settings. Try again.'));        // (suggested text)
/* inside mount(): the keystroke handler for the text box (data-optsel on an INPUT) calls saveCfg directly on every key; make it debounced */
let optT; on(root, 'input', '[data-optsel]', (e, s) => { if (s.tagName === 'INPUT' && s.type !== 'time') { C[s.dataset.optsel] = s.value; clearTimeout(optT); optT = setTimeout(commit, 400); } });
```

`list()` is the page's own function that redraws "Your added questions", so the delete buttons carry the stored ids. The "Saved" flash is now shown after the server answers. Because `C` is replaced field by field (only `C.custom` is swapped), no other control needs to change.

**Toasts the page shows itself (no change):** `<Card name> unlocked for <first>` / `<Card name> locked for <first>`; `Check-in length set to Quick|Standard|Extended`; `Sensitive button on. Check with the care plan first.` (when "Sexual activity" or "Self-harm urge" is turned on). Turning the Substance card on also opens its options automatically.

**Preview.** "Preview as patient" opens `patient-checkin.html` for this patient inside the provider's session (section 3.5).

---

### 5.9 Custom questions (part of card settings)

| | |
|---|---|
| Where | `js/cards.js`, card "Add your own question" (`#qdom`, `#qwhen`, `#qtext`, `#qtype`, `#qch`, `#qadd`) and card "Your added questions" (`#cqlist`, delete buttons `[data-del]`). |
| Controls | **Card**: all six cards are listed, **including locked ones and Substance**. **Ask it**: Morning (`am`), Evening (`pm`, the default), Weekly (`wk`). **Question**: free text. **Answer type**: Short answer (`text`, default), Yes or no (`yesno`), 0 to 10 (`scale`), Choices (`choice`). **Choices**: one text box, options separated by commas. A live preview shows what the patient will see. |
| Validation | Empty question after trim: the field gets its error style and the focus; the message under the box says `Write the question first.`; nothing is added. No maximum length, no maximum count, no duplicate check. Choices are split on commas, trimmed, empty parts dropped; **if none are typed, the options become `["Yes", "Somewhat", "No"]`**; for the other types `options` is absent. |
| After "Add question" | The question is added to the list in memory (client id `c<milliseconds since 1970>`), the box and choices are cleared, the page saves (section 5.8) and the toast says `Question added to <first>’s check-in`. |
| Delete | The trash button removes it **at once, without a confirmation**, saves, toast `Question removed`. |
| Where answers are used | **Check-in**: at Quick length no custom question is asked; at Standard length **only the first** custom question of that period (`am` or `pm`, in list order) is asked; at Extended length **all** of that period's. `wk` questions are **never asked in the check-in** (the check-in builds only `am` and `pm`), and the weekly summary does not show them; they appear only in the provider's weekly report, which lists the **first three custom questions of the list, of any period** ("Your added questions"), each with a one-line result from `HK.data.customResults` (you calculate it, DATABASE document 4.3) or "No answers yet" when that text is empty. A custom question's answer is saved like any other answer, under its question id (section 5.10). |

**Mapping to `custom_question`:** `dom` → `card_id`, `when` → `period`, `type` → `qtype`, `text` → `body`, `options` → `options`, list order → `position`. In the payload of section 5.8 each item is `{ "id": "...", "dom": "mind", "when": "pm", "type": "choice", "text": "...", "options": ["Yes","Somewhat","No"] }`.

**Reconcile rule:** an item whose `id` is not known for this patient is **inserted** (the server may keep the client's `c<digits>` id if it is unique for that patient, or issue its own and return it in `config.custom`; the seam in 5.8 replaces the client list with the returned one). A known id is updated. A known id **missing** from the list is **archived** (`archived_at = now`), not deleted, because earlier answers point at it; archived questions are no longer asked and no longer returned. Reject `choice` without at least one option (`400`).

**Seam:** none beyond 5.8 (its `commit` already adopts the returned ids and redraws the list).

---

### 5.10 Complete a check-in (the most important write)

| | |
|---|---|
| Where | `js/checkin.js`, page `patient-checkin.html` (`#/patient/checkin`, optional `?when=am` or `?when=pm`), function `finish()` (also reached from the "Finish" link, from "I’m done for now" / "Not now", and automatically after the last question). |
| Today | Nothing is saved. `finish()` computes a **placeholder** score change in the browser (DATABASE document 8.2), keeps it in page memory (`S.score`) and draws the "Check-in saved" screen. A page reload forgets the check-in. |

**What the patient goes through (exact rules the server must be able to accept):**

1. **Setup screen.** Morning / Evening switch (default Evening, or Morning when the address has `?when=am`; switching it clears the "goal met" memory). "How much time do you have?": Quick (1 min), Standard (3), Extended (5); preselected: the patient's current length (`lengthNow` when `autoShorten` is on and `lengthNow ≠ lengthChosen`, otherwise the provider's `length`). If shortened, a collapsible notice explains it.
2. **Questions are built when "Start check-in" is pressed** from the settings that are in memory then (cards unlocked, custom questions, length):
   * **Quick**: only the main goal question (`g-am-1` morning / `g-pm-1` evening). After it (answered **or** skipped) a "keep going" screen asks whether to continue. Its first button continues (`Keep going`, `Keep going, 2 more minutes`, or, after an evening "no", `Yes, let’s look at it`): the length becomes **Standard** and the Standard questions plus the adaptive ones that were held back are added. Its second button ends the check-in and saves what is answered (`I’m done for now`, or `Not now` after an evening "no").
   * **Standard**: main question; then one follow-up (`g-am-5` confidence in the morning, `g-pm-5` "one thing I can do tomorrow" in the evening); then the **first question of that period** for each of the **first three unlocked cards** (cards in the fixed order activity, diet, mind, sleep, social, substance); then the **first custom question** of that period if any; in the **morning only**, the sleep card's extra "team-suggested" morning questions are added when the Sleep card is unlocked.
   * **Extended**: main question; all follow-ups of that period (morning `g-am-2..5`; evening `g-pm-3..5`); the **first two questions** of that period for **every** unlocked card; **all** custom questions of that period; plus the sleep extras in the morning.
3. **Adaptive questions** are inserted while answering (the ids are fixed):
   * Morning `g-am-5` (scale 0 to 10) answered **4 or lower** (an unanswered/skipped scale counts as 5) → inserts the special question `shrink` ("That sounds like a big goal for today. Want to make it smaller?", choices `Do half of it`, `Do a 5-minute version`, `Pick a different goal`, `Keep it as it is`); the screen then toasts `A smaller goal still counts.` after any choice.
   * Evening main question `g-pm-1` is a text box **plus** the yes/no question `g-pm-2` ("Did I meet my goal today?") on the same screen. Answer **yes** → inserts `g-pm-3` ("What helped me follow through, and what got in the way?") and `g-pm-4` (mood: `Low`, `Okay`, `Good`, `Great`). Answer **no** → inserts the special question `barrier` (multi-select of the 7 barrier labels, section 6 of the DATABASE document) and `g-pm-6` ("If a friend were in the same situation..."), and **removes** a later `g-pm-4` from the list.
   * `barrier` answered with **`Low energy`** among the choices → inserts the special question `repeat` ("Want to try a different plan for tomorrow?": `Try a 5-minute version`, `Move it to a better time of day`, `Ask my provider for ideas`).
   * Inserted questions that are already in the list are not inserted twice. In a Quick check-in, the inserted questions are **held** until the patient taps "Keep going".
4. **Per question:** "Next" (disabled until answered; scale and time questions count as answered at once), "Skip this one" (no answer stored), "Previous" arrow (goes back; answers kept), "Finish" link (ends now with what is answered). Pressing "Next" on an **untouched** slider stores the slider's starting value **5** (a skipped one stores nothing), so the server cannot tell a real 5 from an untouched slider.
5. **What counts as answered when it ends:** every planned question (not the "keep going" screen) whose stored answer is not empty (`null`, `''` and `[]` are skipped). The main evening question may have **no text but a yes/no** (the screen lets "Next" through when only yes/no is chosen): send the yes/no anyway.
6. **Finish screen** shows: "Check-in saved", a sentence by goal result (no: `Thanks for being honest. A hard day still counts, and tomorrow is a fresh start.`; yes: `Nice work today. That follow-through adds up.`; at least one answer: `Thanks for checking in. Every answer helps you and your provider see the full picture.`; no answers: `You checked in, and that counts. Come back whenever you like.`), Pip's mood, **Today's rating** with the change `+N from your check-in` (or `−N`), the first 5 answers under "What you shared" (arrays joined with `, `; scale shown as `N out of 10`), the line "Shared with your provider, `<provider>`.", and the buttons "See your week" and "Back to today".

**Request:** `POST /api/patient/checkins`

```json
{
  "period": "pm",
  "lengthUsed": "extended",
  "startedAt": "2026-11-04T01:12:03Z",
  "idempotencyKey": "0c2a9a7e-6f1e-4f43-9b3a-2b8f5f0b8c11",
  "planned": ["g-pm-1", "g-pm-3", "g-pm-4", "g-pm-5", "act-pm-1", "act-pm-2", "mind-pm-1", "mind-pm-2"],
  "answers": [
    { "questionId": "g-pm-1",   "value": "Walked around the block after lunch." },
    { "questionId": "g-pm-2",   "value": "yes" },
    { "questionId": "g-pm-3",   "value": "Having a set time helped." },
    { "questionId": "g-pm-4",   "value": "Good" },
    { "questionId": "act-pm-1", "value": "20 minutes on the trail." },
    { "questionId": "act-pm-2", "value": "Great" },
    { "questionId": "mind-pm-2", "value": "no" }
  ]
}
```

Other value shapes: a morning scale answer `{ "questionId": "g-am-5", "value": 4 }`; the barrier multi-select `{ "questionId": "barrier", "value": ["Low energy", "Forgot"] }`; a time answer `{ "questionId": "sleep-am-5", "value": "06:45" }` (the four `time` questions are `sleep-am-1`, `sleep-am-2`, `sleep-am-4`, `sleep-am-5`; a time question is always "answered", and its start value is its `default` in `docs/seed/questions.json`).

* `answers` is **in the order asked** (the array position becomes `checkin_answer.position`). `value` has the natural JSON type: **text, choice, yes/no, mood, time as strings** (`"yes"` / `"no"` lower-case; mood one of `Low`, `Okay`, `Good`, `Great`; time `"HH:MM"`); **scale as an integer 0 to 10**; the barrier multi-select **as an array of strings**.
* `questionId` is one of: a seed id from `docs/seed/questions.json`; a custom question id of this patient (section 5.9); or the special ids `shrink`, `barrier`, `repeat` (their wording and choices are in the DATABASE document, section 6).
* `planned` = every question id in the final list (so the server can count unanswered questions for the shortening rule, section 6.2); `goalMet` is not sent separately: the server reads it from the answer `g-pm-2`.
* `startedAt` is **new** (the prototype never records it; add one line at "Start check-in": `st.startedAt = new Date().toISOString()`). `idempotencyKey` is a random UUID created once per attempt so a double tap cannot save twice.

**Response `200`** (`201` for a new check-in, `200` when it replaced an earlier one):

```json
{ "checkinId": "chk-81c2", "replaced": false,
  "overall": 61, "previousOverall": 56,
  "cards": { "activity": 70, "mind": 58, "diet": 55 },
  "today": { "amDone": true, "amTime": "7:05 AM", "pmDone": true },
  "lastActiveAt": "2026-11-04T18:30:00-06:00" }
```

* `overall` / `cards`: the new scores **for today** (integers or one-decimal numbers; the screens round); `cards` has only the unlocked cards. How they are calculated is the central open decision (DATABASE document 8.1); the BACKEND implements the agreed rule and returns the result. `previousOverall` is the day's score before this check-in (or `null`).
* `today` replaces `HK.data.today[<patientId>]` (it feeds the Today screen's "All done for today" and "Morning check-in done at 7:05 AM").

**Server rules**

1. **Validate before saving anything** (all or nothing). `period` `am`/`pm`; `lengthUsed` one of three; every `questionId` known for this patient and not repeated; the value fits the question's type: `text` a non-empty string after trim (suggested maximum 4,000 characters; the screen has none), `choice` one of the question's options (or the literal `Something else` when the question allows "other"; no free text is collected), `yesno` `yes`/`no`, `scale` an integer 0 to 10, `time` `HH:MM`, `mood` one of four, barrier values only from the 7 labels. Trim text. Unknown or wrong-typed input: `400` with a plain message; **do not silently drop** wrong data.
2. **One check-in per patient, day and period** (`unique (patient_id, day, period)`, DATABASE document 4.2). A second completed check-in for the same day and period **replaces** the first (its answers are deleted and rewritten, scores are recalculated, `replaced: true`). The Today screen hides the evening button after the evening is done, but the "Check-in" tab stays open, so a repeat can happen. Also de-duplicate by `idempotencyKey` (return the first response again).
3. **Day = the patient's local calendar day** at completion, from `app_user.time_zone` (DATABASE document 4.4), using the **server's clock** for `completed_at`. `started_at`: use the client value only if it is not in the future and not more than 6 hours before `completed_at`, otherwise use `completed_at` (suggested).
4. **Write**, in one transaction: `checkin`, `checkin_answer` rows (skipped questions get **no** row), `daily_score`, `card_score` rows for the day, `day_event` rows for the 1D chart (at least one: `Morning check-in` tag `am` / `Evening check-in` tag `pm` at the completion hour as a decimal such as 8.1; further events such as `Movement logged` with a card tag are optional and data-driven; keep hours between 6.0 and 22.0), `patient.last_active_at = completed_at`. Answers for a card that is **locked** by now are stored but do not count toward the scores. A check-in with **zero answers** is accepted (the screen tells the patient "that counts"); whether it creates a day score is part of the scoring decision.
5. After saving: update the adaptive-length counters (section 6.2), cancel today's reminder for that period when `skip_if_done` is on (section 6.3), recalculate the derived weekly values (DATABASE document 4.3: `week.barriers`, `week.conf`, `week.pconf`, `week.checkins`, `answers`, `customResults`).
6. A **provider session must get `403`** here (the preview, section 3.5). Never log answer text.

**Seam** (`js/checkin.js`). `finish()` becomes `async` and the placeholder lines are replaced by the server's result. It is called as a plain function from several places (`show()` when the list ends, the "Finish" link, "I’m done for now"), and an `async` function works in all of them.

```js
/* 1. at "Start check-in" (inside the #start handler): */  st.startedAt = new Date().toISOString(); st.key = crypto.randomUUID();
/* 2. in finish(): keep the first lines (st.stage = 'done'; q; got; n; the message text) but replace the placeholder score lines */
async function finish() {
  st.stage = 'done';
  /* ... q, got, n exactly as today ... */
  var answers = [];
  st.queue.forEach(function (c) {
    if (c.special === 'keepgoing') return;
    var a = st.ans[c.key]; if (a != null && a !== '' && !(Array.isArray(a) && !a.length)) answers.push({ questionId: c.key, value: a });
    if (c.q.plus && st.ans[c.q.plus.id]) answers.push({ questionId: c.q.plus.id, value: st.ans[c.q.plus.id] });
  });
  var before = todayScore(pid), r;
  try {
    r = await HK.api('POST', '/api/patient/checkins', { period: st.when, lengthUsed: st.length, startedAt: st.startedAt, idempotencyKey: st.key,
      planned: st.queue.filter(function (c) { return c.special !== 'keepgoing'; }).map(function (c) { return c.key; }), answers: answers });
  } catch (e) {                                           // nothing was saved: go back to the question the patient was on
    st.stage = 'q'; if (st.idx >= st.queue.length) st.idx = st.queue.length - 1; show(); toast('Your check-in could not be saved. Try again.');   // (suggested text)
    return;
  }
  S.score = r.overall; S.done[st.when] = true;
  (HK.data.domainScores[pid] = HK.data.domainScores[pid] || {})[iso(TODAY)] = r.cards;
  HK.data.today[pid] = r.today;
  /* ... from  const dom = todayDomains(pid), mood = ...  down to the end: unchanged (it uses `before` and S.score for the "+N" text) ... */
}
```

(The unchanged part keeps the `bump` constant unused: delete the `bump` line.) The `answers` loop is the same selection rule as the `got` filter plus the evening yes/no.

---

### 5.11 Quick log (drink, snack, craving, ...)

| | |
|---|---|
| Where | `js/patient-app.js`, Today screen, section "Quick log", buttons `[data-ql]`, bottom sheet with `#qwhen` chips, `#qnote`, button `[data-savelog]`. |
| Which buttons | Only those the provider turned on in card settings (`C.quick`): defaults on = **Drink**, **Unplanned snack** (button text "Snack"); defaults off = **Craving**, **Cigarette** ("Smoke"), **Sexual activity** ("Intimacy", provider only), **Self-harm urge** ("Urge", provider only). The ids: `drink`, `food`, `urge`, `smoke`, `intimacy`, `drip`. |
| Sheet | Title `Log: <label>`; text "This only takes a second. It helps you and your provider spot patterns, and nobody is grading you."; "When was it?": `Just now` (default), `Earlier today`, `Last night`; optional text box "Anything you want to add? (optional)" (no length limit); for `drip` a notice with the 988 phone number; buttons "Save" and "Cancel". |
| Today | "Save" adds 1 to an in-memory counter `S.logs[kind]` (so the button reads `Drink x2`), toasts `Logged. Thank you for noting it.`, closes the sheet and redraws after 300 ms. **The chip and the note are not read.** The counts are lost on reload. |

**Request:** `POST /api/patient/quick-logs`

```json
{ "kind": "drink", "when": "Earlier today", "note": "After dinner with friends" }
```

`kind`: one of the six ids **and enabled for this patient** in `patient_card_config.quick_buttons` (else `403 { "error": "..." }`; the screens only show enabled buttons). `when`: exactly `Just now`, `Earlier today` or `Last night` (stored as given: `quick_log.when_chip`). `note`: optional text, trimmed, `null` when empty (suggested maximum 500 characters). Response `201 { "id": 123, "todayCount": 2 }` where `todayCount` = this patient's rows of that `kind` for today (patient's local day). Whether "Last night" should count toward yesterday is a product decision (the screen shows nothing about it); `quick_log.day` is the local day of the request.

**Seam** (the `[data-savelog]` handler in `js/patient-app.js`): replace the counter line with

```js
on(el, 'click', '[data-savelog]', function () {
  var chip = $('#qwhen .chip[aria-pressed="true"]', el), note = $('#qnote', el).value.trim();
  HK.api('POST', '/api/patient/quick-logs', { kind: q.id, when: chip ? chip.dataset.t : 'Just now', note: note || null })
    .then(function (d) { S.logs[q.id] = d.todayCount; toast('Logged. Thank you for noting it.'); setTimeout(redraw, 300); })
    .catch(function () { toast('Could not save. Try again.'); });                         // (suggested)
});
```

(the sheet closes at once because the button also has `data-sheetclose`; a failed save only shows the toast.) **Counts after a reload:** `PS()` starts with `logs: {}`. To show today's counts, send `quickCounts` inside `HK.data.today[<id>]` (for example `{ "drink": 2 }`; extra keys pass through `HK.provider.todayStatus`) and change the one word in `PS()`: `logs: {}` → `logs: Object.assign({}, HK.provider.todayStatus(pid).quickCounts)`. No provider screen shows quick logs today; no read endpoint is needed yet. Rows of kinds `intimacy` and `drip` get the strictest access (DATABASE document 9).

---

### 5.12 Shorter / longer check-in (offer and switch back)

| | |
|---|---|
| Where | `js/patient-app.js`, Today screen. Elements: the offer notice with buttons `[data-offer="yes"]` ("Yes, try it") and `[data-offer="no"]` ("Not yet"); the line "You chose `<Length>`. We shortened it for now because busy days made it hard. Switch back any time."; two **demo** chips in the side notes panel `[data-adapt]` ("Skipping a lot", "A week of check-ins"). |
| Shown when | The offer notice appears only when the page memory flag `S.offer` is true **and** `lengthNow ≠ lengthChosen`; text "You checked in 7 days in a row. Want to try the `<chosen>` check-in again?". **Nothing in the code sets `S.offer` except the demo chip** (the real trigger does not exist: section 6.2). The "shortened" line appears whenever `lengthNow ≠ lengthChosen`. Both live on the "Evening check-in" card, so they disappear once the evening check-in is done. |
| Today | "Yes, try it": `lengthNow = lengthChosen`, toast `Switched back to <Length>`. "Not yet": hides the notice (memory only; it would reappear on the next load if the flag came from the server). The "Skipping a lot" chip sets `lengthNow = 'quick'`; "A week of check-ins" sets `lengthNow = 'quick'` if needed and shows the offer; both are **demo-only**. |

**Requests**

* `POST /api/patient/length/accept-offer` (no body) → `200 { "lengthNow": "standard", "lengthChosen": "standard" }`: server sets `length_now = length_chosen`, clears the pending offer.
* `POST /api/patient/length/decline-offer` (no body) → `204`: server records the dismissal so the same offer is not shown again immediately (re-offer delay: BACKEND decision, section 6.2).

**Showing the offer after a reload (seam).** Send `offerLonger: true` inside `HK.data.today[<id>]` when an offer is pending and change `PS()`: `offer: false` → `offer: !!HK.provider.todayStatus(pid).offerLonger`. The check-in screen needs nothing extra (it reads `lengthNow`, `lengthChosen` and the `autoShorten` setting from the roster record and card config).

**Seam for the buttons** (`[data-offer]` handler): `HK.api('POST', '/api/patient/length/' + (b.dataset.offer === 'yes' ? 'accept-offer' : 'decline-offer')).then(function () { /* existing code: set p.lengthNow when yes, toast, S.offer = false, redraw() */ })`.

**The two demo chips and the "Demo: Pip's mood" chips must not exist for real patients**: they change in-memory state only and show "Offer shown on Today" / "Shortened to Quick for now" (section 12). They are inside the side panel that is shown on screens wider than 900 px.

---

### 5.13 Private goals (add, log today, share / unshare, delete)

| | |
|---|---|
| Where | `js/private.js`; Today screen card "Private goals" (`[data-privadd]` "Add", `[data-privlog="<goalId>"]` "Log"), the weekly summary (read only), and the provider's patient page card "Goals `<first>` chose to share" (read only). |
| Today | The whole list is kept in `localStorage hk.priv.<patientId>` (first read falls back to `HK.data.privateGoals[<id>]`). |
| Add a goal | Sheet "New private goal": notice text (`Private goals are yours. Privacy does not cover anything that could seriously harm you or someone else. If that is happening, please reach out to someone you trust or your provider. In the US, call or text 988 any time.`), "What do you want to track?" (text, `maxlength=60`), "How do you want to track it?" `Yes or no` (default) / `Count` / `0 to 10 rating`; for **Count** two more boxes appear: "At most per day" (number, default 2, `min 0 max 99`) and "What are you counting?" (default `times`, `maxlength=16`). Empty title: the field shows `Give your goal a name.` and nothing is added. While typing, a notice with the 988 number appears if the title matches a fixed word pattern (given under the table); the goal is **still saved** (this is a browser-only notice; the server does nothing special). New goals start **not shared**, with an empty log. Toast `Private goal added. Only you can see it.` |
| Log / share / delete | Sheet with today's input (Yes/No buttons `1`/`0`; a stepper for counts, never below 0, no upper limit; a 0 to 10 slider for ratings), a switch "Share with `<provider>`" (off by default), and "Save" / "Cancel" / "Delete this goal". The switch toasts at once (`Shared with <provider>` / `Back to private`) **but only takes effect when "Save" is pressed**; "Cancel" discards both the value and the switch. "Save" stores today's value (only if the patient chose one: an untouched control stores nothing, so for a count the box shows 0 but a 0 is only saved after the + or − button is pressed) together with the switch and toasts `Saved. Only you can see this.` "Delete this goal" removes it **immediately without asking**, toast `Goal deleted`. |
| "Goal met" rules (screens) | count: value ≤ the limit; yes/no: value = 1; rating: value ≥ 6. The week text: count `<met> of <logged> logged days within your limit of <limit> <unit>`; yes/no `<met> of <logged> logged days done`; rating `Average <x.x> out of 10 this week`; none: `No days logged yet`. |
| What the provider sees | Only goals with `shared = true`: the title and the week text above. Never the unshared goals, never their logs (DATABASE document 9). |

The browser-only pattern for the notice (case-insensitive): `/(kill myself|suicid|hurt myself|self.?harm|end my life|cut myself|hurting myself)/i`.

**Requests**

| Action | Request | Response |
|---|---|---|
| Add | `POST /api/patient/private-goals` `{ "title": "Cut down on drinking", "type": "count", "unit": "drinks", "limit": 2 }` | `201 { "goal": { "id": "...", "title", "type", "unit", "limit", "shared": false, "log": {} } }` |
| Save (value + share) | `PUT /api/patient/private-goals/{id}` `{ "shared": true, "day": "2026-11-04", "value": 2 }` (`value` omitted or `null` when none was chosen) | `200 { "goal": { ... same shape, with the log for the last 14 days } }` |
| Delete | `DELETE /api/patient/private-goals/{id}` | `204` |

**Validation:** `title` 1 to 60 characters after trim (the limit exists only as an HTML attribute; enforce it); `type` one of `yesno`, `count`, `rating`; `unit` 0 to 16 characters, empty becomes `times`; `limit` the screen sends `Math.max(0, +value || 0)`, which can be **above 99 or have decimals** (the number box does not stop typing); the server should coerce: round to an integer and clamp to 0 to 99, then return the stored goal so the screen adopts it. `limit` is stored for every type (yes/no and rating goals carry the hidden default 2; it is ignored for them). `value`: yes/no `0` or `1`; count an integer 0 to 999; rating an integer 0 to 10. `day` must be the patient's **today** (accept yesterday and tomorrow as time-zone slack, reject others with `400`): the screens never write other days. Type, title and unit **cannot be edited** later (no screen). `DELETE` is a soft delete (`deleted_at`) so counts are not lost. A goal id of another patient: `404`.

**Seam** (`js/private.js`): 1) read and write memory instead of `localStorage`:

```js
function privGoals(pid) { return JSON.parse(JSON.stringify(HK.provider.seedPrivateGoals(pid) || [])); }   // delete the line  const saved = store.get('priv.' + pid, null); if (saved) return saved;
const privSave = (pid, g) => { HK.data.privateGoals[pid] = g; };                                           // was  store.set('priv.' + pid, g)
```

2) in `#padd`: replace the local object with the server's, i.e. `HK.api('POST', '/api/patient/private-goals', { title: title, type: st.type, unit: ..., limit: ... }).then(function (d) { goals.push(d.goal); privSave(pid, goals); close(); toast('Private goal added. Only you can see it.'); setTimeout(redraw, 300); })`; 3) in `#privsave`: `HK.api('PUT', '/api/patient/private-goals/' + encodeURIComponent(id), { shared: g.shared, day: todayKey(), value: val }).then(function (d) { Object.assign(g, d.goal); privSave(pid, goals); toast('Saved. Only you can see this.'); setTimeout(redraw, 300); })`; 4) in `#privdel`: `HK.api('DELETE', '/api/patient/private-goals/' + encodeURIComponent(id)).then(function () { privSave(pid, goals.filter(x => x.id !== id)); close(); toast('Goal deleted'); setTimeout(redraw, 300); })`. (The "Save" button also closes the sheet immediately because of `data-sheetclose`.)

**Provider reads:** the provider's patient page payload carries `HK.data.privateGoals[<patientId>]` with **only shared goals** (and their logs); the patient's own pages carry all their goals.

---

### 5.14 Weekly reflection

| | |
|---|---|
| Where | `js/week.js`, page `patient-week.html`, card "Weekly reflection": card chips `[data-wd]` (one per **unlocked** card, in `unlocked` order), the question `#wrq`, textarea `#wrt`, buttons "Another question" `#wrnext` and "Save" `#wrsave`. |
| Today | "Another question" shows the next weekly question of the chosen card (wraps around) and clears the box. "Save" with text: toast `Reflection saved`, then shows the next question with an empty box; without text: toast `Write something first, or tap Another question`. **Nothing is stored.** The textarea has no length limit. |
| Question ids | The weekly questions of a card are the `wk` list in `docs/seed/cards.json` / `questions.json`; ids are `<cardId>-wk-<n>` (for example `activity-wk-1`, `mind-wk-3`), `n` = 1-based position. |

**Request:** `POST /api/patient/reflections` `{ "questionId": "mind-wk-2", "body": "Evenings are easiest." }` → `201 { "id": 55 }`. `questionId` must be a weekly seed id (else `400`); `body` trimmed, 1 to 4,000 characters (suggested). No screen shows saved reflections to anyone, and the screens never promise the provider sees them: **store them for the patient only** and do not include them in any provider payload until that is decided.

**Seam** (`#wrsave` handler): when `has` is non-empty, send `{ questionId: W.doms[di].id + '-wk-' + ((qi % DOM[W.doms[di].id].wk.length) + 1), body: has }`, and on success run the existing lines (`toast('Reflection saved'); qi++; showQ();`); on failure toast `Could not save. Try again.` (suggested) and keep the text.

---

### 5.15 "Save for later" on a resource

| | |
|---|---|
| Where | `js/patient-app.js`, function `resourceSheet`, button "Save for later" (`data-save`), opened from Today ("Ideas for you") and from the check-in's Ideas sheet (Resources list). |
| Today | Toast `Saved to your ideas`; nothing is stored; **no screen lists saved ideas yet**. |

**Request:** `POST /api/patient/saved-ideas` `{ "cardId": "mind", "title": "1-minute breathing reset" }` → `204`. `cardId` a card id; `title` a resource title from `docs/seed/cards.json` (the primary key is `(patient_id, card_id, title)`, so saving twice is harmless). Seam: `(el) => on(el, 'click', '[data-save]', () => HK.api('POST', '/api/patient/saved-ideas', { cardId: d.id, title: r.title }).then(function () { toast('Saved to your ideas'); }).catch(function () { toast('Could not save. Try again.'); }))` (`d` and `r` are the function's parameters).

---

### 5.16 Buttons that only show a toast (nothing to save; decide what each becomes)

| Button / control | Screen | Toast today | Decision for the full app |
|---|---|---|---|
| "Save as PDF" (`#exp`) | provider weekly report | `PDF export is part of the full app` | Needs a PDF of the report page (server-rendered or browser print). The CSS has no print rules. Not specified beyond the button. |
| "Use this for next week" (`#useplan`) | patient weekly summary | `Added to next week’s plan` | There is no plan screen or table. Either build one or keep it as an acknowledgement. Nothing is stored. |
| "Add a photo (optional)" (`#photo`) | check-in, only on the diet evening question `diet-pm-1` | `Photo added (prototype)` | No upload exists. The setting "Allow an optional meal photo log" (`photoLog`) is stored but no screen reads it. A real upload means storage, size limits, and privacy decisions. |
| "Say hi" | Today | `Pip says hi` | Animation only. |
| "Skipping a lot" / "A week of check-ins" / Pip mood chips | Today, side notes panel (wider than 900 px) | `Shortened to Quick for now`, `Offer shown on Today` | Demo controls, remove for real users (section 12). |
| An idea chip inside the check-in's Ideas sheet | check-in | `Added to your answer` (text box) or the idea text itself as a toast (other question types) | Client only. |
| Theme, chart zoom, chart range, chart size, list size | provider screens | `Zoomed to ...`, `Showing ...`, `Chart size reset`, `List size reset`, a theme name | Device preferences kept in `localStorage` (`hk.theme`, `hk.chartSize`, `hk.chartRange`, `hk.listH2`, `hk.sort`); leave them in the browser. |

---

### 5.17 Sign out

| | |
|---|---|
| Provider | `js/provider.js`: `mountShell` binds the button `[data-signout]` ("Sign out"): `session.role = null; go('/login')`. |
| Patient | `js/week.js`, bottom of the weekly summary: a **link** `<a class="btn signout" href="#/login">`. It only navigates; it does **not** clear the session variable. The patient app has no other sign-out control. |
| Browser snapshot | On every page change the browser copies the session variables, today's check-in progress and per-patient values (favorite, lengths, unlocked cards) into `sessionStorage hk.state` (`js/hk-state.js`) and restores them on the next page. After signing out, that snapshot stays in the tab. |

**Request:** `POST /api/auth/logout` → `204` (destroys the session; idempotent). **Seams**

```js
/* js/provider.js */
function mountShell(root) { on(root, 'click', '[data-signout]', function () { HK.signOut(); }); }
/* js/week.js, inside mount(root) of the weekly summary (the link is a plain anchor today) */
on(root, 'click', 'a.signout', function (e) { e.preventDefault(); HK.signOut(); });
/* js/hk-data.js */
HK.signOut = function () {
  HK.api('POST', '/api/auth/logout').catch(function () {}).then(function () {
    try { sessionStorage.removeItem('hk.state'); sessionStorage.removeItem('hk.toast'); } catch (e) {}
    session.role = null; session.id = null; go('/login');
  });
};
```

Also: on any `401` from `HK.api` the helper already leaves for the sign-in page; add `sessionStorage.removeItem('hk.state')` there as well. Remember `hkSaveState` runs on `pagehide` and would write the snapshot again after sign-out; it writes `session` with `role: null`, but it also writes patient names' ids, flags and `PSTATE` (scores, counts). With real sessions, **do not keep `PSTATE` or the per-patient values in `sessionStorage`** (section 8); then there is nothing to leak.

---

## 6. Business rules the BACKEND owns

These are behaviors the screens **promise or assume** but whose logic is **not in the code** (the prototype only shows them). Each item says what the screens show, so you can keep the promise. Where a rule is a recommendation of this document it is marked **Suggested** and must be confirmed with the practitioner and the data owners; nothing here is clinical advice.

### 6.1 Scores

The Overall Score (0 to 100 per patient per day) and the per-card scores are produced by the server when a check-in is saved (section 5.10) and stored (`daily_score`, `card_score`). The screens **read** them; they never calculate them. The text the patient/provider can read about it is in the "How the Overall Score works" dialog: the score "averages the day’s answers across the cards you unlocked (goal met, confidence, mood and sleep), with equal weight per card", flagged as a placeholder. The full list of inputs, the 62-point "goal met" threshold, and what is still undecided are in `DATABASE_HANDOFF.md` section 8.1; the BACKEND implements the agreed rule and returns the day's numbers in the check-in response. Rules that follow from the screens: the "what changed" panel treats `overall` as the **average of the card scores**; a replaced check-in (section 5.10) must recalculate the same day; locking a card later never rewrites past days.

### 6.2 Check-in length: shortening, offer, "keep going"

What the screens say (these sentences are the promises to keep):

| Where | Text |
|---|---|
| Card settings, switch "Shorten automatically if questions are skipped" | "Switches to Quick for now, so check-ins never feel like a chore" |
| Card settings, switch "Offer a longer check-in again" | "After a week of consistent check-ins, ask if they want to try more" |
| Check-in setup banner (when `lengthNow ≠ lengthChosen` and the switch is on) | "You chose `<Chosen>`, but the last few check-ins were hard to finish. After a week of check-ins we will ask if you want to try more." |
| Today | "You chose `<Chosen>`. We shortened it for now because busy days made it hard. Switch back any time." and, when offered: "You checked in 7 days in a row. Want to try the `<Chosen>` check-in again?" |
| Provider patient page | "Shortened to `<Now>` for now after skipped questions" / "Adjusts automatically if questions are skipped" |
| Provider weekly report | a pattern "Check-in shortened to `<Now>`: `<first>` chose `<Chosen>`, then skipped follow-ups on several evenings. The app will offer the longer version again after a week of steady check-ins." |

What exists in the code: only the **display** of `lengthNow ≠ lengthChosen`, the offer notice (driven by a flag nothing sets except a demo button), and the "Yes, try it" / "Not yet" buttons (section 5.12). **What you must decide and build:**

1. **When to shorten** (sets `length_now = 'quick'`, only when `patient_card_config.auto_shorten` is on). The save request carries `planned` and `answers` (section 5.10) so you can count unanswered questions. **Suggested** starting point to confirm: shorten when, over the patient's last 3 completed check-ins, at least half of the planned questions were left unanswered. "Unanswered" includes questions never reached because the patient pressed "Finish" early; decide whether those count.
2. **When to offer the longer check-in again** (only when `offer_longer` is on): the screen text says after "7 days in a row" / "a week of steady check-ins". **Suggested:** 7 consecutive local days each with at least one completed check-in since the shortening. Set a flag the Today screen can read (`HK.data.today[id].offerLonger`, section 5.12).
3. **After "Not yet"**: how long before the offer returns (suggested: 7 days).
4. **After "Yes, try it"**: `length_now = length_chosen` (done by the endpoint).
5. **Provider changes the default length** (card settings): see the length quirk in section 5.8 (point 3) and section 12.
6. **"Low energy has come up three days in a row"**: the screen shows this sentence after **one** answer of `Low energy` in the same check-in (the code does not count days). Either keep that trigger or change the front end to count; the BACKEND does nothing for it today.

### 6.3 Reminders

Stored per patient (`patient_card_config`): `remind_am` (default 08:00), `remind_pm` (20:00), `skip_if_done` (true), `wind_down` (21:30, "Wind-down reminder: Sent before the planned bedtime", visible only on the Sleep card's options). **No screen sends or displays a reminder.** The patient app has no notification permission flow, no device registration, no channel choice. To build: choose the channel (push, e-mail or text; each needs a screen or setting that does not exist yet), a scheduler that runs in the **patient's time zone** (`app_user.time_zone`), and the rule "skip the reminder if already checked in" (`skip_if_done`: do not send the morning reminder when today's `am` check-in is saved, same for `pm`). Wording of reminders is not specified anywhere. The Sleep option "Use insomnia (CBT-I) wording" (`cbti`) and the other per-card options in section 5.8 are stored but nothing reads them yet.

### 6.4 Invites and account states

```
none  --(invite sent: 5.3)-->  invited  --(account created: 5.5)-->  active
                               invited  --(resend: 5.3)-->           invited (new link, old link dead)
```

* The state never goes backwards in the screens. An invite expires after **7 days** (stated in the e-mail text) but the patient stays `invited` (the provider's list keeps showing "Invite sent `<date>`" and the "Resend" button); no screen shows "expired".
* A link works **once** (stated in the e-mail text). Opening an already used link shows "You are all set / This invite was already used." (section 5.4).
* E-mail addresses are unique across patients and users and compared in lower case (section 5.1).
* The e-mail is sent by the server after the database commit; keep delivery status if you want to show bounces later (no screen exists).
* Not in the screens at all: removing or archiving a patient, changing a patient's e-mail, transferring a patient to another provider, a patient leaving the app. If any is needed, it needs both an endpoint and a screen.

### 6.5 Check-ins and days

* One completed check-in per patient, **day** and **period** (`am` / `pm`); a repeat replaces the earlier one (section 5.10). The day is the patient's **local** calendar day (time zone from the account). A check-in finished at 00:20 counts for the new day.
* The screens never let a patient fill in a past day. A check-in can be started in the morning period late in the day (the period is the patient's choice on the setup screen); there is no "this period is closed" rule.
* `patient.last_active_at` = the last time a check-in completed. It feeds the "Last check-in: Today, 12:36 PM" text (DATABASE document 3.2 explains how the page replaces the clock part with the last event hour).
* The provider's "needs attention" reason can show a free text from `patient.attention_note` (`flag`) when the score fell by 9 points or more. **No screen writes it**: it is for the BACKEND or an admin tool.

### 6.6 Numbers derived for the weekly screens

`week.barriers`, `week.conf`, `week.pconf`, `week.checkins`, `answers`, `customResults`, `events`, `lastActiveAt`, `today` are computed by the server from the saved check-ins (how: `DATABASE_HANDOFF.md` sections 4.3 and 8.5). They must be **correct at the time the page is requested**: the pages read them once per load.

---

## 7. Values the browser works out by itself (do not return them, do not re-implement them)

The browser derives these from the roster record and the daily scores; the server sends only the inputs. Sending them is harmless but pointless: the page overwrites them. Know them so notifications, e-mails and tests agree with what users see.

| Value | Computed from | Detail |
|---|---|---|
| `status`, `reason` (On track / Keep an eye / Needs attention / New on the app / Invite sent / Not invited) | `series`, `state`, `invitedOn`, `flag` | first match of: invited/none; fewer than 14 check-ins = new; no check-in for 3+ days = attention; 7-day mean down 9+ points vs the 21 days before = attention; down 4+ or 2 days missed = watch; else on track (formulas: `DATABASE_HANDOFF.md` section 7) |
| `today` (rating shown), `daysSince`, `delta7`, `checkins`, `lastActive` | `series`, `lastActiveAt`, events | `today` is the **last** non-empty score, not necessarily today's |
| Streak | `series` | consecutive days with a score ending at the last entry |
| Provider list counters | the roster | patients, on the app, checked in today, needing attention, favorites, invited, not invited |
| Weekly summary and report numbers | `series`, `domainScores`, `week` | goals met = card score of 62 or more; "patterns" (top barrier on 3+ days, card with fewest met days, shortened length, confidence below 5.5); confidence arrow = (this week − last week) × 5 |
| Rating word and Pip's mood | today's score and sleep score | 85+ great, 70+ good, 55+ steady, 40+ tough, else rough; mood: none = content, below 38 down, sleep below 44 tired, 72+ happy, 50+ content, else tired |
| Chart points for every range | `series`, `events`, `domainScores` | 1D, 7D, 1M, 6M, 1Y (weekly means), 5Y (monthly means), Custom; includes **invented** intermediate points for 1D and 7D (DATABASE document 8.3) |

**"Today" is the browser's date**, fixed when `js/core.js` loads. The server must build day keys in the user's time zone, and `HK.config.now` must stay `null`.

---

## 8. Browser storage to retire, and the full list of seams

### 8.1 What the prototype stores in the browser

| Key | Where it is read / written | Production |
|---|---|---|
| `localStorage hk.newPatients` | `provider.js` `createPatient`, `restoreEnrollment` | **retire** (section 5.1) |
| `localStorage hk.enroll` | `provider.js` `setEnroll`, `restoreEnrollment` | **retire** (5.3, 5.5) |
| `localStorage hk.extraAccounts` | `login.js` `accounts()` and the invite submit | **retire** (5.5); it holds **plain-text passwords** |
| `localStorage hk.cfg.<patientId>` | `cards.js` `cfg`, `saveCfg` | **retire** (5.8, seam S1 in section 4.3) |
| `localStorage hk.priv.<patientId>` | `private.js` `privGoals`, `privSave` | **retire** (5.13) |
| `localStorage hk.petMood` | `patient-app.js` (demo mood chips) | **retire** with the demo chips (section 12) |
| `localStorage hk.theme` | `core.js` (palette) | keep (device preference); the first inline script in every page applies it before the page paints |
| `localStorage hk.sort`, `hk.listH2` | `provider.js` (list sort, list height) | keep |
| `localStorage hk.chartSize`, `hk.chartRange` | `chart.js` | keep |
| `sessionStorage hk.state` | `hk-state.js`: session, `PSTATE` (today's score, check-in progress, counters), per-patient favorite, lengths and unlocked cards | **retire the restore** (below) |
| `sessionStorage hk.toast` | `core.js` `toast()`, restored by `hk-state.js` | keep: it makes a toast shown just before a page change (for example "Account created. Welcome!") appear on the next page |

**What to change in `js/main.js` and `js/hk-state.js`** (mock-only plumbing, no screen affected):

1. In `main.js` delete the call `restoreEnrollment();` (it re-creates patients from `hk.newPatients`). Keep `hkRestoreState();` **but** replace the body of `hkRestoreState` in `hk-state.js` so that it only hands the toast over:

```js
function hkRestoreState() {
  try {
    const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    if (nav && nav.type === 'reload') return;
    const t = JSON.parse(sessionStorage.getItem('hk.toast') || 'null');
    if (t && Date.now() - t[1] < 2400) setTimeout(() => toast(t[0]), 0);
  } catch (e) { /* ignore */ }
}
```

and delete the last line of the file (`window.addEventListener('pagehide', hkSaveState);`) and the function `hkSaveState`. **Why this matters:** the restore copies an older in-memory snapshot (favorite, lengths, unlocked cards, today's progress) **over the data the server just sent**, so the screens could show stale values; and it keeps the previous user's data in the tab after sign-out.
2. `session` (role, id) is filled only by the sign-in handlers and is used in one place: `phonePid()` in `patient-app.js` (which patient the phone screens show). After the change above `session` is empty on every page load, and `phonePid()` then uses `?p=<id>` or the first record of the roster; a patient's roster has exactly one record, so the patient app works; a provider's preview links always carry `?p=<id>`.

### 8.2 Every seam in one table (all are documentation only; no screen file was changed)

| # | Seam | File and place | Section |
|---|---|---|---|
| S0 | Load data before the app starts (replace `HK.ready`), add `HK.api`, `HK.csrf`, `HK.signOut` | `js/hk-data.js` | 2.2, 5.0, 5.17 |
| S1 | Per-patient card settings from the server (`HK.data.cardConfig`) | `js/cards.js` `cfg()` | 4.3 |
| S2 | Sign in | `js/login.js` `#signin` submit | 3.2 |
| S3 | Add one patient (accept the server id) | `js/provider.js` `#addform`, `addPatient` | 5.1 |
| S4 | Import a list | `js/provider.js` `#iadd` | 5.2 |
| S5 | Send / resend invite, bulk invite | `js/provider.js` `sendInvite`, `bulkInviteDialog` | 5.3 |
| S6 | Create account from the invite | `js/login.js` `#setup` submit | 5.5 |
| S7 | Favorite | `js/provider.js` `[data-star]`, `js/patient-page.js` `#favBtn` | 5.6 |
| S8 | Provider note | `js/patient-page.js` `#noteSave` | 5.7 |
| S9 | Card settings and custom questions | `js/cards.js` `saveCfg`, `commit` | 5.8, 5.9 |
| S10 | Complete a check-in | `js/checkin.js` `finish()` and the "Start check-in" handler | 5.10 |
| S11 | Quick log (+ counts after reload) | `js/patient-app.js` `[data-savelog]`, `PS()` | 5.11 |
| S12 | Length offer (+ pending flag after reload) | `js/patient-app.js` `[data-offer]`, `PS()` | 5.12 |
| S13 | Private goals | `js/private.js` | 5.13 |
| S14 | Weekly reflection | `js/week.js` `#wrsave` | 5.14 |
| S15 | Save an idea | `js/patient-app.js` `resourceSheet` | 5.15 |
| S16 | Sign out (provider button, patient link) and clear the snapshot | `js/provider.js` `mountShell`, `js/week.js` | 5.17 |
| S17 | Storage clean-up (`main.js`, `hk-state.js`) | section 8.1 | 8.1 |

---

## 9. Loading, errors and edge cases the screens do not handle

The prototype never waits for anything, so it has **no loading state and no error state** except the ones listed. Decide and build these together with the front-end owner; the screens must not be redesigned silently.

| Situation | What happens today | What to provide |
|---|---|---|
| The data request in `HK.ready` is slow | the page stays **blank** (nothing is drawn before `cb()`) | keep the page blank only for a moment, or put a plain "Loading..." line in the body of each page file (a static HTML change) |
| The data request fails (network, `500`) | blank page forever | a plain message with a "Try again" link, shown by your `HK.ready` code; `401` and `403` go to the sign-in page (section 2.2) |
| A write fails | the screen has already changed and shows its success toast | the seams in section 5 show a short toast and undo where that is easy; **the toast texts marked (suggested) do not exist in the design** and need approval |
| The session ends while the page is open (cookie expired) | not possible in the prototype | `HK.api` sends the browser to `login.html#/login` on `401`; unsaved text on that page is lost (warn if you add long inactivity time-outs) |
| Double click or slow double submit | most buttons stay enabled; only a few protect themselves (sign-in and account creation disable the button and change its text; "Send invite now" disables itself after the click) | server-side idempotency (section 5.0); optionally disable the clicked button in each seam |
| Two tabs or two devices | not possible | last write wins for settings and notes; check-ins are unique per day and period |
| An id in the URL that does not exist (`#/provider/patient/zzz`) | provider pages show a "patient not found" view; the invite page goes to sign-in; the patient pages (`?p=zzz`) fall back to **the first patient of the loaded roster**, or show an empty-state card when the roster is empty | return an empty roster for ids the user may not see (never `403` text on the page) |
| An expired or revoked invite link | silently goes to sign-in | consider a `410` plus a short message (needs a text that does not exist today) |
| Offline | nothing is cached; every page is a full load | a service worker is **not** part of this hand-off |
| Print / PDF | the "Save as PDF" button only shows a toast; no print styles exist | section 5.16 |

Pages are real files, so the browser's **back button and reload work**; a reload of a page re-fetches its data (and clears the mock snapshot, section 8.1). The hash routes (`#/provider/patient/<id>`) are only used **inside** a page file; when the hash belongs to another page file the page jumps there (`location.replace(file + hash)`); an unknown hash goes to `login.html#/login`.

---

## 10. Security and privacy checklist

* **Transport and cookies:** HTTPS only; session cookie `HttpOnly; Secure; SameSite=Lax` (or `Strict`); rotate the session id at sign-in; short idle time-out (suggested 30 minutes) and absolute time-out (suggested 12 hours).
* **CSRF:** `X-CSRF-Token` on every write (section 5.0).
* **Passwords:** argon2id or bcrypt; never log them; rules in section 3.3; throttle sign-in and the invite endpoints; identical message and timing for unknown e-mail and wrong password.
* **No enumeration:** the duplicate-e-mail message in section 5.1 and the unknown-token behavior in section 5.4 must not reveal who is a user; invite tokens are random, at least 32 bytes, stored hashed.
* **Authorization on every request** (section 3.4): the provider id and patient id come from the session; the id in the URL is only a filter inside what the session may see. Test with another user's id.
* **Content of responses:** never send the roster to the sign-in page, never send other patients to a patient, never send unshared private goals or their logs to a provider, never send the provider's note or favorites to a patient (`DATABASE_HANDOFF.md` section 9).
* **Headers (suggested):** `Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-4kRvIG7XLMiH6lRn86a8PqWPdffQSRYKPIZuPYN99+U='; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`. Why each part: every page has **one** small inline script (it applies the saved palette before painting; the hash above is its SHA-256, **recompute it if that script changes**) and no page uses `eval`; the screens write many inline `style` attributes from script, so `style-src` needs `'unsafe-inline'`; one CSS rule uses a `data:` image (the drop-down arrow), so `img-src` needs `data:`; fonts are files in `fonts/`; nothing is loaded from other sites. Also send `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store` on every data response.
* **Escaping:** the screens escape every value they print (`esc()`); keep user text as plain text in JSON and do not add HTML to any field.
* **Logs and analytics:** no answer text, notes, goals or e-mail bodies in logs; no third-party scripts (the pages load none).
* **Sensitive quick-log kinds** (`intimacy`, `drip`) and private goals: strictest access (DATABASE document 9); never include them in e-mails or notifications.
* **Backups and deletion:** all patient data hangs off `patient_id` with cascading deletes; the screens have no "delete my data" flow, so provide one outside the UI.
* **The mock sign-in must not ship:** `js/hk-example-data.js` (it holds the example passwords, `HK.data.accounts` and `HK.config.demoLogins`), `docs/examples/` and the rest of the folder `docs/` are for development only. Deleting `js/hk-example-data.js` and its `<script>` line from the 10 pages removes every example login.
* **Self-harm wording:** the notices that mention the 988 phone number are static text in the screens (section 5.13, quick log `drip`). The server does not scan text.

---

## 11. Integration test checklist

Run each against a copy of the real server with test users (one provider, two patients, a second provider).

1. **Sign in and out:** valid and invalid credentials (same message and timing); `401` on every data and write endpoint without a session; sign-out destroys the session; the old cookie fails afterwards.
2. **Access:** as provider A request provider B's patient by id in every `GET /api/hk` page and every write (expect `404`); as a patient request another patient's id; as a provider call each patient endpoint (expect `403`); as a patient call each provider endpoint.
3. **Roster:** add a patient (all validation messages of 5.1), import with good, duplicate and malformed lines (5.2), send an invite, resend, bulk invite; the list shows state and "Invite sent `<Mon D>`".
4. **Invite:** open the link (one-record roster); create the account with each bad password; create it correctly; reuse the link (`410` and "You are all set"); an expired link; a resent link kills the older link.
5. **Check-in:** Quick, Standard, Extended for morning and evening; evening "yes" and "no" paths with `Low energy`; skipped questions; zero answers; a repeat for the same period (replaced, one row); a custom question; double submit with the same `idempotencyKey`; wrong value types (`400`); the returned `overall` / `cards` equal what a reload of Today shows.
6. **Settings:** every control in 5.8 saved and read back on reload; custom questions added, deleted (archived), asked in the next check-in at the right length; cleared time box rejected; length change behavior (section 6.2 point 5).
7. **Private goals:** add each type, log, share, unshare, delete; the provider's patient page shows only shared goals; unshared goals never appear in the provider's response body.
8. **Quick log, reflection, saved idea, note, favorite:** one request each; a disabled quick-log kind is refused.
9. **Weekly screens:** after a week of test check-ins the numbers on the patient summary and provider report equal an independent calculation from the tables (section 7 and the DATABASE document).
10. **Pages load:** each of the 10 pages opens with real data without red errors in the browser console; every page file named in the table of section 1 exists; direct links and reload work.
11. **Browser storage:** after the clean-up of section 8.1 the keys `hk.newPatients`, `hk.enroll`, `hk.extraAccounts`, `hk.cfg.*`, `hk.priv.*`, `hk.petMood` and `hk.state` are never written.
12. **Time zones:** a check-in at 23:50 and at 00:10 local time lands on the right days; a patient in another time zone from the provider.

---

## 12. Known quirks left untouched (found while reading the code; none was changed)

The front end was **not** modified to hide these; decide with the front-end owner whether to change them.

**Behavior**

1. **Length mismatch after a provider changes the default length.** `saveCfg` updates `lengthChosen` but not `lengthNow`; the patient screens then say "shortened automatically" without any shortening (section 5.8 gives a server-side fix).
2. **"Low energy ... three days in a row"** appears after a single answer (section 6.2 point 6).
3. **Weekly report pattern "lowest card"** is always shown when at least one card is unlocked, even in a good week (it shows the card with the fewest met days; ties go to the first unlocked).
4. **Confidence arrow** is `(this week − last week) × 5`, an arbitrary scale.
5. **`amDone`** is accepted and ignored (section 3.11 of the DATABASE document).
6. **Weekly custom questions** (`when = wk`) are never asked anywhere; only the provider's weekly report lists them (first three custom questions of any period).
7. **Quick-log counts** exist only while the page is open; nothing reads saved quick logs (section 5.11).
8. **Untouched slider:** pressing "Next" on a scale question without moving it stores 5.
9. **Private goal Save:** nothing is stored if the control was not touched (a count of 0 needs a "+" then "−"); the share switch toasts "Shared with ..." immediately although it only applies after "Save".
10. **Card-setting changes are saved on every keystroke** in the "Specific limit or plan" box (section 5.8 adds a delay).
11. **Import list:** a quoted field that contains a comma is split; a name-only or e-mail-only line is skipped; the import always gives the `standard` length (section 5.2).
12. **Preview as patient** works inside a provider session and its write buttons would call patient endpoints (section 3.5).
13. **Patient sign-out link** does not clear anything (section 5.17).
14. **Recent check-ins heading** in `patient-page.js` is opened with `<h2>` and closed with `</h3>`; the browser repairs it and it looks right.
15. **Unknown `?p=<id>` on a patient page** shows the first patient of the loaded roster instead of an error (harmless when the roster only contains what the session may see).
16. **The invite page's example link** on the sign-in page ("See an example invite page") only appears when the roster loaded on that page contains an invited patient; with the rule that the sign-in page loads no roster it never appears.

**Words and scaffolding that describe the prototype** (they will look wrong in a live app; changing a word is a text change in the file named, not a design change):

| Text / element | File |
|---|---|
| Toast `Note saved (prototype only)` | `patient-page.js` |
| Invite dialog line `This is a preview. In the full app the email is sent automatically.`, the preview e-mail, the buttons "Open it as the patient" | `provider.js` |
| Toast `PDF export is part of the full app` | `week.js` |
| Toast `Photo added (prototype)` | `checkin.js` |
| Dialog "How the Overall Score works" with the notice "Placeholder formula for the prototype. The final version will be set with the practitioner and the data team." and its description of the 1D / 7D lines (which are placeholders, DATABASE document 8.3) | `chart.js` |
| "Prototype" bar at the top of every page: the label, the screen links, the palette buttons; hidden only while the address hash contains `clean=1` and not kept by plain links | `core.js` `protoBar`, `main.js` `initProto` |
| Page `<title>` of every page ends with "prototype" | the 11 `.html` files |
| Patient screens above 900 px wide are drawn inside a phone frame (fake status bar with clock, signal, wifi, battery) next to a **notes panel** ("About this screen", "Try this", "Demo: adaptive length", "Demo: Pip's mood"); at 900 px or narrower the frame, status bar and notes panel are hidden | `patient-app.js`, `checkin.js`, `week.js`, `css/phone.css` |
| Label "Team suggestion" in the "View questions" dialog for questions `sleep-am-4`, `sleep-am-5` (flag `team` in the data, "teamSuggested" in `questions.json`) | `cards.js`, `data.js` |
| Import button "Use a sample list" (fills five made-up people with `@example.com` addresses; importing them would add fake patients to a real roster) | `provider.js` |
| Add-patient form placeholders `Jamie Rivera`, `jamie@example.com` | `provider.js` |

---

## 13. Planned additions (**do not build yet**)

These came from a meeting with the practitioner. They are **not** in the prototype and nothing above depends on them; they are listed so endpoints and tables can leave room. When they are built, each will need new screens and a new section here.

1. Private **and** public logs with tags (visible to the provider only when public); practitioner-made quick logs; user-created reusable and shareable tags.
2. An optional daily-goal follow-up with its own reminder (builds on section 6.3).
3. Pip suggesting ideas for the **morning** goal (evening ideas were dropped from the plan).
4. Menstruation tracking as a private log template.
5. Monthly PHQ-9 and GAD-7 questionnaires, stored as data (scores per month; wording not included in this hand-off).

Keep every new table keyed by `patient_id`, with an `is_private` flag that defaults to private, and keep the access rules of section 3.4 and `DATABASE_HANDOFF.md` section 9.

---

## 14. Setup, secrets and hand-off with the DATABASE owner

The delivered folder contains **no secrets** (no API key, no server address, no database path). The only logins in it are the made-up example ones in `js/hk-example-data.js` (section 3). Everything below is what you must **create or receive**, so nothing is a surprise on the day you connect the pieces. The database is **SQLite** (a single file; no user name or password; see `DATABASE_HANDOFF.md` section 13).

### 14.1 Settings the server needs (keep them in environment variables, never in the repository)

Suggested names; use your own if you prefer. Put a file `.env.example` with these names and **no real values** in the repository, keep the real `.env` out of it (`.gitignore`), and never print these values in logs.

```
HK_DB_PATH=/srv/hk/hk.db              # absolute path of the SQLite file (from the DATABASE owner); outside the web root
HK_BASE_URL=https://example.org       # public address of the site; used to build invite links (section 5.3)
HK_SESSION_SECRET=                    # random, 32+ bytes; signs the session cookie (generate: python3 -c "import secrets;print(secrets.token_urlsafe(48))")
HK_SMTP_HOST=                         # e-mail sending service for invite e-mails (section 5.3); or an e-mail API key instead
HK_SMTP_PORT=587
HK_SMTP_USER=
HK_SMTP_PASSWORD=
HK_MAIL_FROM=                         # the sender address shown on the invite e-mail
HK_DEFAULT_TIME_ZONE=America/Chicago  # IANA name; see DATABASE_HANDOFF.md section 4.4
```

Where each comes from: `HK_DB_PATH` from the DATABASE owner (13.5); `HK_BASE_URL` from wherever the site is hosted (use `http://localhost:8000` while developing); `HK_SESSION_SECRET` you generate yourself, once per environment (changing it signs everybody out); the `HK_SMTP_*` values and `HK_MAIL_FROM` from the e-mail service you pick (any provider; the prototype never sends mail, so until you have one, print the invite link to the server console instead, or use a local test mail server); the time zone from the team's decision (4.4).

### 14.2 Values the server creates itself (nothing to ask anybody for)

1. **Invite token** (5.3): at least 32 random bytes, sent only inside the link; store only its SHA-256 (`invite.token_hash`). Python: `t = secrets.token_urlsafe(32)` and `hashlib.sha256(t.encode()).hexdigest()`.
2. **CSRF token** (5.0): random per session.
3. **Password hash** (3.3): argon2id (Python package `argon2-cffi`, `PasswordHasher().hash(pw)` gives a self-describing string such as `$argon2id$v=19$...`) or bcrypt. Store that whole string in `app_user.password_hash`.
4. **Ids** (`pat-...`, check-in ids, goal ids): URL-safe, `[A-Za-z0-9_-]` only (`DATABASE_HANDOFF.md` section 2).

### 14.3 The first provider account (no screen creates one)

The screens can create **patients** (5.1 and 5.2) but nothing in the folder creates a **provider**. Create the first one once, outside the app, with a small script that uses the same hash function as the sign-in (so the password it sets will verify). Tested pattern:

```python
import sqlite3, secrets
from argon2 import PasswordHasher
con = sqlite3.connect('/srv/hk/hk.db'); con.execute('pragma foreign_keys = on')
con.execute("insert into app_user (id, email, password_hash, role, display_name, time_zone) values (?, ?, ?, 'provider', ?, ?)",
            ('prov-' + secrets.token_hex(4), 'practitioner@yourdomain.org',   # lower-case; the table refuses upper case
             PasswordHasher().hash(input('Choose a password (8+ chars, 1 capital, 1 symbol): ')),
             'Dr. Their Name', 'America/Chicago'))
con.commit()
```

`display_name` is what the screens show as the provider name (the patient screens and the invite e-mail also use it). Use the real practitioner's e-mail; tell them the password in person, and ask them to change it if you add a change-password feature (none exists in the screens). Run the same script again for another provider.

### 14.4 What you need from the DATABASE owner

1. The path of the SQLite file and who owns it (13.5, item 1), and confirmation that the tables and reference data exist (13.5, item 3).
2. The SQLite version (3.38 or newer) and the pragmas to set on every connection: `foreign_keys = on`, `busy_timeout = 5000` (`DATABASE_HANDOFF.md` 4.0). Put them in the one function that opens a connection.
3. Any change they made to table or column names.
4. The backup schedule and where the copies live (13.4).

### 14.5 What you give the DATABASE owner

1. The password hash format (14.2, item 3) and the time zone rule (4.4).
2. The decision on the **Overall Score and card score formulas** (section 6.1 here; `DATABASE_HANDOFF.md` section 8.1): the tables only store results.
3. The exact list of fields you write on every check-in (section 5.10): `checkin`, `checkin_answer`, `daily_score`, `card_score`, `day_event`, `patient.last_active_at`.
4. Keep SQLite's **one writer at a time** rule in mind: one request = one short write transaction (`DATABASE_HANDOFF.md` 4.5).

### 14.6 What is deliberately not in the folder

An e-mail service account, a domain name or certificate, a hosting account, a session store, rate-limit settings and an error-reporting service are all left to you; the prototype has none of them. Section 10 lists the security settings to apply to each.
