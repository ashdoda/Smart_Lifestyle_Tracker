#!/usr/bin/env python3
"""
Builds the V2 SQLite database: schema -> question bank -> synthetic answers -> watch data -> scores -> indexes.

  python3 build_v2_db.py --data synthetic_v2 --fitness fitness_tracker_dataset.csv --out v2.db

--data     folder written by scripts/generate_v2_checkins.py (patients, patient_domains, patient_questions, checkins, answers)
--fitness  the Kaggle CSV (scripts/download_fitness_data.py puts it next to this file); only the patients' rows, and only user_id, date and steps, are loaded
Scores are computed by scoring.py, the same code the backend will use (one pass per patient).
"""
import argparse
import csv
import os
import sqlite3
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import scoring  # noqa: E402

SETTINGS = [
    ('green_min', '70', 'patient graph light-green zone starts here (scores run 0 to 100)'),
    ('rolling_days', '7', 'rolling average window (days)'),
    ('graph_min_days', '1', 'scored days needed before the patient graph appears (undecided)'),
    ('skip_value', '-1', 'points for a skipped / junk / blank graded answer'),
    ('batch_minutes', '60', 'morning and evening completed within this gap -> batched flag'),
    ('edit_hours', '24', 'edit window from original completion (never rolling)'),
    ('day_start_hour', '4', 'check-in day runs 4 AM to 4 AM'),
    ('credit_quick', '2.5', 'completion credit (points on the 0-100 scale), quick check-in'),
    ('credit_full', '3', 'completion credit, full check-in'),
    ('free_miss_days', '7', 'one free miss per slot (morning, evening) per rolling window'),
    ('as_of', '2026-11-08', '"today" for the missed-days / below-green flags (set to date(now) in the app)'),
]
DOMAINS = [('general', 'General', 1), ('physical_activity', 'Physical activity', 0), ('nutrition', 'Diet and nutrition', 0),
           ('mindfulness', 'Mindfulness', 0), ('sleep', 'Sleep', 0), ('social', 'Social connections', 0),
           ('substance_use', 'Avoiding harmful substances', 0), ('provider', 'Provider-added questions', 0)]


def load_csv(con, table, path, cols, convert=None, chunk=100000):
    with open(path, encoding='utf-8') as f:
        rd = csv.DictReader(f)
        marks = ','.join('?' * len(cols))
        batch, n = [], 0
        for row in rd:
            vals = [(row[c] if row[c] != '' else None) for c in cols]
            batch.append(vals)
            if len(batch) >= chunk:
                con.executemany(f'INSERT INTO {table}({",".join(cols)}) VALUES ({marks})', batch)
                n += len(batch); batch = []
        if batch:
            con.executemany(f'INSERT INTO {table}({",".join(cols)}) VALUES ({marks})', batch)
            n += len(batch)
    return n


STEP_WINDOW, STEP_FUTURE = 400, 35        # same window the backend's seed_demo.py uses: 365 days back + 35 days ahead


def fill_step_gaps(con, empty_pct):
    """Wearables mostly record every day, but the Kaggle data has about a third of days missing. Fill the gaps in the first
    365 days of the last 400-day window with steps drawn from that person's own real mean and spread, leaving about
    empty_pct % of those days empty (random days, fixed seed). The last 35 days (shown as the future) are not touched."""
    import random, statistics
    flast = con.execute('SELECT MAX(date) FROM fitness_records').fetchone()[0]
    if not flast:
        return 0
    first = con.execute('SELECT date(?, ?)', (flast, f'-{STEP_WINDOW - 1} days')).fetchone()[0]
    past_end = con.execute('SELECT date(?, ?)', (flast, f'-{STEP_FUTURE} days')).fetchone()[0]
    days = [r[0] for r in con.execute(
        'WITH RECURSIVE d(x) AS (SELECT ? UNION ALL SELECT date(x, \'+1 day\') FROM d WHERE x < ?) SELECT x FROM d', (first, past_end))]
    added = 0
    for (u,) in con.execute('SELECT DISTINCT user_id FROM fitness_records').fetchall():
        have = {d: v for d, v in con.execute('SELECT date, steps FROM fitness_records WHERE user_id=? AND date BETWEEN ? AND ?', (u, first, past_end))}
        allv = [v for (v,) in con.execute('SELECT steps FROM fitness_records WHERE user_id=?', (u,))]
        if len(allv) < 5:
            continue
        mean, sd = statistics.mean(allv), statistics.pstdev(allv)
        lo, hi = max(500, min(allv) * 0.5), max(allv) * 1.1
        rnd = random.Random(u * 7919 + 17)
        missing = [d for d in days if d not in have]
        keep_empty = set(rnd.sample(missing, min(len(missing), round(len(days) * empty_pct / 100))))
        rows = [(u, d, round(min(hi, max(lo, rnd.gauss(mean, sd))))) for d in missing if d not in keep_empty]
        con.executemany('INSERT INTO fitness_records (user_id, date, steps) VALUES (?,?,?)', rows)
        added += len(rows)
    return added


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True)
    ap.add_argument('--fitness')
    ap.add_argument('--keep-days', type=int, help='keep only the last N days of check-ins and watch data (makes a small sample database)')
    ap.add_argument('--empty-pct', type=float, default=5.0,
                    help='fill gaps in the watch data so only about this %% of days are empty (default 5); the last 35 days of the 400-day step window (the demo "future") are left as they are')
    ap.add_argument('--no-fill', action='store_true', help='do not fill gaps in the watch data (keep the real Kaggle gaps)')
    ap.add_argument('--questions', default=os.path.join(HERE, 'questions_v2.csv'))
    ap.add_argument('--out', default=os.path.join(HERE, 'v2.db'))
    args = ap.parse_args()
    t0 = time.time()
    if os.path.exists(args.out):
        os.remove(args.out)
    con = sqlite3.connect(args.out)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA journal_mode=OFF'); con.execute('PRAGMA synchronous=OFF')
    schema = open(os.path.join(HERE, 'schema.sql'), encoding='utf-8').read()
    body, indexes = schema.split('--@indexes')
    con.executescript(body)
    con.executemany('INSERT INTO settings VALUES (?,?,?)', SETTINGS)
    con.executemany('INSERT INTO domains VALUES (?,?,?)', DOMAINS)
    qcols = ['question_id', 'domain', 'text', 'answer_type', 'options', 'slot', 'parent_id', 'show_if', 'is_bold',
             'default_graded', 'score_rule', 'score_day', 'assigned_only', 'scope', 'sort_order']
    # parents must exist before children (foreign keys): load top-level first
    rows = list(csv.DictReader(open(args.questions, encoding='utf-8')))
    for r in sorted(rows, key=lambda r: bool(r['parent_id'])):
        con.execute(f'INSERT INTO questions({",".join(qcols)}) VALUES ({",".join("?" * len(qcols))})',
                    [(r[c] if r[c] != '' else None) for c in qcols])
    d = lambda n: os.path.join(args.data, n)
    n = {}
    n['patients'] = load_csv(con, 'patients', d('patients.csv'),
                               ['patient_id', 'first_name', 'last_name', 'preferred_name', 'enrolled_on', 'fitness_user_id'])
    n['patient_domains'] = load_csv(con, 'patient_domains', d('patient_domains.csv'),
                                    ['patient_id', 'domain', 'enabled', 'default_length', 'start_date', 'end_date'])
    n['patient_questions'] = load_csv(con, 'patient_questions', d('patient_questions.csv'),
                                      ['patient_id', 'question_id', 'enabled', 'graded'])
    n['checkins'] = load_csv(con, 'checkins', d('checkins.csv'),
                             ['checkin_id', 'patient_id', 'checkin_day', 'slot', 'length', 'status', 'started_at',
                              'completed_at', 'edit_deadline', 'via_popup'])
    n['answers'] = load_csv(con, 'answers', d('answers.csv'),
                            ['answer_id', 'checkin_id', 'question_id', 'value', 'value_numeric', 'status', 'answered_at'])
    if args.fitness:
        keep = {r[0] for r in con.execute('SELECT fitness_user_id FROM patients')}
        days = {}                                    # several readings on one day -> one row (average steps)
        with open(args.fitness, encoding='utf-8-sig') as f:
            for row in csv.DictReader(f):
                u = int(row['user_id'])
                if u in keep and row['steps'] != '':
                    days.setdefault((u, row['date']), []).append(float(row['steps']))
        con.executemany('INSERT INTO fitness_records (user_id, date, steps) VALUES (?,?,?)',
                        [(u, dt, round(sum(v) / len(v))) for (u, dt), v in sorted(days.items())])
        n['fitness_records'] = len(days)
    if args.keep_days:
        last = con.execute('SELECT MAX(checkin_day) FROM checkins').fetchone()[0]
        cut = con.execute("SELECT date(?, ?)", (last, f'-{args.keep_days - 1} days')).fetchone()[0]
        con.execute('DELETE FROM answers WHERE checkin_id IN (SELECT checkin_id FROM checkins WHERE checkin_day < ?)', (cut,))
        con.execute('DELETE FROM checkins WHERE checkin_day < ?', (cut,))
        con.execute('DELETE FROM patient_domains WHERE end_date IS NOT NULL AND end_date <= ?', (cut,))
        flast = con.execute('SELECT MAX(date) FROM fitness_records').fetchone()[0]
        if flast:
            con.execute('DELETE FROM fitness_records WHERE date <= date(?, ?)', (flast, f'-{args.keep_days} days'))
        con.execute('UPDATE patients SET enrolled_on = COALESCE((SELECT MIN(checkin_day) FROM checkins c WHERE c.patient_id = patients.patient_id), enrolled_on)')
        print(f'kept the last {args.keep_days} days (check-ins from {cut})')
    if args.fitness and not args.no_fill:
        n['steps_added'] = fill_step_gaps(con, args.empty_pct)
    # the demo "today" = the day after the last check-in in the data, so the missed-days flag means something
    con.execute("UPDATE settings SET value=(SELECT date(MAX(checkin_day),'+1 day') FROM checkins), note='day after the last check-in in this data (the app uses today)' WHERE key='as_of'")
    con.commit()
    con.executescript(indexes)                       # indexes first: scoring joins on them
    print(f'loaded in {time.time() - t0:.0f}s:', n)
    pids = [r[0] for r in con.execute('SELECT patient_id FROM patients ORDER BY patient_id')]
    for i, pid in enumerate(pids, 1):
        scoring.score_patient(con, pid)
        if i % 50 == 0:
            con.commit(); print(f'  scored {i}/{len(pids)} patients ({time.time() - t0:.0f}s)', flush=True)
    con.commit()
    print('daily_scores:', con.execute('SELECT COUNT(*) FROM daily_scores').fetchone()[0],
          ' domain_scores:', con.execute('SELECT COUNT(*) FROM domain_scores').fetchone()[0])
    con.execute('VACUUM'); con.close()
    print(f'Built {args.out} ({os.path.getsize(args.out) / 1e6:.0f} MB) in {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
