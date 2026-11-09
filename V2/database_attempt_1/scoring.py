"""Reference scorer for the V2 database. The backend will own this logic; the database only stores the results.

Rules (as agreed):
  per graded answer   best +1, worst -1; skipped / junk / blank = -1 (the 'skip_value' setting)
  domain score        mean of its graded answers, morning and evening pooled (-1..+1)
  day score           mean of domain scores x 10, plus completion credit, clamped to -10..+10
  free miss           a declined whole check-in is neutral (its graded questions are left out) once per slot
                      per rolling 7 days; after that a declined check-in counts every graded question at -1
  no check-in day     no score (left out of the graph)
  previous-day q's    the sleep question answered this morning scores yesterday
Scoring runs one pass per patient (score_patient) so it scales to the full data set.
"""
import re
from collections import defaultdict
from datetime import date, datetime, timedelta

JUNK_WORDS = {'na', 'n/a', 'none', 'idk', 'asdf', 'asdfgh', 'test', 'no', '.', '-'}
OWN_STATUSES = ('completed', 'counted_miss')


def setting(con, key, cast=float):
    return cast(con.execute('SELECT value FROM settings WHERE key=?', (key,)).fetchone()[0])


def is_junk(value):
    v = ('' if value is None else str(value)).strip().lower()
    return len(v) < 3 or not re.search(r'[a-z]{3}', v) or v in JUNK_WORDS


def points(rule, value, numeric=None):
    if rule == 'yes1':
        return 1.0 if value == 'Yes' else -1.0
    if rule == 'no1':
        return 1.0 if value == 'No' else -1.0
    if rule == 'filled':                     # an answer that is filled in (junk is handled before this)
        return 1.0
    n = float(numeric if numeric is not None else value)
    if rule == 'scale10':
        return (n - 5) / 5
    if rule == 'goal4':                      # 0 No, 1 Some, 2 Most, 3 Yes
        return -1 + 2 * n / 3
    raise ValueError(rule)


# ---------------------------------------------------------------- what a patient is asked
def asked_questions(con, patient_id, day, slot):
    """Top-level questions this patient is asked in this slot on this day (sub-questions appear if their parent is answered)."""
    return con.execute("""
        SELECT q.question_id, q.domain, q.is_bold,
               COALESCE(pq.graded, q.default_graded) AS graded, q.score_rule, q.score_day
        FROM questions q
        LEFT JOIN patient_domains pd ON pd.patient_id=? AND pd.domain=q.domain AND pd.enabled=1
             AND pd.start_date<=? AND (pd.end_date IS NULL OR pd.end_date>=?)
        LEFT JOIN patient_questions pq ON pq.patient_id=? AND pq.question_id=q.question_id
        WHERE (pd.domain IS NOT NULL OR q.domain='provider')       -- provider-added questions belong to no domain
          AND q.slot=? AND q.active=1 AND q.parent_id IS NULL
          AND COALESCE(pq.enabled,1)=1
          AND (q.assigned_only=0 OR pq.question_id IS NOT NULL)
          AND (q.scope='clinic' OR q.patient_id=?)
        ORDER BY q.question_id""", (patient_id, day, day, patient_id, slot, patient_id)).fetchall()


def free_miss_available(con, patient_id, day, slot):
    d = date.fromisoformat(day)
    n = setting(con, 'free_miss_days', int)
    lo, hi = (d - timedelta(days=n - 1)).isoformat(), (d - timedelta(days=1)).isoformat()
    used = con.execute("""SELECT COUNT(*) FROM checkins WHERE patient_id=? AND slot=? AND status='free_miss'
                          AND checkin_day BETWEEN ? AND ?""", (patient_id, slot, lo, hi)).fetchone()[0]
    return used == 0


def popup_needed(con, patient_id, starting_slot, day):
    """Which popup (if any) to show when a check-in is about to start. Returns (slot_to_offer, day, free?) or None."""
    d = date.fromisoformat(day)
    have = lambda dd, s: con.execute('SELECT 1 FROM checkins WHERE patient_id=? AND checkin_day=? AND slot=?',
                                     (patient_id, dd, s)).fetchone() is not None
    if starting_slot == 'morning':
        prev = (d - timedelta(days=1)).isoformat()
        if have(prev, 'morning') and not have(prev, 'evening'):       # active yesterday, evening forgotten
            return ('evening', prev, free_miss_available(con, patient_id, prev, 'evening'))
    if starting_slot == 'evening' and not have(day, 'morning'):
        return ('morning', day, free_miss_available(con, patient_id, day, 'morning'))
    return None


# ---------------------------------------------------------------- saving check-ins (used by the demo and the backend)
def _ts(day, hhmm):
    return f'{day} {hhmm}:00'


def record_checkin(con, patient_id, day, slot, answers, length='full', started=None, completed=None, via_popup=0):
    """Save a completed check-in. `answers` = {question_id: value}; asked questions not in it are stored as skipped."""
    started = started or _ts(day, '08:25' if slot == 'morning' else '20:55')
    completed = completed or _ts(day, '08:30' if slot == 'morning' else '21:00')
    deadline = (datetime.fromisoformat(completed) + timedelta(hours=setting(con, 'edit_hours', int))).isoformat(sep=' ')
    cur = con.execute("""INSERT INTO checkins(patient_id,checkin_day,slot,length,status,started_at,completed_at,edit_deadline,via_popup)
                         VALUES (?,?,?,?, 'completed',?,?,?,?)""",
                      (patient_id, day, slot, length, started, completed, deadline, via_popup))
    cid = cur.lastrowid
    for q in asked_questions(con, patient_id, day, slot):
        if length == 'quick' and not q['is_bold'] and not q['graded']:
            continue                                  # quick mode: graded questions are always asked
        qid = q['question_id']
        if qid in answers:
            v = answers[qid]
            status = 'junk' if (q['score_rule'] == 'filled' and is_junk(v)) else 'answered'
            numeric = None
            if q['score_rule'] in ('scale10', 'goal4'):
                numeric = float(v)
            con.execute('INSERT INTO answers(checkin_id,question_id,value,value_numeric,status,answered_at) VALUES (?,?,?,?,?,?)',
                        (cid, qid, str(v), numeric, status, completed))
        else:
            con.execute("INSERT INTO answers(checkin_id,question_id,value,status,answered_at) VALUES (?,?,NULL,'skipped',?)",
                        (cid, qid, completed))
    return cid


def decline_checkin(con, patient_id, day, slot, via_popup=0):
    """The patient said No to a whole check-in. Free once per slot per rolling 7 days, otherwise every graded question is skipped."""
    free = free_miss_available(con, patient_id, day, slot)
    cur = con.execute("INSERT INTO checkins(patient_id,checkin_day,slot,status,via_popup) VALUES (?,?,?,?,?)",
                      (patient_id, day, slot, 'free_miss' if free else 'counted_miss', via_popup))
    if not free:
        for q in asked_questions(con, patient_id, day, slot):
            if q['graded']:
                con.execute("INSERT INTO answers(checkin_id,question_id,value,status) VALUES (?,?,NULL,'skipped')",
                            (cur.lastrowid, q['question_id']))
    return 'free_miss' if free else 'counted_miss'


# ---------------------------------------------------------------- scoring (one pass per patient)
def load_patient_rows(con, patient_id):
    return con.execute("""
        SELECT c.checkin_id, c.checkin_day, c.slot, c.length, c.status AS cstatus,
               a.answer_id, a.value, a.value_numeric, a.status AS astatus,
               q.domain, q.score_rule, q.score_day, COALESCE(pq.graded, q.default_graded) AS graded
        FROM checkins c
        LEFT JOIN answers a ON a.checkin_id=c.checkin_id AND a.status!='optional_skip'
        LEFT JOIN questions q ON q.question_id=a.question_id
        LEFT JOIN patient_questions pq ON pq.patient_id=c.patient_id AND pq.question_id=a.question_id
        WHERE c.patient_id=? AND c.slot!='weekly'""", (patient_id,)).fetchall()


def compute_scores(rows, skip=-1.0, credit_quick=0.5, credit_full=0.6):
    own_days = {r['checkin_day'] for r in rows if r['cstatus'] in OWN_STATUSES}
    by_domain = defaultdict(lambda: defaultdict(list))        # effective day -> domain -> [points]
    asked, answered, any_full = defaultdict(int), defaultdict(int), defaultdict(bool)
    snapshots = []
    for r in rows:
        if r['answer_id'] is None:
            continue
        cday = r['checkin_day']
        if r['cstatus'] in OWN_STATUSES:
            asked[cday] += 1
            answered[cday] += r['astatus'] == 'answered'
            any_full[cday] |= (r['length'] == 'full' and r['cstatus'] == 'completed')
        if not r['graded']:
            continue
        pts = skip if r['astatus'] in ('skipped', 'junk') else points(r['score_rule'], r['value'], r['value_numeric'])
        eff = (date.fromisoformat(cday) - timedelta(days=1)).isoformat() if r['score_day'] == 'previous' else cday
        by_domain[eff][r['domain']].append(pts)
        snapshots.append((pts, r['answer_id']))
    results = {}
    for day in sorted(own_days):
        doms = by_domain.get(day)
        if not doms:
            continue                                           # everything excluded: left out of the graph
        dom = {k: sum(v) / len(v) for k, v in doms.items()}
        base = 10 * sum(dom.values()) / len(dom)
        factor = credit_full if any_full[day] else credit_quick
        credit = factor * answered[day] / asked[day] if asked[day] else 0.0
        results[day] = {'domains': dom, 'n_graded': {k: len(v) for k, v in doms.items()},
                        'base': base, 'credit': credit, 'score': max(-10.0, min(10.0, base + credit))}
    return results, snapshots


def score_patient(con, patient_id, store=True):
    skip = setting(con, 'skip_value')
    results, snaps = compute_scores(load_patient_rows(con, patient_id), skip,
                                    setting(con, 'credit_quick'), setting(con, 'credit_full'))
    if store:
        now = datetime.now().isoformat(sep=' ', timespec='seconds')
        con.execute('DELETE FROM domain_scores WHERE patient_id=?', (patient_id,))
        con.execute('DELETE FROM daily_scores WHERE patient_id=?', (patient_id,))
        con.executemany('INSERT INTO domain_scores VALUES (?,?,?,?,?)',
                        [(patient_id, d, k, round(v, 4), r['n_graded'][k]) for d, r in results.items() for k, v in r['domains'].items()])
        con.executemany('INSERT INTO daily_scores VALUES (?,?,?,?,?,?)',
                        [(patient_id, d, round(r['base'], 3), round(r['credit'], 3), round(r['score'], 3), now) for d, r in results.items()])
        con.executemany('UPDATE answers SET graded=1, points_possible=1, points_earned=? WHERE answer_id=?', snaps)
    return results


def score_day(con, patient_id, day, store=True):
    return score_patient(con, patient_id, store).get(day)


def rescore_patient(con, patient_id):
    """The 'rescore' command."""
    return score_patient(con, patient_id, True)
