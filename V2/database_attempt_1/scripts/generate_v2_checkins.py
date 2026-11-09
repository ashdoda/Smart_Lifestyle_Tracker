#!/usr/bin/env python3
"""
V2 synthetic check-in generator -- TESTING ONLY, no real patient data.

It reuses the per-question answer generators from the V1 script (v1_generators.py, unchanged) and writes data in the
V2 shape: answers only. The scorer (scoring.py) turns them into points and scores later.

New behaviour compared with V1
  * Patients have General plus 0-6 optional domains (some are General-only).
  * Each domain has a practitioner default length (quick/full); the patient's own choice applies to the whole check-in.
    After 3 days with no check-in the patient is nudged to quick; after a steady week they can go back to full.
  * Quick = the always-asked (bold/primary) questions. Full adds the optional ones. Graded questions are always asked.
  * Skipped graded questions, N/A and gibberish answers are stored as skipped / junk (both score -1).
  * No check-in = no row. A forgotten evening (or morning) is offered back through the popup: answered late
    (via_popup = 1) or declined, which is a free miss the first time in 7 days (per slot) and a counted miss after that.
    A forgotten evening that is never followed by a morning check-in is closed without penalty.
  * Practitioner switches: a few patients have a graded question turned off, or an ungraded yes/no turned graded.
  * Timestamps on everything, plus an occasional morning+evening completed back to back (batched).

Run:  python3 -I generate_v2_checkins.py --input ../fitness_tracker_dataset.csv --outdir out [--users 50] [--seed 20261108]
"""
import argparse
import csv
import os
import random
import sys
from datetime import datetime, timedelta
from types import SimpleNamespace

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import v1_generators as V                      # noqa: E402  (answer generators, goals, question order)

N_OPT_P = [(0, .20), (1, .30), (2, .25), (3, .15), (4, .05), (5, .03), (6, .02)]   # optional domains per patient
OPTIONAL = ['physical_activity', 'nutrition', 'mindfulness', 'sleep', 'social', 'substance_use']
P_DOMAIN_QUICK = .30            # practitioner default length per domain
P_BATCH = .03                   # evening completed 15-50 min after the morning
P_GIBBERISH = .012              # a filled-rule answer is gibberish instead of real text
P_TOGGLE_OFF, P_TOGGLE_GRADE = .04, .04
FREE_MISS_DAYS = 7
GIB = ['asdfgh', 'idk', '.', 'n/a', 'qwerty', 'none']


def hhmm(day, minutes):
    return (day + timedelta(minutes=minutes))


def fmt(t):
    return t.strftime('%Y-%m-%d %H:%M:%S')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', required=True)
    ap.add_argument('--outdir', required=True)
    ap.add_argument('--questions', default=os.path.normpath(os.path.join(HERE, '..', 'questions_v2.csv')))
    ap.add_argument('--names', help='user_names.csv from generate_user_names.py (optional)')
    ap.add_argument('--users', type=int, help='only the first N users (for a quick test)')
    ap.add_argument('--seed', type=int, default=20261108)
    args = ap.parse_args()
    os.makedirs(args.outdir, exist_ok=True)

    qrows = list(csv.DictReader(open(args.questions, encoding='utf-8')))
    Q = {q['question_id']: q for q in qrows}
    BOLD = {k: q['is_bold'] == '1' for k, q in Q.items()}
    RULE = {k: q['score_rule'] for k, q in Q.items()}
    ATYPE = {k: q['answer_type'] for k, q in Q.items()}
    TOP = [q for q in qrows if not q['parent_id']]                 # top-level questions
    names = {}
    if args.names:
        for r in csv.DictReader(open(args.names, encoding='utf-8')):
            names[int(r['user_id'])] = r['full_name']

    raw = pd.read_csv(args.input, parse_dates=['date'])
    if args.users:
        raw = raw[raw['user_id'] <= args.users]
    raw['wk'] = raw['date'] + pd.to_timedelta(6 - raw['date'].dt.weekday, unit='D')
    day = (raw.groupby(['user_id', 'date'], sort=True)
              .agg(steps=('steps', 'mean'), sleep=('sleep_hours', 'mean'), active=('active_minutes', 'mean'),
                   mood=('mood', 'first'), workout=('workout_type', 'first'), wk=('wk', 'first')).reset_index())
    steps_mu, steps_sd = day['steps'].mean(), day['steps'].std()
    last_date = raw['date'].max()
    wk = (raw.groupby(['user_id', 'wk', 'workout_type']).size().reset_index(name='n')
             .sort_values(['user_id', 'wk', 'n', 'workout_type'], ascending=[True, True, False, True])
             .drop_duplicates(['user_id', 'wk']).set_index(['user_id', 'wk'])['workout_type'].to_dict())
    wk_days = day.groupby(['user_id', 'wk']).agg(nd=('date', 'size'), sl=('sleep', 'mean')).to_dict('index')

    out = {}
    def w(name, header):
        f = open(os.path.join(args.outdir, name), 'w', newline='', encoding='utf-8')
        wr = csv.writer(f); wr.writerow(header); out[name] = f
        return wr
    wp = w('patients.csv', ['patient_id', 'name', 'fitness_user_id'])
    wd = w('patient_domains.csv', ['patient_id', 'domain', 'enabled', 'default_length', 'start_date', 'end_date'])
    wq = w('patient_questions.csv', ['patient_id', 'question_id', 'enabled', 'graded'])
    wc = w('checkins.csv', ['checkin_id', 'patient_id', 'checkin_day', 'slot', 'length', 'status', 'started_at',
                            'completed_at', 'edit_deadline', 'via_popup'])
    wa = w('answers.csv', ['answer_id', 'checkin_id', 'question_id', 'value', 'value_numeric', 'status', 'answered_at'])
    wt = w('sim_traits.csv', ['patient_id', 'adherence', 'motivation', 'step_target', 'goal_domain'])
    ids = SimpleNamespace(c=0, a=0)

    # ------------------------------------------------------------------ helpers
    def graded_asked(u, slot):
        """Graded top-level questions this patient is asked in this slot (for counted misses)."""
        res = []
        for q in TOP:
            if q['slot'] != slot or q['domain'] not in u.active_domains:
                continue
            if q['assigned_only'] == '1' and q['question_id'] not in u.assigned:
                continue
            if q['question_id'] in u.off:
                continue
            g = u.graded_override.get(q['question_id'], q['default_graded'] == '1')
            if g:
                res.append(q['question_id'])
        return res

    def emit_checkin(u, d, slot, length, status, started=None, completed=None, via=0):
        ids.c += 1
        deadline = fmt(completed + timedelta(hours=24)) if (completed and status == 'completed') else ''
        wc.writerow([ids.c, u.id, d.strftime('%Y-%m-%d'), slot, length if status == 'completed' else 'full', status,
                     fmt(started) if started else '', fmt(completed) if completed else '', deadline, via])
        return ids.c

    def emit_answer(cid, qid, v, n, status, ts):
        ids.a += 1
        wa.writerow([ids.a, cid, qid, v, '' if n is None else n, status, fmt(ts) if ts else ''])

    def row_status(qid, v, n, r):
        rule, at = RULE[qid], ATYPE[qid]
        if rule == 'filled':
            if v == '' or n == 0:
                return 'skipped', '', None
            if n is None:
                return 'junk', v, None
            if r.random() < P_GIBBERISH:
                return 'junk', r.choice(GIB), None
            return 'answered', v, None
        if v == '':
            return 'skipped', '', None
        return 'answered', v, (n if at in ('scale10', 'number', 'time') or qid == 'GE2' else None)

    def answer_rows(u, c, slot, length, partial, r):
        """List of (qid, value, numeric, status) for one check-in."""
        tier = 'quick' if length == 'quick' else 'extended'
        qs = [q for q in V.daily_questions(u, c, slot, tier, False) if q not in u.off]
        rows, answered_first = [], set(V.GEN_PRIMARY[slot])
        for qid in qs:
            p_skip = .02 + .06 * (1 - u.a)
            if (partial and qid not in answered_first) or (qid in u.graded_now(qid) and r.random() < p_skip):
                rows.append((qid, '', None, 'skipped'))
                continue
            v0, n0 = V.GEN[qid](c)                       # raw generator output (conditions test this)
            st, v, n = row_status(qid, v0, n0, r)
            rows.append((qid, v, n, st))
            if st == 'skipped' or partial:
                continue
            for cq, pred, _ in V.COND.get(qid, []):
                if cq in u.off or not (length == 'full' or BOLD[cq]):
                    continue
                if pred(v0, n0):
                    v2, n2 = V.GEN[cq](c)
                    st2, v2, n2 = row_status(cq, v2, n2, r)
                    rows.append((cq, v2, n2, st2))
        for pq in u.assigned:
            if Q[pq]['slot'] == slot and pq not in u.off and not partial:
                v, n = V.GEN[pq](c)
                rows.append((pq, v, n, 'answered'))
        return rows

    # ------------------------------------------------------------------ main loop
    n_users = 0
    for uid, g in day.groupby('user_id', sort=True):
        r = random.Random(f"{args.seed}-{uid}")
        recs = g.to_dict('records')
        enrolled = recs[0]['date']
        sub = r.random() < V.P_SUBSTANCE_USER
        k = V.wchoice(r, N_OPT_P)
        doms = ['substance_use'] if (sub and k > 0) else []
        pool = [d for d in OPTIONAL if d != 'substance_use']
        if k == 6:
            doms, pool = list(OPTIONAL), []
        while len(doms) < k:
            d = r.choices(pool, weights=[V.OTHER_DOMAIN_W[x] for x in pool])[0]
            pool.remove(d); doms.append(d)
        r.shuffle(doms)
        def_len = {d: ('quick' if r.random() < P_DOMAIN_QUICK else 'full') for d in ['general'] + doms}
        full_votes = sum(1 for x in def_len.values() if x == 'full')
        base_len = 'full' if full_votes * 2 > len(def_len) or (full_votes * 2 == len(def_len) and r.random() < .5) else 'quick'
        goal = doms[0] if doms else r.choice(list(V.GOALS))
        assigned = []
        if 'substance_use' in doms and r.random() < V.P_PROVIDER['PV2']: assigned.append('PV2')
        if 'sleep' in doms and r.random() < V.P_PROVIDER['PV3']: assigned.append('PV3')
        if 'physical_activity' in doms and r.random() < V.P_PROVIDER['PV4']: assigned.append('PV4')
        if r.random() < V.P_PROVIDER['PV1']: assigned.append('PV1')
        off, graded_override = set(), {}
        if 'social' in doms and r.random() < P_TOGGLE_OFF: off.add('SCE4')
        if 'nutrition' in doms and r.random() < P_TOGGLE_OFF: off.add('DNE2')
        alt = [q for q in ('PAE6', 'DNE3', 'SLE1', 'SLE3') if Q[q]['domain'] in doms]
        if alt and r.random() < P_TOGGLE_GRADE: graded_override[r.choice(alt)] = True
        u = SimpleNamespace(id=uid, doms=doms, goal=goal, a=r.betavariate(5, 2.2), m=r.gauss(0, 1),
                            step_target=r.choice(V.STEP_TARGETS), pq=assigned, assigned=assigned, enrolled_on=enrolled,
                            active_domains=set(['general'] + doms), off=off, graded_override=graded_override)
        u.graded_now = lambda qid, _u=u: ({qid} if graded_override.get(qid, Q[qid]['default_graded'] == '1') else set())
        n_users += 1
        wp.writerow([uid, names.get(uid, f'Patient {uid}'), uid])
        for d_ in ['general'] + doms:
            wd.writerow([uid, d_, 1, def_len[d_], enrolled.strftime('%Y-%m-%d'), ''])
        for q_ in off:
            wq.writerow([uid, q_, 0, Q[q_]['default_graded']])
        for q_, gflag in graded_override.items():
            wq.writerow([uid, q_, 1, 1])
        for q_ in assigned:
            wq.writerow([uid, q_, 1, 0])
        wt.writerow([uid, round(u.a, 3), round(u.m, 3), u.step_target, goal])

        length = base_len
        engaged = []                           # one bool per fitness day
        last_free = {'morning': None, 'evening': None}
        pending = None                         # (day, ctx) of an evening that is still open
        prev_wk = None

        def decline(slot, d, via=0):
            free = last_free[slot] is None or (d - last_free[slot]).days >= FREE_MISS_DAYS
            if free:
                last_free[slot] = d
                emit_checkin(u, d, slot, length, 'free_miss', via=via)
            else:
                cid = emit_checkin(u, d, slot, length, 'counted_miss', via=via)
                for qid in graded_asked(u, slot):
                    emit_answer(cid, qid, '', None, 'skipped', None)

        def do_checkin(d, slot, c, start_min, via=0, length_=None, start_dt=None):
            """Record a completed check-in; returns its completed_at."""
            ln = length_ or length
            partial = r.random() < ((.05 + .35 * (1 - u.a)) if ln == 'full' else (.02 + .10 * (1 - u.a)))
            start = start_dt or hhmm(d, start_min)
            done = start + timedelta(minutes=r.randint(4, 9) if ln == 'full' else r.randint(2, 5))
            cid = emit_checkin(u, d, slot, ln, 'completed', start, done, via)
            for qid, v, n, st in answer_rows(u, c, slot, ln, partial, r):
                emit_answer(cid, qid, v, n, st, done)
            return done

        def do_weekly(wk_end):
            info = wk_days.get((u.id, wk_end))
            if not info or info['nd'] < 3 or wk_end > last_date:
                return
            decay_w = max(.45, 1 - (wk_end - u.enrolled_on).days * .0004)
            if r.random() >= u.a * decay_w * .65:
                return                         # no check-in, no row
            c = SimpleNamespace(r=r, u=u, wk_workout=wk.get((u.id, wk_end), 'Walking'), mood='Neutral',
                                sleep=info['sl'], goal=u.goal, goal_p=.5, goal_met=None, goal_level=None)
            t = hhmm(wk_end, r.randint(10 * 60, 20 * 60))
            done = t + timedelta(minutes=r.randint(3, 10))
            cid = emit_checkin(u, wk_end, 'weekly', 'full', 'completed', t, done)
            qs = [q for d_ in doms for q in V.DQ_EXTRA.get((d_, 'weekly'), [])]
            qs += [q for q in assigned if Q[q]['slot'] == 'weekly']
            for qid in qs:
                v, n = V.GEN[qid](c)
                if v == '' :
                    emit_answer(cid, qid, '', None, 'skipped', done)
                else:
                    emit_answer(cid, qid, v, None if n is None else n, 'answered', done)

        for rec in recs:
            d = rec['date']
            if prev_wk is not None and rec['wk'] != prev_wk:
                do_weekly(prev_wk)
            prev_wk = rec['wk']
            if pending and pending[0] != d - timedelta(days=1):       # gap: that evening is closed, no penalty
                emit_checkin(u, pending[0], 'evening', length, 'closed_unstarted'); pending = None

            days_in = (d - u.enrolled_on).days
            decay = max(.45, 1 - days_in * .0004)
            lapse = False
            if getattr(u, 'lapse_left', 0) > 0:
                u.lapse_left -= 1; lapse = True
            elif r.random() < .008:
                u.lapse_left = r.randint(3, 14); lapse = True
            base_p = V.clip(u.a * decay - V.MOOD_SKIP[rec['mood']], .02, .97) * (.12 if lapse else 1.0)
            z = (rec['steps'] - steps_mu) / steps_sd
            conf_latent = 6.3 + .8 * u.m + V.MOOD_CONF[rec['mood']]
            logit = (-.1 + .9 * u.m + V.MOOD_EFF[rec['mood']] + .12 * V.clip(rec['sleep'] - 7, -3, 3)
                     + (.35 if u.goal == 'physical_activity' else .1) * V.clip(z, -2, 2)
                     + .12 * (conf_latent - 6) - (.5 if u.goal == 'substance_use' else 0))
            c = SimpleNamespace(r=r, u=u, mood=rec['mood'], sleep=rec['sleep'], steps=rec['steps'], z=z,
                                workout=rec['workout'], goal=u.goal, goal_p=V.sigmoid(logit), goal_met=None,
                                goal_level=None, conf=None, su_met=None, wk_workout='Walking')
            eng_m, eng_e = r.random() < base_p, r.random() < base_p * .85
            p_yes = .25 + .55 * u.a
            m_done = None

            if eng_m:
                start = hhmm(d, r.randint(6 * 60 + 15, 10 * 60 + 45))
                if pending:                                   # popup: reflect on last night first?
                    pday, pc = pending
                    if r.random() < p_yes:
                        done = do_checkin(pday, 'evening', pc, 0, via=1, start_dt=start)
                        start = done + timedelta(minutes=1)
                    else:
                        decline('evening', pday)
                    pending = None
                m_done = do_checkin(d, 'morning', c, 0, start_dt=start)
            elif pending:                                      # never started the morning: closes without penalty
                emit_checkin(u, pending[0], 'evening', length, 'closed_unstarted'); pending = None

            if eng_e:
                mins = r.randint(18 * 60, 23 * 60 + 15)
                start = hhmm(d, mins)
                if m_done and r.random() < P_BATCH:
                    start = m_done + timedelta(minutes=r.randint(15, 50))
                if not eng_m:                                  # popup: reflect on this morning first?
                    if r.random() < p_yes:
                        done = do_checkin(d, 'morning', c, 0, via=1, start_dt=start)
                        start = done + timedelta(minutes=1)
                    else:
                        decline('morning', d)
                do_checkin(d, 'evening', c, 0, start_dt=start)
            elif eng_m:
                pending = (d, c)                               # evening stays open until tomorrow's morning check-in

            engaged.append(eng_m or eng_e)
            # ---- length: nudge to quick after 3 quiet days, back to full after a steady week
            if length == 'full' and len(engaged) >= 3 and not any(engaged[-3:]) and r.random() < .8:
                length = 'quick'
            elif length == 'quick' and base_len == 'full' and len(engaged) >= 7 and sum(engaged[-7:]) >= 6 and r.random() < .15:
                length = 'full'
        if pending:
            emit_checkin(u, pending[0], 'evening', length, 'closed_unstarted')
        if prev_wk is not None:
            do_weekly(prev_wk)

    for f in out.values():
        f.close()
    print(f'patients={n_users} checkins={ids.c} answers={ids.a}')


if __name__ == '__main__':
    main()
