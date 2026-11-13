"""Reference scorer for the V2 database. The backend will own this logic; the database only stores the results.

Rules (as agreed):
  per graded answer   best +1, worst -1; skipped / junk / blank = -1 (the 'skip_value' setting)
  domain score        mean of its graded answers, morning and evening pooled (-1..+1)
  day score           0 to 100: 50 + 50 x (mean of the domain scores), plus completion credit (points on the 0-100 scale), clamped to 0..100
  free miss           a declined whole check-in is neutral (its graded questions are left out) once per slot
                      per rolling 7 days; after that a declined check-in counts every graded question at -1
  no check-in day     no score (left out of the graph)
  previous-day q's    the sleep question answered this morning scores yesterday
  step goal           for a patient with a watch, "Did I reach my step target today?" (PAE4) is NOT asked: it is worked out from the
                      day's steps against the latest step target the patient entered (PAM1) and graded like a Yes/No (+1 / -1).
                      Reaching the goal is what makes the "How did I feel?" question (PAE5) appear. Recomputed on every scoring run.
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


# ---------------------------------------------------------------- step goal from watch steps
STEP_TARGET_Q, STEP_GOAL_Q, STEP_FEEL_Q = 'PAM1', 'PAE4', 'PAE5'


def step_goal(con, patient_id, day):
    """How the step goal is decided for this patient on this day.
    None                      -> ask the patient as usual (no watch, or the question isn't switched on)
                                 (a watch patient with no steps row for the day counts as 0 steps)
    {'target': None, ...}     -> steps exist but the patient has never entered a target: not asked, not graded
    {'target': t, 'steps': s, 'reached': bool}  -> decided from the watch; PAE4 is not asked."""
    uid = con.execute('SELECT fitness_user_id FROM patients WHERE patient_id=?', (patient_id,)).fetchone()
    if not uid or uid[0] is None:
        return None
    row = con.execute('SELECT steps FROM fitness_records WHERE user_id=? AND date=?', (uid[0], day)).fetchone()
    steps = row[0] if row and row[0] is not None else 0          # no reading that day counts as zero steps
    on = con.execute("""SELECT 1 FROM patient_domains WHERE patient_id=? AND domain='physical_activity' AND enabled=1
                        AND start_date<=? AND (end_date IS NULL OR end_date>?)""", (patient_id, day, day)).fetchone()
    off = con.execute('SELECT 1 FROM patient_questions WHERE patient_id=? AND question_id=? AND enabled=0',
                      (patient_id, STEP_GOAL_Q)).fetchone()
    if not on or off:
        return None
    t = con.execute("""SELECT a.value_numeric FROM answers a JOIN checkins c ON c.checkin_id=a.checkin_id
                       WHERE c.patient_id=? AND c.slot='morning' AND c.status='completed' AND c.checkin_day<=?
                         AND a.question_id=? AND a.status='answered' AND a.value_numeric>0
                       ORDER BY c.checkin_day DESC LIMIT 1""", (patient_id, day, STEP_TARGET_Q)).fetchone()
    if not t:
        return {'target': None, 'steps': steps, 'reached': None}
    return {'target': t[0], 'steps': steps, 'reached': steps >= t[0]}


def apply_step_goal(con, patient_id, first_day=None, last_day=None):
    """Write the watch-based Yes/No into each completed evening check-in (so scoring and every screen see an ordinary answer).
    Without a target the question is treated as not asked; when the goal was not reached the 'how did I feel' answer goes.
    A day with no step reading counts as 0 steps. Returns the days whose automatic answers changed, so the caller can
    re-score them (a target edit or reset moves every later evening that carries the target forward)."""
    uid = con.execute('SELECT fitness_user_id FROM patients WHERE patient_id=?', (patient_id,)).fetchone()
    if not uid or uid[0] is None:
        return []
    evenings = con.execute("""SELECT c.checkin_id, c.checkin_day, c.completed_at FROM checkins c
                              WHERE c.patient_id=? AND c.slot='evening' AND c.status='completed' AND c.checkin_day BETWEEN ? AND ?""",
                           (patient_id, first_day or '0000-00-00', last_day or '9999-99-99')).fetchall()
    changed = []
    for cid, day, done in evenings:
        before = (con.execute('SELECT value FROM answers WHERE checkin_id=? AND question_id=?', (cid, STEP_GOAL_Q)).fetchone(),
                  con.execute('SELECT 1 FROM answers WHERE checkin_id=? AND question_id=?', (cid, STEP_FEEL_Q)).fetchone())
        before = (before[0][0] if before[0] else None, bool(before[1]))
        g = step_goal(con, patient_id, day)
        if g is None or g['reached'] is None:                 # switched off, or no target ever entered: nothing automatic stays
            con.execute('DELETE FROM answers WHERE checkin_id=? AND question_id IN (?,?)', (cid, STEP_GOAL_Q, STEP_FEEL_Q))
            after = (None, False)
        else:
            con.execute("""INSERT INTO answers(checkin_id,question_id,value,value_numeric,status,answered_at) VALUES (?,?,?,NULL,'answered',?)
                           ON CONFLICT(checkin_id,question_id) DO UPDATE SET value=excluded.value, value_numeric=NULL, status='answered'""",
                        (cid, STEP_GOAL_Q, 'Yes' if g['reached'] else 'No', done))
            if not g['reached']:
                con.execute('DELETE FROM answers WHERE checkin_id=? AND question_id=?', (cid, STEP_FEEL_Q))
            after = ('Yes' if g['reached'] else 'No', before[1] and g['reached'])
        if after != before:
            changed.append(day)
    return changed


# ---------------------------------------------------------------- scoring (one pass per patient)
def load_patient_rows(con, patient_id, first_day=None, last_day=None):
    return con.execute("""
        SELECT c.checkin_id, c.checkin_day, c.slot, c.length, c.status AS cstatus,
               a.answer_id, a.value, a.value_numeric, a.status AS astatus,
               q.domain, q.score_rule, q.score_day, COALESCE(pq.graded, q.default_graded) AS graded
        FROM checkins c
        LEFT JOIN answers a ON a.checkin_id=c.checkin_id AND a.status!='optional_skip'
        LEFT JOIN questions q ON q.question_id=a.question_id
        LEFT JOIN patient_questions pq ON pq.patient_id=c.patient_id AND pq.question_id=a.question_id
        WHERE c.patient_id=? AND c.slot!='weekly' AND c.checkin_day BETWEEN ? AND ?""",
        (patient_id, first_day or '0000-00-00', last_day or '9999-99-99')).fetchall()


def compute_scores(rows, skip=-1.0, credit_quick=2.5, credit_full=3.0):
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
        base = 50 + 50 * sum(dom.values()) / len(dom)          # mean domain score -1..+1 -> 0..100
        factor = credit_full if any_full[day] else credit_quick
        credit = factor * answered[day] / asked[day] if asked[day] else 0.0
        results[day] = {'domains': dom, 'n_graded': {k: len(v) for k, v in doms.items()},
                        'base': base, 'credit': credit, 'score': max(0.0, min(100.0, base + credit))}
    return results, snapshots


def score_patient(con, patient_id, store=True, days=None):
    """Score a patient. days=None rescores every day; days=[...] rescores only those days (a day's score depends only
    on its own check-ins and the next morning's previous-day question, so a small window is enough)."""
    skip = setting(con, 'skip_value')
    if store:
        stale = apply_step_goal(con, patient_id)              # whole history: a target edit moves every later evening too
        if days:
            days = sorted(set(days) | set(stale))
    first = last = None
    if days:
        first = (date.fromisoformat(min(days)) - timedelta(days=1)).isoformat()
        last = (date.fromisoformat(max(days)) + timedelta(days=1)).isoformat()
    results, snaps = compute_scores(load_patient_rows(con, patient_id, first, last), skip,
                                    setting(con, 'credit_quick'), setting(con, 'credit_full'))
    if days:
        results = {d: r for d, r in results.items() if d in set(days)}
    if store:
        now = datetime.now().isoformat(sep=' ', timespec='seconds')
        if days:
            marks = ','.join('?' * len(days))
            con.execute(f'DELETE FROM domain_scores WHERE patient_id=? AND day IN ({marks})', (patient_id, *days))
            con.execute(f'DELETE FROM daily_scores WHERE patient_id=? AND day IN ({marks})', (patient_id, *days))
        else:
            con.execute('DELETE FROM domain_scores WHERE patient_id=?', (patient_id,))
            con.execute('DELETE FROM daily_scores WHERE patient_id=?', (patient_id,))
        con.executemany('INSERT INTO domain_scores VALUES (?,?,?,?,?)',
                        [(patient_id, d, k, round(v, 4), r['n_graded'][k]) for d, r in results.items() for k, v in r['domains'].items()])
        con.executemany('INSERT INTO daily_scores VALUES (?,?,?,?,?,?)',
                        [(patient_id, d, round(r['base'], 3), round(r['credit'], 3), round(r['score'], 3), now) for d, r in results.items()])
        con.execute('''UPDATE answers SET graded=NULL, points_possible=NULL, points_earned=NULL WHERE graded IS NOT NULL AND checkin_id IN
                       (SELECT checkin_id FROM checkins WHERE patient_id=? AND checkin_day BETWEEN ? AND ?)''',
                    (patient_id, first or '0000-00-00', last or '9999-99-99'))       # a switched-off question must not keep an old snapshot
        con.executemany('UPDATE answers SET graded=1, points_possible=1, points_earned=? WHERE answer_id=?', snaps)
    return results


def score_day(con, patient_id, day, store=True):
    return score_patient(con, patient_id, store, days=[day]).get(day)


def rescore_patient(con, patient_id):
    """The 'rescore' command."""
    return score_patient(con, patient_id, True)
