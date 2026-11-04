#!/usr/bin/env python3
"""Quick sanity check of a database file.

  python3 check_db.py sample.db       (Windows: python check_db.py sample.db)
  python3 check_db.py checkins.db
"""
import sqlite3
import sys

FULL = {'users': 999, 'fitness_records': 1000000, 'checkins': 1396895, 'responses': 2395124}

path = sys.argv[1] if len(sys.argv) > 1 else 'sample.db'
con = sqlite3.connect(f'file:{path}?mode=ro', uri=True)   # read-only, can't change anything
con.execute('PRAGMA foreign_keys = ON')

print(f'Checking {path}\n')
for t in ('users', 'user_names', 'user_domains', 'question_bank', 'fitness_records', 'checkins', 'responses', 'tier_events'):
    print(f'  {t:<16}{con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]:>12,}')

n_users = con.execute('SELECT COUNT(*) FROM users').fetchone()[0]
if n_users == 999:
    bad = [t for t, n in FULL.items() if con.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] != n]
    print('\nFull database row counts:', 'OK' if not bad else f'MISMATCH in {bad}')
else:
    print(f'\n{n_users} users: this is a subset (the full database has 999).')

bad_fk = con.execute('PRAGMA foreign_key_check').fetchall()
print('Foreign key check:', 'OK' if not bad_fk else f'{len(bad_fk)} problems')

print('\nExample: first user, one evening check-in')
row = con.execute("""
    SELECT n.full_name, c.date, c.status, c.n_answered
    FROM users u JOIN user_names n USING (user_id) JOIN checkins c USING (user_id)
    WHERE u.user_id = 1 AND c.period = 'evening' AND c.status != 'skipped' ORDER BY c.date LIMIT 1""").fetchone()
print(' ', tuple(row))
for qid, text, val in con.execute("""
    SELECT r.question_id, q.question_text, r.response_value
    FROM responses r JOIN question_bank q USING (question_id)
    WHERE r.user_id = 1 AND r.date = ? AND r.period = 'evening' ORDER BY r.response_id LIMIT 3""", (row[1],)):
    print(f'  {qid}: {text} -> {val}')
