#!/usr/bin/env python3
"""
Build the SQLite database for the synthetic check-in prototype.
Standard library only (sqlite3 + csv), so it runs anywhere Python 3.9+ runs.

  python3 -I build_db.py --data-dir ../synthetic_checkins --fitness fitness_tracker_dataset.csv --db checkins.db [--force]

--data-dir  folder with users.csv, user_names.csv, question_bank.csv, checkins.csv, responses.csv, tier_events.csv
            (.csv.gz versions of checkins/responses are also accepted)
--fitness   the original fitness CSV (optional; skip it for a smaller db without fitness_records)
"""
import argparse
import csv
import gzip
import os
import sqlite3
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
BATCH = 50_000


def open_csv(data_dir, name):
    for fname, opener in ((name, open), (name + '.gz', gzip.open)):
        p = os.path.join(data_dir, fname)
        if os.path.exists(p):
            return opener(p, 'rt', newline='')
    sys.exit(f'Missing {name}(.gz) in {data_dir}')


def load(con, table, columns, rows, convert=None):
    """Bulk insert rows (iterable of dicts) in batches. convert maps column -> function."""
    convert = convert or {}
    sql = f"INSERT INTO {table} ({','.join(columns)}) VALUES ({','.join('?' * len(columns))})"
    batch, n = [], 0
    for row in rows:
        batch.append(tuple(convert[c](row[c]) if c in convert else row[c] for c in columns))
        if len(batch) >= BATCH:
            con.executemany(sql, batch)
            n += len(batch)
            batch = []
    if batch:
        con.executemany(sql, batch)
        n += len(batch)
    print(f'  {table:<16} {n:>10,} rows')
    return n


def nullable(f=lambda v: v):
    return lambda v: None if v == '' else f(v)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data-dir', required=True)
    ap.add_argument('--fitness')
    ap.add_argument('--db', default='checkins.db')
    ap.add_argument('--schema', default=os.path.join(HERE, 'schema.sql'))
    ap.add_argument('--force', action='store_true', help='overwrite an existing db file')
    args = ap.parse_args()

    if os.path.exists(args.db):
        if not args.force:
            sys.exit(f'{args.db} exists (use --force to rebuild)')
        os.remove(args.db)

    t0 = time.time()
    schema = open(args.schema).read()
    main_sql, idx_sql = schema.split('--@indexes')

    con = sqlite3.connect(args.db)
    con.executescript(main_sql)
    # fast bulk-load settings (safe: we rebuild from CSV if anything goes wrong)
    con.execute('PRAGMA journal_mode = OFF')
    con.execute('PRAGMA synchronous = OFF')
    con.execute('PRAGMA foreign_keys = OFF')   # checked explicitly at the end

    print('Loading:')
    with open_csv(args.data_dir, 'question_bank.csv') as f:
        load(con, 'question_bank',
             ['question_id', 'domain', 'period', 'role', 'source', 'response_type', 'options', 'question_text'],
             csv.DictReader(f), {'options': nullable()})

    with open_csv(args.data_dir, 'users.csv') as f:
        users = list(csv.DictReader(f))
    load(con, 'users',
         ['user_id', 'enrolled_on', 'domains', 'goal_domain', 'base_tier', 'provider_questions',
          'sim_adherence', 'sim_motivation', 'sim_step_target'],
         users, {'user_id': int, 'provider_questions': nullable(), 'sim_adherence': float,
                 'sim_motivation': float, 'sim_step_target': int})

    # split the pipe-separated domains into a proper link table
    ud = [(int(u['user_id']), d, int(d == u['goal_domain'])) for u in users for d in u['domains'].split('|')]
    con.executemany('INSERT INTO user_domains (user_id, domain, is_goal) VALUES (?,?,?)', ud)
    print(f"  {'user_domains':<16} {len(ud):>10,} rows")

    names_path = os.path.join(args.data_dir, 'user_names.csv')
    if os.path.exists(names_path):
        with open(names_path, newline='') as f:
            load(con, 'user_names', ['user_id', 'first_name', 'last_name', 'full_name', 'preferred_name'],
                 csv.DictReader(f), {'user_id': int})

    if args.fitness:
        with open(args.fitness, newline='') as f:
            def fit_rows():
                for i, r in enumerate(csv.DictReader(f), start=1):
                    r['record_id'] = i
                    yield r
            load(con, 'fitness_records',
                 ['record_id', 'user_id', 'date', 'steps', 'calories_burned', 'distance_km', 'active_minutes',
                  'sleep_hours', 'heart_rate_avg', 'workout_type', 'weather_conditions', 'location', 'mood'],
                 fit_rows(),
                 {'record_id': int, 'user_id': int, 'steps': int, 'calories_burned': float, 'distance_km': float,
                  'active_minutes': int, 'sleep_hours': float, 'heart_rate_avg': int})

    with open_csv(args.data_dir, 'checkins.csv') as f:
        load(con, 'checkins',
             ['checkin_id', 'user_id', 'date', 'period', 'tier_offered', 'status', 'n_answered', 'submitted_at'],
             csv.DictReader(f),
             {'checkin_id': int, 'user_id': int, 'n_answered': int, 'submitted_at': nullable()})

    with open_csv(args.data_dir, 'responses.csv') as f:
        load(con, 'responses',
             ['response_id', 'checkin_id', 'user_id', 'date', 'period', 'domain', 'question_id',
              'response_value', 'response_numeric'],
             csv.DictReader(f),
             {'response_id': int, 'checkin_id': int, 'user_id': int, 'response_numeric': nullable(float)})

    with open_csv(args.data_dir, 'tier_events.csv') as f:
        load(con, 'tier_events', ['user_id', 'date', 'event', 'from_tier', 'to_tier', 'reason'],
             csv.DictReader(f), {'user_id': int})
    con.commit()

    print('Creating indexes ...')
    con.executescript(idx_sql)

    print('Checking foreign keys ...')
    bad = con.execute('PRAGMA foreign_key_check').fetchall()
    if bad:
        sys.exit(f'Foreign key problems: {bad[:5]} ...')
    con.execute('PRAGMA foreign_keys = ON')
    con.execute('ANALYZE')
    con.execute('PRAGMA journal_mode = DELETE')
    con.commit()
    con.close()
    print(f'Done in {time.time() - t0:.0f}s -> {args.db} ({os.path.getsize(args.db) / 1e6:.0f} MB)')


if __name__ == '__main__':
    main()
