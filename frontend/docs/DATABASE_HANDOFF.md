# DATABASE HANDOFF: Lifestyle Tracker prototype

Audience: the person who owns the **DATABASE** (tables, data loading, queries).
Written from the real code in `js/` (nothing here is guessed). If this file and the code ever disagree, the code wins; tell the front-end owner.

> **How to use this file with an AI assistant:** paste the whole file. It is self-contained. The reference content it mentions (cards, questions, lists) is in `docs/seed/*.json`; an example of the exact data shapes is in `docs/examples/hk-data.sample.json`. A sibling file, `BACKEND_HANDOFF.md`, covers the server endpoints; the BACKEND owner reads that one.

---

## 0. What this document gives you

1. **Section 3, the data contract**: the exact JSON the screens read, table by table (`HK.config`, `HK.data.*`). Every field, type, allowed value, ordering rule and what happens if it is wrong.
2. **Section 4, a recommended relational schema** (tables, columns, keys, indexes) and, for each `HK.data` key, how to build it from those tables.
3. **Section 5, data the prototype currently keeps only in the browser** and that must become real tables.
4. **Section 6, reference (seed) data**: the 6 cards, 77 questions, lists and defaults, as JSON files generated from the code.
5. **Section 7, values the browser derives** (do not store them, but know the formulas, because your data feeds them).
6. **Section 8, values the BACKEND/DATABASE must calculate** (Overall Score and per-card scores): what the prototype does now (placeholder) and what the screens require.
7. **Sections 9 to 12**: privacy rules, volume notes, a load-check you can run, and planned additions (do not build yet).
8. **Section 13**: setup for **SQLite** (no user name or password: how the file is protected), creating and checking the database, backups, and what to hand to and get from the BACKEND owner.

Out of scope: how the server exposes the data (see `BACKEND_HANDOFF.md`), visual design, and features that are not in the prototype yet (those are listed only in section 12, "Planned additions", and must **not** be built now).

## 1. The product, from a data point of view

* A **provider** (practitioner) manages a roster of **patients**.
* Each patient has up to **6 lifestyle cards** (Physical Activity, Diet & Nutrition, Mind-body & Mindfulness, Restorative Sleep, Social Connection, Avoiding Harmful Substances). The provider chooses which cards are **unlocked** per patient.
* A patient does a **morning** and an **evening** check-in (also a **weekly** reflection question per card). A check-in is a short list of questions built from fixed content plus any questions the provider added.
* Every day with a check-in gets an **Overall Score** (0 to 100) and, per unlocked card, a **card score** (0 to 100). The provider sees the score over time on a chart; the patient sees today's rating and a weekly summary.
* The patient can keep **private goals** (visible to the provider only if the patient shares one), use **quick-log** buttons (drink, snack, craving, etc.) and read ideas/resources.
* The provider can write a **private note** per patient and add **custom questions** to a patient's check-in.

## 2. Conventions used everywhere

| Topic | Rule |
|---|---|
| Ids | Strings. A **patient id appears in URLs** (`#/provider/patient/<id>`, `?p=<id>`) and as an HTML attribute value. It must not contain `/`, `?`, `#`, `&`, `=`, `+`, `%`, quotes or spaces. Use `[A-Za-z0-9_-]` (a UUID or short slug). The router pattern for an id is `[^/?#]+`. |
| Dates | `'YYYY-MM-DD'` strings. A date means the **patient's local calendar day**. The browser turns it into a local Date at 12:00 so daylight-saving shifts never move it. "Today" in the browser is the **browser's** local date (or `HK.config.now`). |
| Times of day | In `events`, a **decimal hour** (`8.1` = 8:06 AM, `12.6` = 12:36 PM, `20.9` = 8:54 PM). Use whole minutes divided by 60 (e.g. `minutes / 60`), so minutes round correctly. Displayed as `h:mm AM/PM` (12-hour). |
| Datetimes | Only `lastActiveAt` (optional, ISO 8601 string). Only its **hour and minute in the viewer's browser time zone** are shown. |
| Scores | Numbers 0 to 100. Whole numbers recommended. Decimals are accepted (screens round with `Math.round` for display; the chart keeps decimals). `null` means "no check-in / unknown". Never use `0` for "missing". |
| Enumerations | Lower-case ids exactly as listed (`active`, `invited`, `none`; `quick`, `standard`, `extended`; card ids `activity`, `diet`, `mind`, `sleep`, `social`, `substance`; `am`, `pm`, `wk`). An unknown value can make a screen **throw** or silently misbehave; each table in section 3 lists exactly which (the "If wrong" notes were checked against the shipped pages). |
| Text | UTF-8. All text is HTML-escaped on display, so any characters are safe. Long text is shown as-is (no truncation rules except where stated). |
| Booleans | JSON `true`/`false`. |
| Nulls vs missing | Where a field says "optional", omit it or send `null`. Optional arrays default to `[]`, optional objects to `{}`. |
| Ordering | Stated per table. **Ordering matters** for `series` (oldest first) and `answers` (newest first). |
| Case | E-mails are compared **lower-case**. Store and send them lower-case. |
| Language | English only. Display strings (e.g. status labels) live in the code and in `docs/seed/`. |

---

## 3. The data contract: `HK.config` and `HK.data`

All screens read their data through one object, `window.HK`, defined in `js/hk-data.js` (the only file the BACKEND/DATABASE owners need to change to feed the screens). `js/hk-data.js` itself is empty; the second script on every page, `js/hk-example-data.js`, fills it with **one example patient (Alex Sample) and the example logins** so every screen can be opened and clicked (it builds its dates from today's date; the shape of every table it fills is documented in section 3). In real use, delete that file and its `<script>` line from the 10 pages; the pages then open in their empty states.

```
HK.config   small settings                         (section 3.1)
HK.data     plain tables the screens read          (sections 3.2 to 3.11; 3.12 is a mock; 3.13 is a new key)
HK.provider functions the screens call; each default reads the matching table in HK.data
HK.ready(cb) runs cb once the data is in place (default: right away)
```

Loading order on every page: `hk-data.js` (creates `HK`), then the app scripts. `js/main.js` starts the app inside `HK.ready(...)`: it calls `hkLoadPatients(HK.data.patients)`, restores prototype-only state (mock plumbing that the BACKEND document, section 8.1, tells you to remove), then draws the screen. So all `HK.data.*` tables must be filled **before** the callback `cb` is called.

**Which person fills what:** the DATABASE owner defines the tables behind each key below; the BACKEND owner serves them (see `BACKEND_HANDOFF.md`, section 4). A runnable example of all keys is `docs/examples/hk-data.sample.json` / `.js`.

### 3.1 `HK.config`

| Field | Type | Default | Meaning and effect |
|---|---|---|---|
| `providerName` | string | `'Provider'` | Display name of the practitioner. Shown in the provider header (with 1 to 2 letter initials in the avatar), in the invite-email preview ("<name> invited you to Lifestyle Tracker"), on the invite page and on patient screens ("Shared with your provider, <name>"). If empty the screens say "Your provider". |
| `providerEmail` | string | `''` | Shown under the name in the provider header. |
| `now` | `null` or date string | `null` | Replaces the real clock (testing/demos). The calendar date used by every screen is **fixed when `js/core.js` loads** (the greeting and the phone status-bar clock re-read it each time they draw), so set it *before* `core.js` runs (for example inside `hk-data.js` itself). Use `null` in real use. |
| `defaultScore` | number 0-100 | `56` | **Placeholder.** The rating shown on the patient's Today screen when the patient has no score yet. The real rule belongs to the BACKEND. |
| `demoLogins` | array of `{label, email, pw}` | `[]` | Optional one-tap chips under the sign-in form (they fill the e-mail and password boxes). The example file sets two (Provider, Patient (Alex)). Keep empty in real use. |
| `demoNote` | string | `''` | Sentence above those chips. |

### 3.2 `HK.data.patients`  (array of patient records)

One record per patient the signed-in user may see (the provider sees their roster; a patient-facing deployment should send only that patient's own record).

```jsonc
{
  "id": "pat-7f3a",                       // required, unique, URL-safe (section 2)
  "name": "Alex Sample",                  // required. FIRST name first: first name = text before the first space
  "email": "alex.sample@example.org",     // required, lower-case, unique across patients and accounts
  "state": "active",                      // required: "active" | "invited" | "none"
  "fav": true,                            // optional boolean, default false (provider's favorite star)
  "age": 34,                              // optional integer or null
  "pronouns": "they/them",                // optional string, default ""
  "goal": "Walk after dinner",            // optional string, default "" (shown as "Current goal")
  "invitedOn": "Nov 2",                   // optional display string "Mon D" (3-letter English month, day without leading zero); null if never invited
  "lengthChosen": "standard",             // optional "quick" | "standard" | "extended", default "standard"
  "lengthNow": "standard",                // optional, same values, default = lengthChosen (current effective length)
  "unlocked": ["activity", "diet", "sleep"], // optional array of card ids, default []
  "series": [ { "d": "2026-09-26", "score": 61 }, ... , { "d": "2026-11-04", "score": 55 } ], // see rules below
  "start": "2026-09-26",                  // optional; only used when "series" is omitted: date of the single empty first point
  "lastActiveAt": "2026-11-03T21:15:00",  // optional ISO datetime; only its clock (h:mm AM/PM) is displayed
  "flag": "Missed two evening check-ins"  // optional string; replaces the generated reason for "Needs attention" when the score dropped
}
```

**`state` meaning.** `none` = patient added, no invite sent yet. `invited` = invite sent, account not created. `active` = patient created their account and uses the app. Use only these three values. (Checked: an unknown value does not crash anything, but the patient is then treated as *not active*; the screens show a "Resend" button in place of the last check-in. The label table has only these three plus the derived ones in section 7.)

**`series` rules (most important field):**

1. **Oldest first**, one entry per **calendar day**, from the patient's **first day on the app** up to and including **today**. A day with no check-in is `{ "d": "...", "score": null }`; **do not leave the day out.** The screens count the *last N entries*, not dates: "this week" = the last 7 entries, "previous weeks" = entries 8 to 28 from the end, the sparkline = last 14 entries, streak = consecutive non-null entries. A series with missing days silently gives wrong weeks.
2. The **first entry's date is shown as the join date** ("Joined Sep 26, 2026", "On the app since…", the chart's left edge, and the "before the patient joined" message).
3. The **last entry should be today** (`score: null` if today has no check-in yet). A null last entry does not break the streak (yesterday's streak still counts).
4. `score` = that day's **Overall Score** (0-100, see section 8).
5. If `series` is omitted or empty (new patient, or `invited` / `none` state), the app creates one empty entry for today (or for `start` if given). For `invited` and `none` patients the series is not used for anything else.
6. Series for the 5-year chart: up to 1826 days per patient is the maximum range the chart offers (365 for 1 year). Sending the full history is fine; a 5-year history is about 1800 small objects per patient.

**Fields the screens compute and overwrite** (do not send; section 7 gives the formulas): `today`, `lastDate`, `daysSince`, `delta7`, `lastActive`, `status`, `reason`, `checkins`. Any extra fields you add to a record are kept but unused.

**`lastActive` text ("Last check-in")** comes from `lastActiveAt` (only the clock part) or, after the app has loaded, from the latest event of the last check-in day (section 3.4), whichever applies as described in section 7.

**If wrong** (each item below was checked by loading deliberately wrong data into the shipped pages; "throws" = a JavaScript error is raised and the screen stops drawing at that point):

* `lengthChosen` or `lengthNow` not one of `quick` / `standard` / `extended`: **throws** on the patient page (`provider-patient.html`), the patient's Today screen (`patient-today.html`) and the weekly report (`provider-report.html`). It does **not** throw on the card settings page (`provider-cards.html`); the length control just has nothing selected.
* A card id in `unlocked` that is not one of the six ids: no error on the patient page (it is still counted: "Cards unlocked 2 of 6") or the card settings page, but it **throws** on the patient's Today screen, the weekly summary (`patient-week.html`) and the weekly report (`provider-report.html`).
* `state` not one of the three values: no error; treated as not active (see above).
* `series` that is not an array (for example a string): **throws**. An empty object `{}` is ignored. A series with missing calendar days does not throw but produces wrong weeks, streaks and status (rule 1 above).
* `lastActiveAt` that is not a valid ISO datetime: no error, but the "Last check-in" text shows `NaN:NaN PM`.
* An `id` containing a space, `/`, `?` or `#`: the patient page does not open (the router falls back to the sign-in page).

### 3.3 `HK.data.domainScores`  (per-card scores)

```jsonc
{ "pat-7f3a": { "2026-11-04": { "activity": 58, "diet": 51, "sleep": 56 }, "2026-11-03": { ... } } }
```

`patientId -> 'YYYY-MM-DD' -> cardId -> number 0-100`.

* One value per **unlocked card per day that has an Overall Score**. Values for locked cards, and for days whose Overall Score is `null`, are ignored (the screens return `null` for them and show `--`).
* Values are rounded to whole numbers on read.
* Read by: patient page ("This week by card", the "what changed" breakdown on the chart), the weekly report and weekly summary ("goal met" = card score 62 or more), and the patient's Today chips (which look up **today's date key**, not the last scored day; a missing key shows `--`).
* Relationship to the Overall Score is described in section 8 (the "why" panels assume the Overall Score is the **average of the card scores**).

### 3.4 `HK.data.events`  (day timeline)

```jsonc
{ "pat-7f3a": { "2026-11-04": [ [6.7, "Woke up", null], [8.1, "Morning check-in", "am"], [12.6, "Movement logged", "activity"] ] } }
```

`patientId -> 'YYYY-MM-DD' -> [ [hourOfDay, label, tag], ... ]`

* `hourOfDay`: decimal 0-24 (section 2). **Sort ascending.** The 1D chart's x-axis runs 6:00 to 22:00, so use hours between 6.0 and 22.0.
* `label`: short text shown in the chart tooltip and table ("Morning check-in", "Movement logged", "Evening check-in"). Keep it under about 30 characters.
* `tag`: a card id, `"am"`, `"pm"` or `null`. The only behavior that depends on it: an event whose tag is `null` **and** whose label is exactly `"Woke up"` is **ignored** when working out the patient's "Last check-in" time (everything else counts).
* Used for: (a) the **1D** chart (one point per event; the **1D** button always shows **today**, and a one-day **Custom** window shows that chosen day), where each event's `label` also names its row in the "what changed" list under the chart; and (b) the "Last check-in: Today, 12:36 PM" text, which is the **latest event hour** of the last check-in day when that day is today or yesterday.
* A day with a score but **no events entry** shows "No data to show" on the 1D chart (all other ranges are unaffected) and "Last check-in: Today" without a clock (unless `lastActiveAt` provides one).
* The 1D point values are **placeholder interpolation** between the previous day's score and the day's final score (the screens do not have a running score per event). See section 8.3.

### 3.5 `HK.data.answers`  ("Recent check-ins" text)

```jsonc
{ "pat-7f3a": [ { "d": "2026-11-04", "when": "Morning", "dom": "activity", "txt": "Walked to the park.", "barrier": null },
                { "d": "2026-11-03", "when": "Evening", "dom": "sleep", "txt": "In bed by ten.", "barrier": "Low energy" } ] }
```

`patientId -> [ { d, when, dom, txt, barrier } ]`, **newest first**.

| Field | Type | Meaning |
|---|---|---|
| `d` | `'YYYY-MM-DD'` | Day of the answer. Shown as `Wed, Nov 4`. |
| `when` | string | `"Morning"` or `"Evening"`. Shown lower-cased after the date ("Wed, Nov 4, morning"). Must be a string (a row without it **throws** on the patient page). |
| `dom` | card id | The card the answer belongs to. **A row whose `dom` is not one of the six card ids is silently dropped.** |
| `txt` | string | The patient's own words, shown in quotes. |
| `barrier` | string or `null` | A barrier label shown as a pill ("Low energy"). Use the labels in `docs/seed/barriers.json`. |

* Patient page shows the **first 4** valid rows; the weekly report ("In <name>'s words") shows the first **3**.
* **Which text answer to surface is a product decision the code does not define.** The prototype used sample sentences. A reasonable rule: free-text (`type: text`) answers to card questions, newest first, with `barrier` filled from the barrier the patient named the same day.

### 3.6 `HK.data.week`  (weekly figures that are not derivable from `series`)

```jsonc
{ "pat-7f3a": { "barriers": [["Low energy", 3], ["Forgot", 1]], "conf": 7.4, "pconf": 6.9, "checkins": 11 } }
```

| Field | Type | Meaning |
|---|---|---|
| `barriers` | array of `[label, days]` | Barriers the patient named in the last 7 days (today and the 6 days before) with the number of **days** each came up; **most common first**. `days` integer 1+. Shown as "Low energy, 3 days". The first entry is the "top barrier": 3+ days raises a "pattern to look at" on the report. |
| `conf` | number 0-10 or `null` | Average **morning confidence** (the 0-10 slider answer to question `g-am-5`) over the last 7 days. `null` = unknown (shown as `--`). Below **5.5** raises a "low confidence" pattern. |
| `pconf` | number 0-10 or `null` | The same average for the 7 days before that (used only for the up/down arrow). |
| `checkins` | integer 0-14 | Number of check-ins (morning + evening) completed in the last 7 days. Shown as "11 of 14". Missing = `0`. |

### 3.7 `HK.data.customResults`

```jsonc
{ "pat-7f3a": { "q-1": "Yes 5, No 2" } }
```

`patientId -> questionId -> one-line result text` for provider-added questions (section 3.9) in the weekly report (shown as "<text> this week"). Empty or missing shows "No answers yet". Only the first 3 custom questions of the patient appear on the report.

### 3.8 `HK.data.privateGoals`  (a patient's own goals)

```jsonc
{ "pat-7f3a": [ { "id": "g1", "title": "Read before bed", "type": "yesno", "unit": "times", "limit": 0, "shared": true,
                  "log": { "2026-11-03": 1, "2026-11-04": 0 } } ] }
```

| Field | Type | Rules |
|---|---|---|
| `id` | string | Unique per goal. |
| `title` | string | Up to **60** characters (the add form enforces `maxlength=60`). |
| `type` | `"yesno"` \| `"count"` \| `"rating"` | Yes/no per day, a count with a daily limit, or a 0-10 rating. |
| `unit` | string | What is counted ("drinks", "times"). Up to **16** characters, default `"times"`. Used for `count`; keep a value for every type. |
| `limit` | integer 0-99 | The daily maximum for `count` goals ("at most 2 drinks a day"). Ignored for other types (send `0`). |
| `shared` | boolean | `true` = the patient chose to share this goal with the provider. **The provider's screens show only goals with `shared: true`.** Default `false`. |
| `log` | object `'YYYY-MM-DD' -> number` | One value per day the patient logged. `yesno`: `1` = yes, `0` = no. `count`: integer 0+. `rating`: 0-10. A missing day = not logged. |

"Met" rule used for the week summary dots: `count` met if value <= `limit`; `yesno` met if value = 1; `rating` met if value >= 6.
In the prototype this table is only the **starting list**; edits (add, log, share, delete) are kept in the browser (section 5). In production it is the source of truth.

### 3.9 `HK.data.customQuestions`  (provider-added questions)

```jsonc
{ "pat-7f3a": [ { "id": "q-1", "dom": "activity", "when": "pm", "type": "yesno", "text": "Did you take the evening walk?" } ] }
```

| Field | Type | Rules |
|---|---|---|
| `id` | string | Unique. (The prototype generates `'c' + Date.now()`.) |
| `dom` | card id | The card the question is filed under. |
| `when` | `"am"` \| `"pm"` \| `"wk"` | Morning, Evening or Weekly. **Only `am` and `pm` questions appear in the check-in**; `wk` is stored and listed in card settings but not asked yet. |
| `type` | `"text"` \| `"yesno"` \| `"scale"` \| `"choice"` | Short answer, yes/no, 0-10 scale, or choices. |
| `text` | string | The question. Required, non-empty. |
| `options` | array of strings | **Required for `choice`** (a `choice` without `options` throws in the check-in). Not used for other types. The builder defaults to `["Yes","Somewhat","No"]` when the provider types none. |

In the check-in, at **Standard** length the first custom question for that time of day is asked; at **Extended** all of them are. They are appended after the card questions. They are a starting list only in the prototype (section 5).

### 3.10 `HK.data.notes`

`patientId -> string`. The provider's private note shown in the "Notes for the next visit" box. Missing = empty.

### 3.11 `HK.data.today`

```jsonc
{ "pat-7f3a": { "amDone": true, "amTime": "7:05 AM", "pmDone": false } }
```

Today's check-in status on the patient's Today screen. Missing = `{ amDone: false, amTime: null, pmDone: false }`.

* `pmDone: true` → the Today screen shows "All done for today" instead of the evening check-in card.
* `amTime`: display text `"h:mm AM"`; when present and the evening is not done it reads "Morning check-in done at 7:05 AM. Nice start."
* `amDone` is stored but currently has **no visible effect** (kept for the next version).

### 3.12 `HK.data.accounts`  (**prototype mock only; remove in production**)

```jsonc
{ "alex.sample@example.org": { "pw": "Test1234!", "role": "patient", "id": "pat-7f3a", "name": "Alex Sample" } }
```

Used for the sign-in form and to detect an already-used invite. It holds **plain-text passwords in the browser**, so it must not exist in production: authentication belongs to the server (see `BACKEND_HANDOFF.md`, section 3). Roles: `provider` (id may be `null`) or `patient` (id = patient id).

### 3.13 `HK.data.cardConfig`  (**new key; needs one small front-end change**)

`patientId -> the card-settings object` (the unlocked cards, default check-in length, automatic-shortening switches, reminder times, quick-log buttons, per-card options and the provider's custom questions). It does **not** exist in the adapter file today because the prototype keeps these settings in the browser; without it, a patient's phone cannot see the provider's quick-log buttons, shortening switches or other options (only the unlocked cards, the default length and the custom questions reach it through other keys). The shape, the one-line change in `js/cards.js` and the reason are in `BACKEND_HANDOFF.md`, section 4.3; the SQL that builds it from your tables is in section 4.3 of this document (`cardConfig`). Missing key or missing patient = the screens fall back to the defaults they build themselves.

---

## 4. Recommended relational schema (SQLite)

Section 3 is the **contract** (the JSON the screens need). This section is a **recommendation** for the tables behind it, written for **SQLite** (the engine the database owner is using). You may design the tables differently; only the output of section 3 is binding. Every table that is keyed by `patient_id` should be deleted/exported together with the patient (see section 9).

**Tested:** every SQL block in this section (set-up, tables, reference load, and every read query in 4.3) was executed on a real SQLite database with example rows (SQLite 3.53 through Python's `sqlite3`) and returned the shapes described. The statements need **SQLite 3.38 or newer** (built-in JSON functions; `STRICT` tables need 3.37). Check yours with `select sqlite_version();`. If it is older, delete the word `STRICT` after each table and make sure the JSON functions exist.

### 4.0 SQLite set-up (do this on every connection)

SQLite has **no user name, password, host or port**: the "connection" is a file path, and whoever can read that file can read every patient's data. So the file's protection is the security (details in section 13). Run these once per connection (they are per-connection settings, except `journal_mode`, which is stored in the file):

```sql
pragma foreign_keys = on;      -- OFF by default in SQLite; without it "on delete cascade" silently does nothing
pragma journal_mode = wal;     -- readers do not block the single writer
pragma busy_timeout = 5000;    -- wait up to 5 s for the write lock instead of failing at once
```

Conventions used by the tables below:

| Need | SQLite storage |
|---|---|
| Id (patient, user, check-in, goal ...) | `text` (URL-safe, section 2) |
| A calendar day (`day`, `joined_on`) | `text` `'YYYY-MM-DD'` in the **patient's local day** (section 4.4); the `check` uses `glob` so a wrong format is refused |
| A moment in time (`created_at`, `completed_at` ...) | `text` ISO 8601 in **UTC** with a `Z`, e.g. `'2026-11-04T13:05:00Z'`; the defaults use `strftime('%Y-%m-%dT%H:%M:%SZ','now')`. SQLite has no time-zone type, so the server (BACKEND) does every zone conversion |
| A clock time of day (reminders) | `text` `'HH:MM'` (24 hour) |
| True / false | `integer` 0 or 1 with a `check`; the BACKEND turns them into JSON `true` / `false` |
| JSON (arrays, objects) | `text` with `check (json_valid(...))` |
| Scores | `real` with a range `check` |
| Auto number | `integer primary key autoincrement` |

### 4.1 Tables at a glance

| Group | Table | Replaces / feeds |
|---|---|---|
| Identity | `app_user` | sign-in (`HK.data.accounts` mock), provider name/e-mail (`HK.config`) |
| Roster | `patient`, `patient_card`, `invite` | `HK.data.patients` (+ `unlocked`, `state`, `invitedOn`) |
| Daily results | `daily_score`, `card_score`, `day_event` | `series`, `domainScores`, `events` |
| Check-ins | `checkin`, `checkin_answer` | `answers`, `week`, `customResults`, `today`, scores |
| Provider settings | `patient_card_config`, `custom_question`, `provider_note` | card settings page, `customQuestions`, `notes` |
| Patient-owned | `private_goal`, `private_goal_log`, `quick_log`, `weekly_reflection`, `saved_idea` | `privateGoals`, quick-log buttons, reflections |
| Reference | `card`, `question`, `barrier`, `quick_log_kind` | the answers query in 4.3 and foreign keys; content is **also** compiled into the screens (section 6) |

### 4.2 Tables

```sql
-- ===== Identity =====
create table app_user (
  id            text primary key,                              -- URL-safe, see section 2
  email         text not null unique check (email = lower(email)),
  password_hash text not null,                                 -- NEVER plain text (the prototype's plain text is mock only)
  role          text not null check (role in ('provider','patient')),
  display_name  text not null,                                 -- provider: shown as HK.config.providerName
  time_zone     text not null default 'America/Chicago',       -- IANA name; decides what "day" means (see 4.4); used by the BACKEND, not by SQL
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  last_login_at text
) strict;

-- ===== Roster =====
create table patient (
  id             text primary key,                             -- appears in URLs (section 2): [A-Za-z0-9_-]
  provider_id    text not null references app_user(id),
  user_id        text unique references app_user(id),          -- set when the patient creates the account (state becomes 'active')
  name           text not null,                                -- first name FIRST (the screens use the text before the first space as the first name)
  email          text not null unique check (email = lower(email)),
  state          text not null default 'none' check (state in ('none','invited','active')),
  is_favorite    integer not null default 0 check (is_favorite in (0,1)),   -- HK patient.fav
  age            integer check (age is null or age between 0 and 130),
  pronouns       text not null default '',
  goal           text not null default '',                     -- "Current goal"
  invited_at     text,                                         -- HK patient.invitedOn is this moment as a local date formatted 'Mon D' (BACKEND formats it)
  length_chosen  text not null default 'standard' check (length_chosen in ('quick','standard','extended')),
  length_now     text not null default 'standard' check (length_now    in ('quick','standard','extended')),
  joined_on      text not null check (joined_on glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),   -- first day on the app = first entry of "series" (section 3.2). For none/invited: the creation date
  last_active_at text,                                         -- HK patient.lastActiveAt (set by the server whenever a check-in completes)
  attention_note text,                                         -- HK patient.flag (optional free text)
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
) strict;
create index patient_provider on patient (provider_id);

create table patient_card (                                    -- one row per UNLOCKED card
  patient_id  text not null references patient(id) on delete cascade,
  card_id     text not null check (card_id in ('activity','diet','mind','sleep','social','substance')),
  position    integer not null,                                -- order of HK patient.unlocked (see note below)
  unlocked_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  primary key (patient_id, card_id)
) strict;

create table invite (                                          -- the e-mail link a patient receives
  id           text primary key,
  patient_id   text not null references patient(id) on delete cascade,
  token_hash   text not null unique,                           -- store only a hash of the secret in the link
  sent_at      text not null default (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  expires_at   text not null,
  accepted_at  text
) strict;

-- ===== Daily results =====
create table daily_score (                                     -- ONE ROW PER DAY THAT HAS A CHECK-IN. Missing day = no row (series gets null)
  patient_id text not null references patient(id) on delete cascade,
  day        text not null check (day glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),   -- the patient's local calendar day
  overall    real not null check (overall between 0 and 100),
  primary key (patient_id, day)
) strict;

create table card_score (
  patient_id text not null references patient(id) on delete cascade,
  day        text not null check (day glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  card_id    text not null check (card_id in ('activity','diet','mind','sleep','social','substance')),
  score      real not null check (score between 0 and 100),
  primary key (patient_id, day, card_id)
) strict;

create table day_event (                                       -- the 1D chart's timeline
  id         integer primary key autoincrement,
  patient_id text not null references patient(id) on delete cascade,
  day        text not null check (day glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  at_hour    real not null check (at_hour between 0 and 24),   -- 8.1 = 8:06 AM (minutes / 60)
  label      text not null,                                    -- "Morning check-in", "Movement logged" ...
  tag        text check (tag is null or tag in ('activity','diet','mind','sleep','social','substance','am','pm'))
) strict;
create index day_event_lookup on day_event (patient_id, day, at_hour);

-- ===== Check-ins =====
create table checkin (
  id           text primary key,
  patient_id   text not null references patient(id) on delete cascade,
  day          text not null check (day glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),   -- patient's local day
  period       text not null check (period in ('am','pm')),    -- morning / evening
  length_used  text not null check (length_used in ('quick','standard','extended')),
  started_at   text not null,
  completed_at text,                                           -- null = abandoned; the screens count only completed ones
  goal_met     text check (goal_met in ('yes','no')),          -- evening only: answer to g-pm-2 (null if not answered)
  unique (patient_id, day, period)                             -- product decision: one per period per day, a repeat replaces the earlier one
) strict;

create table checkin_answer (
  checkin_id  text not null references checkin(id) on delete cascade,
  question_id text not null,                                   -- a seed question id (docs/seed/questions.json), a custom_question.id, or one of: shrink, barrier, repeat
  position    integer not null,                                -- order asked
  value_text  text,                                            -- text, choice, yesno ('yes'/'no'), mood, time ('HH:MM')
  value_num   real,                                            -- scale 0..10
  value_json  text check (value_json is null or json_valid(value_json)),   -- multi (barrier): array of strings, e.g. '["Low energy","Forgot"]'
  primary key (checkin_id, question_id)
  -- A skipped question gets NO row.
) strict;

-- ===== Provider settings =====
create table patient_card_config (                             -- 1 row per patient; the card-settings page (section 5)
  patient_id    text primary key references patient(id) on delete cascade,
  auto_shorten  integer not null default 1 check (auto_shorten in (0,1)),
  offer_longer  integer not null default 1 check (offer_longer in (0,1)),
  remind_am     text    not null default '08:00' check (remind_am glob '[0-2][0-9]:[0-5][0-9]'),
  remind_pm     text    not null default '20:00' check (remind_pm glob '[0-2][0-9]:[0-5][0-9]'),
  skip_if_done  integer not null default 1 check (skip_if_done in (0,1)),
  quick_buttons text    not null default '{"drink":true,"food":true,"urge":false,"smoke":false,"intimacy":false,"drip":false}' check (json_valid(quick_buttons)),
  steps         text    not null default '4,000'  check (steps in ('2,000','4,000','6,000','8,000')),
  photo_log     integer not null default 0 check (photo_log in (0,1)),
  food_ideas    integer not null default 1 check (food_ideas in (0,1)),
  mind_len      text    not null default '3 minutes' check (mind_len in ('1 minute','3 minutes','5 minutes','10 minutes')),
  cbti          integer not null default 0 check (cbti in (0,1)),
  wind_down     text    not null default '21:30' check (wind_down glob '[0-2][0-9]:[0-5][0-9]'),
  social_ideas  integer not null default 1 check (social_ideas in (0,1)),
  sub_goal      text    not null default 'Stay within my limit' check (sub_goal in ('Abstain today','Stay within my limit','Cut back from yesterday')),
  sub_limit     text    not null default 'No more than 2 drinks, and none before 6 PM',
  craving       integer not null default 1 check (craving in (0,1)),
  sub_note      integer not null default 1 check (sub_note in (0,1))
) strict;

create table custom_question (
  id          text primary key,
  patient_id  text not null references patient(id) on delete cascade,
  card_id     text not null check (card_id in ('activity','diet','mind','sleep','social','substance')),
  period      text not null check (period in ('am','pm','wk')),
  qtype       text not null check (qtype in ('text','yesno','scale','choice')),
  body        text not null check (length(body) > 0),          -- HK "text"
  options     text check (options is null or json_valid(options)),   -- required (non-empty JSON array of strings) when qtype = 'choice'
  position    integer not null default 0,
  archived_at text,
  check (qtype <> 'choice' or (options is not null and json_array_length(options) > 0))
) strict;
create index custom_question_open on custom_question (patient_id) where archived_at is null;

create table provider_note (
  patient_id text primary key references patient(id) on delete cascade,
  body       text not null default '',
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
) strict;

-- ===== Patient-owned =====
create table private_goal (
  id          text primary key,
  patient_id  text not null references patient(id) on delete cascade,
  title       text not null check (length(title) between 1 and 60),
  type        text not null check (type in ('yesno','count','rating')),
  unit        text not null default 'times' check (length(unit) <= 16),
  day_limit   integer not null default 0 check (day_limit between 0 and 99),   -- HK "limit"
  shared      integer not null default 0 check (shared in (0,1)),
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  deleted_at  text
) strict;
create table private_goal_log (
  goal_id text not null references private_goal(id) on delete cascade,
  day     text not null check (day glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  value   real not null,                                       -- yesno 1/0, count 0+, rating 0..10
  primary key (goal_id, day)
) strict;

create table quick_log (                                       -- the patient's quick-log buttons (screen: Today)
  id          integer primary key autoincrement,
  patient_id  text not null references patient(id) on delete cascade,
  kind        text not null check (kind in ('drink','food','urge','smoke','intimacy','drip')),
  when_chip   text not null check (when_chip in ('Just now','Earlier today','Last night')),
  note        text,                                            -- optional free text
  logged_at   text not null default (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  day         text not null check (day glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')   -- patient's local day of logged_at
) strict;
create index quick_log_day on quick_log (patient_id, day);

create table weekly_reflection (                               -- "Reflection saved" on the weekly summary
  id          integer primary key autoincrement,
  patient_id  text not null references patient(id) on delete cascade,
  question_id text not null,                                   -- a "wk" question id from docs/seed/questions.json
  body        text not null,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
) strict;
create table saved_idea (                                      -- "Saved to your ideas" (no screen reads this yet)
  patient_id  text not null references patient(id) on delete cascade,
  card_id     text not null,
  title       text not null,                                   -- resource title from docs/seed/cards.json
  saved_at    text not null default (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  primary key (patient_id, card_id, title)
) strict;

-- ===== Reference (loaded from docs/seed, see below) =====
create table card (id text primary key, name text not null, short text not null, icon text not null, provider_tailored integer not null default 0 check (provider_tailored in (0,1))) strict;
create table question (
  id text primary key, card_id text references card(id),         -- card_id is null for the general goal questions (g-am-*, g-pm-*)
  period text not null check (period in ('am','pm','wk')), position integer not null,
  role text not null, qtype text not null check (qtype in ('text','choice','yesno','scale','time','mood')),
  body text not null, options text check (options is null or json_valid(options))
) strict;
create table barrier (label text primary key) strict;
create table quick_log_kind (id text primary key, label text not null, short text not null, icon text not null, default_on integer not null check (default_on in (0,1)), sensitive integer not null default 0 check (sensitive in (0,1))) strict;
```

**Loading the reference tables** (`docs/seed/*.json`, section 6). The screens do **not** read these tables; the same content is compiled into `js/data.js`. `checkin_answer.question_id` stays a plain text column (it can also hold custom question ids and `shrink`, `barrier`, `repeat`). Run this Python once after creating the tables (standard library only; run it from the folder that holds `docs/seed`; replace `hk.db` with your file):

```python
import json, sqlite3
con = sqlite3.connect('hk.db'); con.execute('pragma foreign_keys = on')
seed = lambda f: json.load(open('docs/seed/' + f))
con.executemany('insert into card values (?,?,?,?,?)',
    [(c['id'], c['name'], c['short'], c['icon'], int(c['providerTailored'])) for c in seed('cards.json')])
con.executemany('insert into question values (?,?,?,?,?,?,?,?)',
    [(q['id'], q['card'], q['when'], q['position'], q['role'], q['type'], q['text'],
      json.dumps(q['options']) if q['options'] is not None else None) for q in seed('questions.json')])
con.executemany('insert into barrier values (?)', [(b,) for b in seed('barriers.json')])
con.executemany('insert into quick_log_kind values (?,?,?,?,?,?)',
    [(k['id'], k['label'], k['short'], k['icon'], int(k['on']), int(bool(k.get('sensitive')))) for k in seed('quick-log.json')])
con.commit()
print([con.execute('select count(*) from ' + t).fetchone()[0] for t in ('card', 'question', 'barrier', 'quick_log_kind')])   # expect [6, 77, 7, 6]
```

**`position` in `patient_card`.** The weekly summary and weekly report list the cards in the **order of `unlocked`**; the patient page and the card-settings page always list the six cards in the fixed order. Recommended: send `unlocked` in the fixed order `activity, diet, mind, sleep, social, substance`, i.e. set `position` from that order. (The prototype appends a newly unlocked card at the end; either is accepted, but keep one rule.)

### 4.3 How to build each `HK.data` key

All queries below are for the **signed-in provider's roster**. They use named parameters (`:name`, as in Python's `sqlite3`). `:today` is the viewer's local date as `'YYYY-MM-DD'` (section 4.4). `:ids` is a **JSON array text** of patient ids, e.g. `'["pat-7f3a","pat-90bc"]'` (build it with `json.dumps`). For a patient's own session return only that patient's rows.

SQLite returns JSON as **text**: in the BACKEND, `json.loads` each JSON column before putting it into the response (or use `json(...)` and send the text as is). SQLite also has no `true` / `false` columns, so the queries return 0 / 1; the BACKEND turns them into JSON booleans.

**`patients`** (section 3.2):

```sql
select p.id, p.name, p.email, p.state,
       p.is_favorite                          as fav,                -- 0/1 -> boolean in the BACKEND
       p.age, p.pronouns, p.goal,
       p.invited_at                           as invited_at,         -- the BACKEND formats it as 'Nov 2' (local date, see invitedOn below); null if never invited
       p.length_chosen as lengthChosen, p.length_now as lengthNow,
       p.last_active_at as lastActiveAt,                             -- ISO 8601 UTC with Z
       p.attention_note as flag,
       (select json_group_array(card_id) from (select card_id from patient_card c where c.patient_id = p.id order by c.position)) as unlocked,   -- JSON text
       (with recursive d(day) as (select p.joined_on union all select date(day, '+1 day') from d where day < :today)
        select json_group_array(json_object('d', d.day, 'score', s.overall))
        from d left join daily_score s on s.patient_id = p.id and s.day = d.day) as series                                                          -- JSON text, oldest first
from patient p
where p.provider_id = :provider_id;
```
`series` must be **dense** (one entry per calendar day from `joined_on` to today, `score` null where no check-in); the recursive `d` above (a day counter) plus the `left join` does exactly that. If a day is a gap in `daily_score` it is correctly `null`. For `none` / `invited` patients send `series: []` (or omit it). `invitedOn` is a display string: `Mon` + space + day without leading zero, English, from `invited_at` converted to the viewer's zone (section 4.4); send `null` when `invited_at` is null. SQLite cannot convert time zones, so do this in application code (Python: `datetime.fromisoformat(s.replace('Z','+00:00')).astimezone(ZoneInfo(tz))`, then `f"{dt:%b} {dt.day}"`).

**`domainScores`** (3.3):

```sql
select patient_id, day as d,
       json_group_object(card_id, cast(round(score) as integer)) as scores     -- JSON text
from card_score
where patient_id in (select value from json_each(:ids)) and day >= :from_day
group by patient_id, day;     -- fold into {patient: {day: {card: n}}}
```
The patient page and weekly screens need only the **last 14 days** (this week and the week before). The chart's "what changed" panel, however, compares card scores for **any two points or windows the user selects on any range** (it averages the card scores of every scored day in the window), so send the card scores of **every day that has an Overall Score** (`:from_day` = the patient's `joined_on`); a day without card scores is counted as `--`.

**`events`** (3.4):

```sql
select patient_id, day as d,
       json_group_array(json_array(at_hour, label, tag)) as ev                 -- JSON text
from (select * from day_event order by patient_id, day, at_hour)
where patient_id in (select value from json_each(:ids)) and day >= :from_day
group by patient_id, day;
```
(The inner `order by` makes the events come out in time order; if you want a guarantee, sort each list by its first element in application code.) Events are read for (a) the **1D** chart, which always shows **today**; (b) a one-day **Custom** window on the chart, which can show **any past day**; and (c) the "Last check-in" time of the most recent check-in day (only when that day is today or yesterday). The screens never ask for events on demand: whatever is **not** in `HK.data.events` shows "No data to show" on the 1D chart. So send events for **every day that has an Overall Score** if you want every one-day window to work (about 6 to 10 small rows per day), or accept that days you leave out show "No data to show".

**`answers`** (3.5): up to the newest ~10 rows per patient; each is a text answer to a card question:

```sql
select c.day as d,
       case c.period when 'am' then 'Morning' else 'Evening' end as "when",
       q.card_id as dom,                       -- card id of the question (the question table above)
       a.value_text as txt,
       (select j.value from json_each(ba.value_json) j limit 1) as barrier   -- optional: first barrier named in the same check-in
from checkin c
join checkin_answer a  on a.checkin_id = c.id and a.value_text is not null
join question q        on q.id = a.question_id and q.qtype = 'text' and q.card_id is not null
left join checkin_answer ba on ba.checkin_id = c.id and ba.question_id = 'barrier'
where c.patient_id = :id and c.completed_at is not null
order by c.day desc, c.period desc, a.position
limit 10;
```
This is only one possible rule (see the note in 3.5). Custom-question answers are not shown in this list (their `dom` would be the question's card; you may include them if you want).

**`week`** (3.6): for each patient, with `:today` and the window `[today-6, today]` (this week) and `[today-13, today-7]` (before). `date(:today, '-6 day')` is how SQLite subtracts days from a `'YYYY-MM-DD'` text:

```sql
-- barriers: label -> number of DAYS it was named in the last 7 days, most common first
select j.value as label, count(distinct c.day) as days
from checkin c join checkin_answer a on a.checkin_id = c.id and a.question_id = 'barrier', json_each(a.value_json) j
where c.patient_id = :id and c.completed_at is not null and c.day between date(:today, '-6 day') and :today
group by j.value order by days desc, j.value;

-- conf: average of the 0-10 answer to g-am-5 (morning confidence); null if none
select avg(a.value_num) as conf from checkin c join checkin_answer a on a.checkin_id = c.id and a.question_id = 'g-am-5'
where c.patient_id = :id and c.completed_at is not null and c.day between date(:today, '-6 day') and :today;
-- pconf: the same query with   between date(:today, '-13 day') and date(:today, '-7 day')

-- checkins: completed check-ins (am + pm) in the last 7 days (0..14)
select count(*) as checkins from checkin where patient_id = :id and completed_at is not null and day between date(:today, '-6 day') and :today;
```
Round `conf`/`pconf` to one decimal if you like; the screens round for display.

**`customResults`** (3.7): one text line per custom question **for the last 7 days**. The code only requires text; a reasonable rule per type: `yesno` → `"Yes 5, No 2"`; `scale` → `"Average 6.4 out of 10"` (or `"Average 6.4"`); `choice` → `"Somewhat 3, Yes 2"` (each option, most common first); `text` → `"4 answers"`. Empty when there are no answers (the screen then says "No answers yet").

**`privateGoals`** (3.8): from `private_goal` (where `deleted_at is null`) with `log` assembled from `private_goal_log` as `{ 'YYYY-MM-DD': value }`. **Provider requests must add `and shared = 1`** (section 9); the patient's own request returns every goal.

**`customQuestions`** (3.9): `select id, card_id as dom, period as "when", qtype as type, body as text, options from custom_question where patient_id = :id and archived_at is null order by position, id` (`options` is JSON text or null: `json.loads` it).

**`cardConfig`** (3.13, new key): one object per patient, built from `patient_card` (`unlocked`, in `position` order), `patient.length_chosen` (`length`), `patient_card_config` (every other key, camelCase) and `custom_question` (`custom`, same rows as `customQuestions`). Every patient has exactly one `patient_card_config` row (create it together with the patient):

```sql
select json_object(
  'unlocked',    json((select json_group_array(card_id) from (select c.card_id from patient_card c where c.patient_id = p.id order by c.position))),
  'length',      p.length_chosen,
  'autoShorten', json(iif(k.auto_shorten, 'true', 'false')),  'offerLonger', json(iif(k.offer_longer, 'true', 'false')),
  'remindAm',    k.remind_am,  'remindPm', k.remind_pm,  'skipIfDone', json(iif(k.skip_if_done, 'true', 'false')),
  'quick',       json(k.quick_buttons),
  'steps',       k.steps,  'photoLog', json(iif(k.photo_log, 'true', 'false')),  'foodIdeas', json(iif(k.food_ideas, 'true', 'false')),  'mindLen', k.mind_len,
  'cbti',        json(iif(k.cbti, 'true', 'false')),  'windDown', k.wind_down,  'socialIdeas', json(iif(k.social_ideas, 'true', 'false')),
  'subGoal',     k.sub_goal,  'subLimit', k.sub_limit,  'craving', json(iif(k.craving, 'true', 'false')),  'subNote', json(iif(k.sub_note, 'true', 'false')),
  'custom',      json(coalesce((select json_group_array(json(case when q.options is null
                                  then json_object('id', q.id, 'dom', q.card_id, 'when', q.period, 'type', q.qtype, 'text', q.body)
                                  else json_object('id', q.id, 'dom', q.card_id, 'when', q.period, 'type', q.qtype, 'text', q.body, 'options', json(q.options)) end))
                          from (select * from custom_question where patient_id = p.id and archived_at is null order by position, id) q), '[]'))
) as config
from patient p join patient_card_config k on k.patient_id = p.id
where p.id = :id;
```
The prototype's custom-question objects have no `options` key unless the type is `choice` (hence the two `json_object` forms). The times are stored as `HH:MM` text, so they need no formatting. Which keys have a visible effect today: section 5 of this document.

**`notes`** (3.10): `select body from provider_note where patient_id = :id` (only for the provider who owns the patient).

**`today`** (3.11): for the patient's local `:today`:

```sql
select max(period = 'am' and completed_at is not null) as amDone,        -- 1 / 0 (null when there is no check-in row at all: send false)
       max(case when period = 'am' and completed_at is not null then completed_at end) as amCompletedAt,   -- UTC text; the BACKEND shows it as "7:05 AM" in the viewer's zone
       max(period = 'pm' and completed_at is not null) as pmDone
from checkin where patient_id = :id and day = :today;
```
(null `amTime` when there is no morning check-in; `max` of nothing is null: send `false`.) Convert `amCompletedAt` in application code with the same method as `invitedOn`, formatted `"7:05 AM"` (12 hour, no leading zero, `AM`/`PM`).

**`accounts`**: do **not** build; delete this key in production (section 3.12).

**`HK.config`**: `providerName` = the provider's `display_name` (for a patient's session: their provider's name), `providerEmail` = the provider's e-mail (provider screens only), `now = null`, `defaultScore` = see section 8, `demoLogins = []`, `demoNote = ''`.

### 4.4 What "today" and "day" mean (time zones)

SQLite stores `day` as plain text and cannot convert zones, so **the BACKEND decides the day** and writes it into `daily_score.day`, `checkin.day`, `quick_log.day` and the others; SQL only compares those text values.

The screens decide "today" from the **browser's** local date. If the stored `day` keys use a different time zone from the viewer's browser, the "today" lookups miss (for example the patient's Today chips look up the card scores of the browser's today key and show `--`), and a check-in made late in the evening can appear on the wrong day. The simplest correct rule: **every patient and the provider use one time zone per deployment** (`app_user.time_zone`, default shown above), the server computes `day` from `completed_at` in that zone, and `:today` is the same zone's current date. If you must support several zones, serve each viewer day keys in that viewer's zone.

### 4.5 Indexes and constraints you should keep

* Primary keys above (they also serve the `patient_id, day` lookups).
* `day_event (patient_id, day, at_hour)`; `quick_log (patient_id, day)`; `checkin (patient_id, day)` (the unique constraint already provides it).
* `unique (patient_id, day, period)` on `checkin` is a **product decision** (the prototype has no repeat rule; one morning and one evening per day matches the Today screen, which shows "All done for today" after the evening check-in).
* Delete rules: `on delete cascade` from `patient` makes "delete this patient" one statement (privacy, section 9) **only when `pragma foreign_keys = on` is set on that connection** (section 4.0).
* Writers: SQLite allows **one writer at a time**. Keep write transactions short (one request = one transaction), use the `busy_timeout` above, and let all server processes share the same file on **local disk** (not a network share).

---

## 5. Data the prototype keeps only in the browser (must become real tables)

In the prototype these actions look like they work but change **nothing on a server**; most are kept in the browser's `localStorage` (keys are prefixed `hk.`) or only in memory until the page closes. The BACKEND replaces each action with an API call (see `BACKEND_HANDOFF.md`, section 5); you provide the table it writes to.

| What the user does | Where in the prototype | Kept in | Target table / column |
|---|---|---|---|
| Add a patient (name, e-mail, check-in length) | `provider.js` `createPatient` / `addPatient` | `localStorage hk.newPatients` | `patient` (+ default `patient_card` rows, `patient_card_config`) |
| Import a roster (paste "Name, e-mail" lines) | `provider.js` `bulkInviteDialog`, `parseRoster` | same as above | many `patient` rows (+ `invite` if "send invites" is chosen) |
| Send / resend an invite | `provider.js` `sendInvite`, `setEnroll` | `localStorage hk.enroll` | `invite` row, `patient.state` = `invited`, `patient.invited_at` |
| Patient creates the account from the invite page | `login.js` (invite route) | `localStorage hk.extraAccounts` (plain-text password!) | `app_user` row, `patient.user_id`, `patient.state` = `active`, `invite.accepted_at` |
| Mark a patient as favorite | `patient-page.js` `#favBtn` | memory (+ `sessionStorage hk.state`) | `patient.is_favorite` |
| Save the note "Notes for the next visit" | `patient-page.js` `#noteSave` | nothing ("Note saved (prototype only)") | `provider_note` |
| Change card settings (unlock/lock cards, check-in length, reminders, quick-log buttons, per-card options, custom questions) | `cards.js` `cfg` / `saveCfg` | `localStorage hk.cfg.<patientId>` | `patient_card`, `patient.length_chosen`, `patient_card_config`, `custom_question` |
| Complete a check-in (answers) | `checkin.js` `finish()` | nothing (the placeholder score bump is computed in the page) | `checkin`, `checkin_answer`, then `daily_score`, `card_score`, `day_event`, `patient.last_active_at` |
| Quick-log a drink / snack / craving / etc. | `patient-app.js` (`[data-ql]` sheet) | memory counters | `quick_log` |
| Accept or decline "try the longer check-in again" / switch back | `patient-app.js` (`[data-offer]`, `[data-adapt]`) | memory | `patient.length_now` |
| Private goals: add, log today, share/unshare, delete | `private.js` `privGoals` / `privSave` | `localStorage hk.priv.<patientId>` | `private_goal`, `private_goal_log` |
| Weekly reflection ("Reflection saved") | `week.js` `#wrsave` | nothing (toast only) | `weekly_reflection` |
| "Save to my ideas" on a resource | `patient-app.js` (`[data-save]`) | nothing (toast only) | `saved_idea` (no screen reads it yet) |
| Session (who is signed in) | `login.js`, `hk-state.js` | memory + `sessionStorage hk.state` | server session / token |
| Screen preferences: theme, patient-list sort, list height, chart size, chart range, pet mood demo | `core.js` `store` | `localStorage hk.theme`, `hk.sort`, `hk.listH2`, `hk.chartSize`, `hk.chartRange`, `hk.petMood` | **leave in the browser** (device preferences, no table needed) |

Not in this list because nothing triggers them yet: the reminder times (`remind_am`, `remind_pm`, `skip_if_done`) are **stored** by the card-settings page but **no screen sends a reminder**; a scheduler would read them (BACKEND, section 6 of its document).

**Card-settings keys that have a visible effect on patient screens today** (everything else is stored and shown only on the settings page, as instructions for later versions): `unlocked` (which cards are asked), `length` (default check-in length), `autoShorten`, `quick` (which quick-log buttons the patient sees on Today) and `custom` (extra questions in the check-in and the weekly report). Keys `steps`, `photoLog`, `foodIdeas`, `mindLen`, `cbti`, `windDown`, `socialIdeas`, `subGoal`, `subLimit`, `craving`, `subNote`, `offerLonger`, `remindAm`, `remindPm`, `skipIfDone` are saved but not read by any patient screen yet.

**New patient defaults used by the prototype** (the server should do the same when it creates a patient): `state` = `none`, `unlocked` = `activity, diet, mind, sleep, social` (**not** `substance`), `length` = the chosen length (default `standard`) for both `length_chosen` and `length_now`, `goal` = `"Goal to be set at the first visit"`, `age` = null, `pronouns` = `''`, `fav` = false, one empty series entry for the creation day. Card-settings defaults are in the DDL above (they match `js/cards.js`).

## 6. Reference (seed) data: `docs/seed/*.json`

Generated **from the real source files** (the files contain only what the code contains). The screens use this content from `js/data.js` and other script files, **not** from the database, so changing the JSON or a table does **not** change the screens. The files are here so that (a) you can create foreign keys and validate ids, and (b) the BACKEND knows the valid ids and wording.

| File | Content | Used for |
|---|---|---|
| `cards.json` | 6 cards: `id`, `name`, `short`, `icon`, `providerTailored`, `blurb`, `definition`, `why`, `practice`, `note`, `ideas[]`, `weeklyQuestions[]`, `resources[]` (`kind`, `title`, `len`, `energy`) | `card` table; valid card ids |
| `questions.json` | 77 questions: `id`, `card` (null for the general goal questions), `when` (`am`/`pm`/`wk`), `position`, `role` (`primary`, `follow-up`, `main`, `weekly`, `primary-plus-yes-no`, `not-met-reflection`), `type` (`text`, `choice`, `yesno`, `scale`, `time`, `mood`), `text`, `options`, `allowOther`, `placeholder`, `default`, `photoOptional`, `adaptive`, `teamSuggested` | `question` table; valid `checkin_answer.question_id` values |
| `barriers.json` | the 7 barrier labels (`Low energy`, `Ran out of time`, `My mood`, `Forgot`, `Plans changed`, `Pain or illness`, `Something else`) | the multi-choice "What got in the way today?" answers; `week.barriers[].label` and `answers[].barrier` should use these labels |
| `quick-log.json` | 6 quick-log buttons: `id`, `label`, `short`, `icon`, default `on`, optional `sensitive`/`note` | `quick_log.kind` values and `patient_card_config.quick_buttons` keys |
| `check-in-lengths.json` | `quick` / `standard` / `extended`, minutes 1 / 3 / 5 | `length_*` columns |
| `status-labels.json` | the 6 status ids and display labels | read-only (the status is derived, section 7) |
| `goal-ideas.json`, `resource-steps.json`, `pip-pet.json`, `private-goal-types.json`, `validation.json` | UI constants (example goal ideas, resource how-to steps, pet moods and lines, private goal types, validation rules) | reference only |

**Question semantics the BACKEND needs when it builds scores** (derived from the code):

* `period` `am` / `pm` / `wk`; the check-in asks `am` or `pm` questions; `wk` questions appear only on the weekly summary as reflection prompts.
* Special answers that are not in `questions.json`: `shrink` (offered after a morning confidence of 4 or lower, 4 fixed choices: "Do half of it", "Do a 5-minute version", "Pick a different goal", "Keep it as it is"), `barrier` (the barriers multi-select, offered when the evening goal answer is "No"), and `repeat` (3 fixed choices, offered when `barrier` includes "Low energy"). They are stored in `checkin_answer` under those three ids.
* Answer value formats (what each question type produces in the browser): `text` string; `choice` the chosen option string (the extra choice "Something else" is stored as the literal text `Something else`; no free text is collected); `yesno` `"yes"` or `"no"`; `scale` integer 0 to 10; `time` `"HH:MM"` (24-hour); `mood` one of `Low`, `Okay`, `Good`, `Great`; `multi` (barriers only) array of strings.
* The evening primary question `g-pm-1` ("What did I do today toward my goal?") is a text answer **plus** the yes/no question `g-pm-2` ("Did I meet my goal today?"), shown together; both are stored as separate answers. `g-pm-2` drives the adaptive follow-ups (yes: `g-pm-3`, `g-pm-4`; no: `barrier`, then `g-pm-6`).
* A skipped question has no stored answer; the "keep going" screen after a Quick check-in is not a question.

## 7. Values the browser derives (do not store them; know the formulas)

These are computed in the browser from the tables in section 3. They are listed so you can predict what the screens will show for your data and so a test can compare them.

**Per patient (`analyze`, in `js/data.js`)**, with `s` = the series (oldest first), `TODAY` = the browser's local date:

* `lastDate` / `today` = date / score of the **last entry whose score is not null** (`today` is therefore *not necessarily today's* score).
* `daysSince` = whole days between today and `lastDate`.
* `lastN` = the last **7 entries**; `prevN` = entries **from −28 up to −7** (21 entries). `mean` ignores nulls and returns "none" if all are null. `delta7` = mean(lastN) − mean(prevN) if both exist, else 0.
* `checkins` = number of entries with a non-null score.
* `lastActive` text: `daysSince = 0` → `Today` + clock; `1` → `Yesterday` + clock; otherwise `N days ago`. The clock (`, h:mm AM/PM`) comes from `lastActiveAt` (browser-local hour and minute). After the page has started, for patients whose last score is today or yesterday the clock is **replaced** by the latest event hour of that day (events with `tag` null **and** label `Woke up` ignored; if there is no other event the `lastActiveAt` text stays).
* No score at all: status `new`, `lastActive` = "No check-ins yet", reason "Account created, waiting for the first check-in".
* **Status**, applied in this order (first match wins):
  1. `state = invited` → status `invited`, reason `Invite sent <invitedOn or "recently">`, `lastActive` "—". `state = none` → status `none`, reason "Added, not invited yet".
  2. `checkins < 14` → `new` ("New on the app"), reason `Started N days ago` (N = days since the first entry).
  3. `daysSince ≥ 3` → `attention`, reason `No check-in for N days`.
  4. `delta7 ≤ −9` → `attention`, reason = `flag` if present, else `Score down N points this week`.
  5. `delta7 ≤ −4` **or** `daysSince = 2` → `watch` ("Keep an eye"), reason `Missed the last two days` (when `daysSince = 2`) else `Score slipping, down N points`.
  6. otherwise `good` ("On track"), reason `Goals mostly met this week` (`Score up N points this week` when `delta7 ≥ 6`).
* **Streak** (patient page, Today): count of consecutive non-null entries ending at the last entry (if the last entry is null, start from the one before it).
* **Provider list counters**: patients, active, "checked in today" (= active **and** `daysSince = 0` **and** score not null), needing attention, favorites, invited, not invited.

**Weekly screens** (patient and provider versions; `week.js`): `days` = the last 7 **calendar dates** ending today (by date, not by entry), `prev` = the 7 dates before. `avg` / `pavg` = mean of non-null scores; `delta` = `avg − pavg`. Per unlocked card: daily card scores for the 7 days, `met` = number of days with card score **≥ 62**, `avg`, `pavg`. `have` = days with a score. Weekly report **patterns**, in this order: (1) top barrier with 3+ days; (2) the card with the **fewest** met days (always shown when at least one card is unlocked; ties go to the first in `unlocked` order); (3) `lengthNow` differs from `lengthChosen`; (4) average confidence below **5.5**; if none was added, "Nothing flagged this week". The confidence arrow = `(conf − pconf) × 5` points.

**Patient page "This week by card"**: for each unlocked card, the mean of that card's score over the **last 7 entries** (non-null days) and the same for entries 8 to 14 from the end; the arrow is the difference.

**Patient Today screen**: rating word by score: 85+ "A great day", 70+ "A good day", 55+ "A steady day", 40+ "A tough day. Small steps count.", else "A rough day. Be gentle with yourself." Pet mood: no score → `content`; score < 38 → `down`; sleep card score < 44 → `tired`; score ≥ 72 → `happy`; score ≥ 50 → `content`; otherwise `tired`. The rating shown is the patient's last non-null score (or `HK.config.defaultScore` if none); the ring is score/100.

**Chart** (`js/chart.js`): the range buttons are **1D, 7D, 1M, 6M, 1Y, 5Y** plus **Custom**. 1D = today's events; 7D = the past 7 days with two points per day (the morning point is a placeholder, the evening point is the day's score); 1M (30 days) and 6M (182 days) = one point per day; 1Y (365 days) = weekly averages; 5Y (1,826 days) = monthly averages. If the window starts before the patient's first entry, the chart starts at the first entry ("Since <date>"). A **Custom** window picks the view by its length: 1 day = intraday (events), 2 to 14 days = morning/evening points, up to 100 days = one point per day, up to 420 days = weekly averages, longer = monthly averages.

## 8. Values the BACKEND and DATABASE must calculate

### 8.1 The Overall Score and the card scores (the central open item)

* **Overall Score** = one number 0 to 100 per patient per day with a check-in → `daily_score.overall`. **Card score** = one number 0 to 100 per unlocked card per such day → `card_score.score`.
* **What the screens promise the user** (the "How the Overall Score works" dialog, word for word in meaning): the Overall Score "averages the day's answers across the cards you unlocked (goal met, confidence, mood and sleep), with equal weight per card", and the dialog marks this as a **"placeholder formula for the prototype; the final version will be set with the practitioner and the data team"**. The code contains **no scoring formula**: today the score comes only from the data you supply.
* The "what changed" panel treats the Overall Score as the **average of the card scores** (it distributes a change across cards and adjusts the steps so they add up to the overall change). Use `overall = average of the unlocked cards' scores` unless the front end is changed too.
* The scoring rule (how each answer becomes a card score) must be **defined with the practitioner and the data owners**. This document does not invent it. The only inputs the code names are: the **goal met** answer (`g-pm-2`), the morning **confidence** (`g-am-5`), the **mood** answer (`g-pm-4`, `act-pm-2`, values `Low` / `Okay` / `Good` / `Great`) and the **sleep** answers.
* "Goal met for a card on a day" in the weekly screens means **card score ≥ 62** (a threshold fixed in the code; it must agree with your scoring).

### 8.2 What the prototype does at check-in time (placeholder to replace)

When a patient finishes a check-in, the page computes a **placeholder bump** and adds it to the number shown on screen; it is not saved. `bump = round(k × n + g)` where `n` = number of answered questions, `k` = 0.6 (morning) or 0.9 (evening), and `g` = +3 if the evening goal answer is "yes", −1 if "no", else 0. The shown score becomes `clamp(previous score + bump, 0, 99)`, with `previous score` = the day's existing score or `HK.config.defaultScore` (56). The finish screen shows the change ("+N from your check-in") and the first 5 answers. In production the server should save the check-in, calculate the real scores and return the new Overall Score and card scores for that day (see `BACKEND_HANDOFF.md`, section 5).

### 8.3 Placeholder values the chart invents (only because richer data does not exist yet)

* **1D chart**: one point per event, starting at the previous scored day's score and ending at the day's final score, with small seeded random noise (standard deviation 2.4; every value clamped to 4 to 99). The points between are **not real running scores**.
* **7D chart**: the morning point of each day is `previous scored day + 0.4 × (day − previous) + noise (standard deviation 1.6)`, or `day − 4` if there is no earlier scored day; the evening point is the real day score. The "what changed" breakdown for a morning point uses the same 0.4 rule on card scores.
* If you later want real intraday values, store a running score per event (`day_event.score`) and change the chart to read it; that is a front-end change, not planned now.

### 8.4 Adaptive rules whose triggers are **not defined in the code**

| Behavior | What exists in the code | What the BACKEND must decide/implement |
|---|---|---|
| Shorten the check-in automatically when questions are skipped (`length_now` becomes `quick`) | Only the **screens** that react to `length_now ≠ length_chosen` (banner on the check-in, notices on Today and the weekly report) and two **demo buttons** on the Today notes panel | The trigger (e.g. how many skipped questions over how many check-ins), updating `patient.length_now`, honoring `patient_card_config.auto_shorten` |
| Offer the longer check-in again after "a week of steady check-ins" | The offer card on Today (`[data-offer]` yes/no); `S.offer` is set by the demo button | The trigger (the text says 7 days in a row), updating `length_now`, honoring `offer_longer`; a way for the screen to know the offer is pending (the prototype keeps it in memory) |
| "Low energy has come up three days in a row" prompt | Shown after **one** "Low energy" barrier answer in the check-in (the code does not count days) | Whether to keep the one-answer trigger or implement the 3-day count (a front-end change) |
| Reminders (morning/evening, skip if already checked in, wind-down time) | Settings page only | A scheduler/notification channel using `remind_am`, `remind_pm`, `skip_if_done`, `wind_down` |
| Invite e-mail | A preview dialog only | Sending the e-mail (BACKEND) |

### 8.5 Values the BACKEND/DATABASE produce for the weekly screens

`week.barriers`, `week.conf`, `week.pconf`, `week.checkins`, `customResults`, `answers`, `events` (section 4.3 gives a query or rule for each), plus `lastActiveAt` and `today` (section 3.11).

## 9. Access rules and privacy (data layer)

* **Provider sees only their own patients.** `patient.provider_id` must be checked on **every** query (rows for another provider's patient must be impossible to request by changing an id in the URL).
* **A patient sees only their own rows**, and a patient's session must **not** receive the roster. The prototype's pages load the whole roster in the browser for everyone; the BACKEND must serve each page only the data its signed-in user may see (see `BACKEND_HANDOFF.md`, section 3).
* **Private goals**: a goal is visible to the provider **only if `shared = true`** (the patient's choice, changeable at any time; unsharing hides it again). **Unshared goals and their logs must never be sent to a provider's browser**, even hidden; filter on the server. The patient's own screens show all of their goals.
* **Sensitive quick-log kinds**: `intimacy` (sexual activity) and `drip` (self-harm urge) are marked `sensitive` in the code (`docs/seed/quick-log.json`); both are **off by default** and only appear if the provider turns them on in card settings. Treat their rows with the strictest access (patient, plus the provider only if you decide that is clinically allowed). No provider screen shows quick logs today.
* **Provider notes** are private to the provider (never sent to the patient).
* **Passwords** are stored as salted hashes (the prototype's plain-text mock must not be copied). E-mails are stored lower-case.
* **Closed loop**: the screens' wording promises that answers "stay on a private server and are never shared with other companies". Keep all patient data on your own server; no third-party analytics scripts are loaded by the pages (none are included today).
* **Delete / export**: every table with `patient_id` cascades from `patient` so one patient's data can be exported or removed together.
* **Logging**: do not write answer text, notes or goals to server logs.

## 10. Volume and performance

* Series: one `daily_score` row per patient per day with a check-in (about 365 per year); 5 years ≈ 1,826 entries per patient in the JSON.
* `card_score`: up to 6 rows per scored day. `day_event`: about 6 to 10 rows per scored day. `checkin_answer`: about 3 to 20 per check-in (Quick ≈ 1, Standard ≈ 3 to 8, Extended up to ≈ 20).
* Example: 200 patients × 365 days × (1 + 6 + 8) rows ≈ 1.1 million small rows per year. Fine for any ordinary SQL engine with the keys above.
* The screens load the **whole** `HK.data` once per page (every page is a separate file and loads it again). For a provider with a large roster send **only** the tables a page needs (see `BACKEND_HANDOFF.md`, section 4) and consider the last 90 days of per-day tables unless the long ranges (1Y, 5Y) are needed.
* The provider list renders every patient (no paging) and each patient needs `series` to compute the status. For rosters above a few hundred patients, a "summary" endpoint that sends only `series` for the last 28 days plus `joined_on`/`checkins` count would be needed, and the screens would have to change; not required now.

## 11. Check that your data works (load check)

1. Fill the tables, build the JSON for **one** patient of each state (`none`, `invited`, `active` with a long history, `active` with fewer than 14 check-ins, `active` with no check-in).
2. Put it into the screens exactly like the example: copy `docs/examples/hk-data.sample.js`, replace its content with your output, and add `<script src="docs/examples/hk-data.sample.js"></script>` **right after** `js/hk-data.js` on every page. Open `login.html` and sign in with an account from your `accounts` key (the shipped example has `provider@example.org` and `alex.sample@example.org`, both with the mock password `Test1234!`; the sign-in mock exists only for this check).
3. Open the browser console: there must be **no red errors** on any of the 10 pages.
4. Check against your data: the provider list shows one row per patient with the right status label (section 7), the patient page shows the 7-day card bars, the chart shows your series for every range, the patient's Today shows the rating, and the weekly report shows barriers, confidence and check-in counts.
5. Dense series check (run in SQL): for every active patient, `count(series entries) = today − joined_on + 1`.

## 12. Planned additions (**do not build yet**)

These came from a meeting with the practitioner and are **not** in the prototype; nothing in the tables or screens above depends on them. They are recorded so the design leaves room.

1. **Private and public logs, with tags.** Patients (and practitioners) create logs that are private or visible to the provider; a log has tags.
2. **Practitioner-made quick logs** (quick-log buttons created by the practitioner, beyond the 6 fixed ones).
3. **Optional daily-goal follow-up and reminder** (a nudge about the daily goal later in the day).
4. **Pip (the pet) suggesting ideas for the morning goal.** (Evening ideas were removed from the plan.)
5. **Menstruation tracking** as a private log template.
6. **Monthly PHQ-9 and GAD-7 questionnaires, stored as data** (scores per month; questionnaire wording is not part of this handoff).
7. **User-created reusable and shareable tags.**

If you want to leave room: use `text` ids for log and tag tables, keep every new table keyed by `patient_id` so section 9's cascade rule holds, and keep an `is_private` flag from the first version (default private).

---

## 13. Setup, file protection and hand-off to the BACKEND owner

### 13.1 There are no database credentials (SQLite) and none in this folder

SQLite has **no user name, password, host, port or connection string**. The "connection" is the **path of one file** (for example `/srv/hk/hk.db`), and the only protection is who can read that file. Nothing in the delivered folder is a secret: the only logins are the made-up example ones in `js/hk-example-data.js` (`provider@example.org` and `alex.sample@example.org`, password `Test1234!`; delete that file for real use). What you must do instead of managing credentials:

1. **Put the file outside the web server's public folder** and outside the git repository (add `*.db`, `*.db-wal`, `*.db-shm` to `.gitignore`).
2. **Give it to one service user only.** SQLite in WAL mode (section 4.0) also creates `hk.db-wal` and `hk.db-shm` next to the file; they hold recent data, so they need the **same** protection. Suggested: directory mode `700`, files mode `600`, owned by the account that runs the BACKEND.
3. **Only the BACKEND process opens the file.** The browser never gets it; analytics or AI jobs read a **copy** or use the BACKEND, never the live file.
4. **Encryption at rest is not built in.** If the data must be encrypted, use disk or volume encryption on the machine (or an encrypted SQLite build, which changes the open command and is outside this document).
5. Keep the file on **local disk**. SQLite file locking is not reliable on network shares.

### 13.2 Create the database (tested)

Save the SQL blocks of 4.2 (the tables) as `schema.sql`, then:

```python
import sqlite3
con = sqlite3.connect('/srv/hk/hk.db')               # your path; creates the file
con.execute('pragma journal_mode = wal')              # stored in the file
con.executescript(open('schema.sql').read())
con.execute('pragma user_version = 1')                # your own schema version number
con.commit()
```

Then run the reference loader at the end of 4.2 (expect `[6, 77, 7, 6]`). **Every later connection** must run `pragma foreign_keys = on` and `pragma busy_timeout = 5000` (section 4.0); the BACKEND should do this in the one function that opens a connection. For changes later, keep numbered files (`001_schema.sql`, `002_...sql`), run each once, and bump `pragma user_version`.

### 13.3 Checks after loading or restoring

```python
con.execute('pragma integrity_check').fetchall()      # expect [('ok',)]
con.execute('pragma foreign_key_check').fetchall()    # expect []  (any row = a child without its parent)
```

Then run the load check of section 11.

### 13.4 Backups (tested)

Do **not** copy `hk.db` with a file copy while the server runs (the data may still be in the `-wal` file). Use SQLite's own backup, from any process, while the server is running:

```python
import sqlite3
src = sqlite3.connect('/srv/hk/hk.db'); dst = sqlite3.connect('/srv/hk/backups/hk-2026-11-04.db')
src.backup(dst); dst.close(); src.close()             # or:  src.execute("vacuum into '/srv/hk/backups/hk-2026-11-04.db'")  (SQLite 3.27+)
```

Suggested: one backup per day, keep the last 14, store them with the **same** protection as the live file (they contain every patient's data), and **restore once as a test** (open the copy and run 13.3). The screens have no export or delete flow; deleting a patient is `delete from patient where id = ?` with `pragma foreign_keys = on` (section 4.5), and old backups still contain that patient until they expire.

### 13.5 What the DATABASE owner hands to the BACKEND owner

1. The **absolute path** of the database file and which operating-system account owns it.
2. The **SQLite version** (`select sqlite_version();`), which must be 3.38 or newer.
3. Confirmation that the tables (4.2) and the reference data (4.2 loader) exist and that 13.3 passes.
4. Any change made to the recommended tables (renamed column, extra column, different type), written down, because the BACKEND document refers to the table and column names of section 4.
5. The **backup** location, schedule and the restore test result.
6. A **provider account row** for the first sign-in (see `BACKEND_HANDOFF.md` section 14.3, which needs a password hash made by the BACKEND).

### 13.6 What the DATABASE owner needs from the BACKEND owner

1. The **password hash format** the BACKEND stores in `app_user.password_hash` (a self-describing string such as `$argon2id$v=19$...` is best; the database never reads it).
2. The **time zone rule** (section 4.4) and the definition of `day` the BACKEND writes (the patient's local calendar day, `'YYYY-MM-DD'`).
3. The **Overall Score and card score formulas** (section 8.1, the central open item) and which side computes them; the tables hold results only (`daily_score`, `card_score`).
4. The list of **values the BACKEND writes** and when (for example `patient.last_active_at` at every completed check-in; `patient.state` changes; `invite.accepted_at`); `BACKEND_HANDOFF.md` section 5 describes each write and names the rows it creates or changes.
5. How the BACKEND opens connections (pragmas, one write transaction per request) so the single-writer rule of 4.5 holds.
