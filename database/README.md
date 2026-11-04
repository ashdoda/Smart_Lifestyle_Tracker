# Database: synthetic test data for the Lifestyle Tracker

Fake data for building and testing the daily check-in app. **Everything here is synthetic. There is no real patient data.**

This folder is the database part of the project. The backend and the front end have their own folders in the repo and are not covered here.

The data is a fitness tracker dataset (1,000,000 rows, 999 users) with simulated check-in answers attached to it. The answers use the question list written by a project partner. Each user is linked by `user_id`, and the original fitness rows are kept as they were.

## What's in this folder

| Path | What it is |
|---|---|
| `sample.db` | Ready-to-open SQLite database with the first 50 users (about 29 MB). **Start here.** |
| `schema.sql` | Table definitions, constraints and indexes |
| `build_db.py` | Builds the full database from the CSV files (standard library only) |
| `example_queries.sql` | Six example queries |
| `scripts/` | The scripts that generated the data (see "Regenerating the data") |
| `synthetic_checkins_data.zip` | The full synthetic data as six CSV files (about 30 MB zipped, 250 MB unzipped) |
| `scripts/download_fitness_data.py` | Downloads the original fitness dataset (72 MB) from Kaggle into this folder |
| `requirements.txt` | `kagglehub` for the download script, `pandas` and `numpy` for the generator scripts |

The full database (about 570 MB) and the original fitness file (72 MB) are **not** in the repo. The database is too big for GitHub's 100 MB file limit, and the fitness file is downloaded from Kaggle by a script instead. You build the database on your own machine (see below). Every time a large file is changed and committed, git keeps the old copy too, so only re-commit `synthetic_checkins_data.zip` when the data actually changes.

All commands below are run from inside this folder: `cd database`.

## Quick start with the sample database

`sample.db` has the same tables as the full database, but only users 1 to 50 and their rows. Use it to build and test against. **It is a subset, so totals and averages from it will not match the full 999 users.**

You need Python 3 (tested on 3.13). Nothing to install, because the `sqlite3` module comes with Python.

```python
import sqlite3
con = sqlite3.connect("sample.db")
con.row_factory = sqlite3.Row            # rows behave like dicts
con.execute("PRAGMA foreign_keys = ON")  # SQLite needs this on every connection

rows = con.execute(
    "SELECT question_id, response_value FROM responses WHERE user_id = ? AND date = ? ORDER BY response_id",
    (1, "2024-03-04"),
).fetchall()
for r in rows:
    print(r["question_id"], r["response_value"])
```

Always pass values as `?` parameters (as above), never by pasting them into the SQL string.

To browse the tables without writing code, open `sample.db` in [DB Browser for SQLite](https://sqlitebrowser.org/) (free). `example_queries.sql` has queries you can paste in.

## Building the full database

1. Download the original fitness dataset from Kaggle (once per machine):
   ```
   pip install kagglehub
   python3 scripts/download_fitness_data.py
   ```
   This saves `fitness_tracker_dataset.csv` in this folder (git ignores it). The script checks that it is exactly the version the check-in data was built from, and does nothing if the file is already there. If Kaggle asks for credentials, make a free Kaggle account, create an API token under Settings, and set the `KAGGLE_USERNAME` and `KAGGLE_KEY` environment variables.
2. Unzip the data into a `data/` folder (git ignores it):
   ```
   unzip synthetic_checkins_data.zip -d data/
   ```
   This creates `data/synthetic_checkins/` with `users.csv`, `user_names.csv`, `question_bank.csv`, `checkins.csv`, `responses.csv` and `tier_events.csv`.
3. Build the database (about 40 seconds):
   ```
   python3 build_db.py --data-dir data/synthetic_checkins --fitness fitness_tracker_dataset.csv --db checkins.db
   ```
   Add `--force` to rebuild an existing `checkins.db`. The script checks that every table links correctly and stops with an error if anything doesn't.
4. The result is `checkins.db` (about 570 MB). It's ignored by git on purpose. Don't commit it. Every teammate builds their own copy.

Expected row counts: 999 users, 1,000,000 fitness rows, 1,396,895 check-ins, 2,395,124 responses.

## What's in the data

**Time span:** 2023-01-01 to 2025-09-26.

**Tables**

| Table | One row per | Main columns |
|---|---|---|
| `users` | user | `user_id`, `enrolled_on`, `domains` (pipe-separated), `goal_domain`, `base_tier`, `provider_questions`, `sim_*` columns |
| `user_names` | user | `first_name`, `last_name`, `full_name`, `preferred_name` (all fake) |
| `user_domains` | user and domain | `user_id`, `domain`, `is_goal` (`domains` split into rows) |
| `question_bank` | question | `question_id`, `domain`, `period`, `role`, `response_type`, `options`, `question_text` |
| `fitness_records` | tracker row | the original fitness columns, **several rows per user per day** |
| `checkins` | check-in slot | `user_id`, `date`, `period`, `tier_offered`, `status`, `n_answered`, `submitted_at` |
| `responses` | answered question | `checkin_id`, `user_id`, `date`, `question_id`, `response_value` (text), `response_numeric` |
| `tier_events` | adaptive change | `user_id`, `date`, `event`, `from_tier`, `to_tier`, `reason` |

**How things link:** join on `user_id` and `date`. Every check-in has at least one fitness row for that user and day. `responses.checkin_id` links to `checkins`, and `responses.question_id` links to `question_bank`.

**Conventions**
- **Periods:** `morning`, `evening`, `weekly`. Weekly check-ins use the Sunday that ends the week.
- **Domains:** `physical_activity`, `nutrition`, `mindfulness`, `sleep`, `social`, `substance_use`. Questions asked of everyone use `general`.
- **Check-in lengths (tiers):** `quick`, `standard`, `extended`. Each user has a `base_tier`. Users are moved to `quick` automatically after missed check-ins or after repeatedly answering only the first question, and are offered their old length back after a consistent week (see `tier_events`).
- **Check-in status:** `completed`, `partial` (answered only the first question or questions) or `skipped`. Skipped check-ins are real rows with no responses. About 52% of morning, 59% of evening and 64% of weekly slots are skipped.
- **Question IDs:** the first letter is the group (`G` general, `PA` physical activity, `DN` diet and nutrition, `MF` mindfulness, `SL` sleep, `SC` social, `SU` substance use), then `M`, `E` or `W` for morning, evening or weekly, then a number. `PV1` to `PV4` are example provider-added questions, tied to individual users through `users.provider_questions`.
- **Nightly question `GE0`:** "How content did you feel today?" on a scale of 1 to 10. It is the first question of every evening check-in that happened, and sits outside the quick, standard and extended logic.
- **Answer values:** yes/no answers are `Yes` or `No` with `response_numeric` set to 1 or 0. Scales use `response_numeric` as the score. Other answers are text.
- **Columns starting with `sim_`:** simulation traits (adherence, motivation, step target). They only exist to drive the fake data, so leave them out of the real app.

## Regenerating the data

You only need this to change the fake data. To use it as is, use the zip in this folder instead. Download the fitness file first (step 1 of "Building the full database").

```
pip install -r requirements.txt
python3 scripts/generate_synthetic_checkins.py --input fitness_tracker_dataset.csv --outdir data/synthetic_checkins
python3 scripts/generate_user_names.py --users data/synthetic_checkins/users.csv --out data/synthetic_checkins/user_names.csv
python3 scripts/add_nightly_content_question.py --data-dir data/synthetic_checkins --fitness fitness_tracker_dataset.csv
```

If you regenerate the data for the whole team, zip the six CSV files in `data/synthetic_checkins/` into a new `synthetic_checkins_data.zip` (with the `synthetic_checkins/` folder inside it) and replace the one in this folder.

Run them in that order. All three use fixed seeds, so running them again on the same fitness file gives **identical files** (checked with checksums). The percentages and rules (domain mix, tier mix, adherence, drop-off) are named settings at the top of `generate_synthetic_checkins.py`. The last script refuses to run twice on the same folder.

## Things to know

- The fitness file is itself synthetic and random (its Kaggle page describes it as synthetic). For example, `active_minutes` can be above 1,440, and workout types don't match step counts. Check-in answers only loosely follow it (mood, sleep and steps nudge the answers).
- Free-text answers come from small phrase pools, so they repeat a lot.
- Check-ins are only created on days a user has fitness data (about 63% of days), so a day with no fitness data has no check-in row at all, not even a skipped one.
- `quick` check-ins have no domain-specific daily questions, only the general questions. Weekly questions do cover each of the user's domains.
- The provider-added questions (`PV1` to `PV4`) are placeholders for what real providers might add.
- Names are random pairs of first and last names, and some may match real people by chance.

## Not covered here

- Anything in the backend or front-end folders.
- Any scoring or summary of how a user's day went. The database only stores the raw answers and fitness data.

## Data source

`fitness_tracker_dataset.csv` is the [Fitness Tracker Dataset](https://www.kaggle.com/datasets/smayanj/fitness-tracker-dataset) from Kaggle (`smayanj/fitness-tracker-dataset`), which describes it as synthetic fitness data (steps, sleep, mood, heart rate and workouts). It is downloaded rather than stored in the repo, so check the dataset's license on its Kaggle page before redistributing it. Everything else in this folder (check-in answers, names, tiers) was generated for this project on top of it.

## Handling data

This data is fake. Keep it separate from any real patient data. Real data, especially HIV and substance use records, will need its own storage and access protections before it goes anywhere near this setup.
