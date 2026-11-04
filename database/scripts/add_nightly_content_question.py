#!/usr/bin/env python3
"""
Adds the special first nightly question to the synthetic check-in data -- TESTING ONLY.

  "How content did you feel today?"   scale 1-10   (question_id GE0)

Rules
  * Asked at every evening check-in that happened (completed or partial), as the FIRST question. Skipped check-ins get nothing.
  * It sits outside the quick / standard / extended logic, so no tier or status changes.
  * Existing answers are not touched. Only the new rows are added, response_id is renumbered so ids still follow
    the order the questions were asked, and checkins.n_answered goes up by 1 for evening check-ins.
  * Answers loosely follow that day's fitness mood and sleep, whether the goal was met that night (GE2),
    and the user's motivation trait. Uses its own seeded random generator, so nothing else in the data shifts.

Run on the folder written by generate_synthetic_checkins.py (refuses to run twice):
  python3 -I add_nightly_content_question.py --data-dir synthetic_checkins --fitness fitness_tracker_dataset.csv [--seed 20261103]
"""
import argparse
import csv
import gzip
import itertools
import math
import os
import random
import sys

import pandas as pd

QID = 'GE0'
TEXT = 'How content did you feel today?'
MOOD_MEAN = {'Happy': 7.4, 'Neutral': 6.0, 'Tired': 4.9, 'Stressed': 4.1}


def clip(x, lo, hi):
    return max(lo, min(hi, x))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data-dir', required=True)
    ap.add_argument('--fitness', required=True)
    ap.add_argument('--seed', type=int, default=20261103)
    a = ap.parse_args()
    d = a.data_dir
    P = lambda n: os.path.join(d, n)

    # ---- guard: refuse to apply twice
    qb = list(csv.DictReader(open(P('question_bank.csv'), newline='')))
    if any(r['question_id'] == QID for r in qb):
        sys.exit(f'{QID} is already in question_bank.csv, nothing to do.')

    # ---- inputs
    users = {int(r['user_id']): float(r['sim_motivation']) for r in csv.DictReader(open(P('users.csv'), newline=''))}
    raw = pd.read_csv(a.fitness, usecols=['user_id', 'date', 'sleep_hours', 'mood'])
    day = raw.groupby(['user_id', 'date'], sort=False).agg(mood=('mood', 'first'), sleep=('sleep_hours', 'mean'))
    fit = {k: (v['mood'], v['sleep']) for k, v in day.to_dict('index').items()}

    # ---- check-ins: which evening check-ins happened
    chk_rows = list(csv.DictReader(open(P('checkins.csv'), newline='')))
    evening = {int(r['checkin_id']): r for r in chk_rows if r['period'] == 'evening' and r['status'] != 'skipped'}

    # ---- responses: insert GE0 first in each evening check-in, renumber ids in order
    next_id, added, seen = 1, 0, set()
    tmp = P('responses.csv.tmp')
    with open(P('responses.csv'), newline='') as fin, open(tmp, 'w', newline='') as fout:
        rd = csv.DictReader(fin)
        wr = csv.writer(fout)
        wr.writerow(['response_id', 'checkin_id', 'user_id', 'date', 'period', 'domain', 'question_id', 'response_value', 'response_numeric'])
        for cid_s, grp in itertools.groupby(rd, key=lambda r: r['checkin_id']):
            grp = list(grp)
            cid = int(cid_s)
            if cid in evening:
                c = evening[cid]
                uid, dt = int(c['user_id']), c['date']
                mood, sleep = fit.get((uid, dt), ('Neutral', 7.0))
                ge2 = next((r['response_value'] for r in grp if r['question_id'] == 'GE2'), None)
                mean = (MOOD_MEAN[mood] + .25 * clip(sleep - 7, -3, 3)
                        + (.9 if ge2 == 'Yes' else -.6 if ge2 == 'No' else 0) + .5 * users[uid])
                rng = random.Random(f'{a.seed}-content-{uid}-{dt}')
                v = int(clip(round(rng.gauss(mean, 1.2)), 1, 10))
                wr.writerow([next_id, cid, uid, dt, 'evening', 'general', QID, str(v), v])
                next_id += 1; added += 1; seen.add(cid)
            for r in grp:
                wr.writerow([next_id, r['checkin_id'], r['user_id'], r['date'], r['period'], r['domain'], r['question_id'],
                             r['response_value'], r['response_numeric']])
                next_id += 1
    missing = set(evening) - seen
    if missing:
        sys.exit(f'{len(missing)} evening check-ins had no responses; aborting (original files untouched).')

    # ---- check-ins: n_answered + 1 for those evening check-ins
    tmpc = P('checkins.csv.tmp')
    with open(tmpc, 'w', newline='') as f:
        wr = csv.DictWriter(f, fieldnames=list(chk_rows[0].keys()))
        wr.writeheader()
        for r in chk_rows:
            if int(r['checkin_id']) in evening:
                r['n_answered'] = str(int(r['n_answered']) + 1)
            wr.writerow(r)

    # ---- question bank: new row, listed first among the evening general questions
    new_q = {'question_id': QID, 'domain': 'general', 'period': 'evening', 'role': 'primary', 'source': 'core',
             'response_type': 'scale_1_10', 'options': '1-10', 'question_text': TEXT}
    idx = next(i for i, r in enumerate(qb) if r['question_id'] == 'GE1')
    qb.insert(idx, new_q)
    tmpq = P('question_bank.csv.tmp')
    with open(tmpq, 'w', newline='') as f:
        wr = csv.DictWriter(f, fieldnames=list(qb[0].keys()) if qb[0].keys() == new_q.keys() else list(new_q.keys()))
        wr.writeheader()
        wr.writerows(qb)

    # ---- swap in
    for t, n in ((tmp, 'responses.csv'), (tmpc, 'checkins.csv'), (tmpq, 'question_bank.csv')):
        os.replace(t, P(n))
    for stale in ('responses.csv.gz', 'checkins.csv.gz'):          # rebuild these with gzip -k if you use them
        if os.path.exists(P(stale)):
            os.remove(P(stale))
    print(f'added {added:,} {QID} answers to {len(evening):,} evening check-ins; responses renumbered 1..{next_id - 1:,}')


if __name__ == '__main__':
    main()
