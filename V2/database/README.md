# V2 database (testing data only)

SQLite database for the Smart Lifestyle Tracker V2: questions, check-ins, answers, and the scores the backend computes.
The database is storage and graphing. The scoring rules live in `scoring.py`, which the backend will import or port.
All data is synthetic. The watch data is the Kaggle fitness dataset, same as V1.

## Files
| File | What it is |
|---|---|
| `schema.sql` | Tables, flag views, indexes |
| `questions_v2.csv` | The 95-question bank, first-person wording. Edit this to change questions, graded flags, parents and show-if rules |
| `scoring.py` | Scoring rules, free misses, popup rule, `score_patient` (one pass per patient) and the `rescore` command |
| `build_v2_db.py` | Loads everything, scores every patient, builds indexes |
| `check_v2_db.py` | Read-only sanity check (9 checks, includes an independent SQL recomputation of the scores) |
| `demo.py` | Small hand-made scenarios (A-H, Rae, flags) that print what the rules do |
| `sample.db` | Ready-made database for 50 patients (47 MB) |
| `synthetic_v2_data.zip` | CSVs for all 999 patients (answers only, no scores) |
| `scripts/` | Data generator (`generate_v2_checkins.py`, reuses `v1_generators.py`), Kaggle download, name generator |

## Quick start (Windows and Mac)
Run these from inside the `V2/database` folder.
```
pip install -r requirements.txt
python scripts/download_fitness_data.py
mkdir data
tar -xf synthetic_v2_data.zip -C data
python build_v2_db.py --data data/synthetic_v2 --fitness fitness_tracker_dataset.csv --out v2.db
python check_v2_db.py v2.db
python check_v2_db.py sample.db
```
The full build takes about two minutes and makes an ~880 MB `v2.db` (git ignores it). On Mac use `python3` if `python` is not found.

## Scoring rules (all numbers live in the `settings` table)
- Each graded answer is worth -1 (worst) to +1 (best): 0-10 answers `(v-5)/5`, goal met No/Some/Most/Yes `-1 / -1/3 / +1/3 / +1`, yes/no `+1/-1`, "filled" questions `+1`.
- Skipped, blank, N/A or gibberish answers on a graded question are -1.
- Domain score = mean of its graded answers, morning and evening together. Day score = mean of the domain scores x 10, plus completion credit (0.5 quick, 0.6 full, times answered / asked), clamped to -10..+10.
- A day with no check-in has no score. The sleep question answered this morning scores yesterday.
- A declined whole check-in is a free miss (neutral, its graded questions are left out) once per slot per rolling 7 days. After that it counts every graded question at -1. A forgotten evening that is never followed by a morning check-in is closed without penalty.
- Patient graph: `v_patient_graph` (7-day rolling line + in-green flag only). Practitioner: daily score, rolling line, flags (`v_flag_*`).

## Known open items
- Which patient-graph start rule to use (`graph_min_days`, currently 1).
- Whether the late-popup answers should also count as "batched" (they currently do, which makes that flag common).
- The question bank's IDs and wording differ from the backend's `questions.json`.
- Sub-questions (show-if), weekly scoring, and the 24-hour edit window are stored but not enforced yet.


## Notes added with the backend
- `patients` has `first_name, last_name, preferred_name, enrolled_on, fitness_user_id` (no single `name` column).
- `questions` has `sort_order` (order inside a domain and slot) and `options` (pipe-separated choices).
- `scoring.py` is shared: the backend loads this exact file, so the rules live in one place.
  Re-scoring clears old per-answer snapshots first, so switching a question to "not graded" really removes it.
