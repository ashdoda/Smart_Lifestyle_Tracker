#!/usr/bin/env python3
"""Builds demo.db from schema.sql with a SMALL sample question bank and a handful of patients,
runs the scorer, and prints what happens. No full data set is generated here.
    python demo.py
"""
import os
import sqlite3
import scoring as S

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, 'demo.db')

# id, domain, text, type, slot, bold, graded, rule, score_day
BANK = [
 ('GM1','general',   'How good do I feel this morning?',            'scale10','morning',1,1,'scale10','same'),
 ('GM2','general',   'How well did I sleep last night?',            'scale10','morning',1,1,'scale10','previous'),
 ('GE0','general',   'How content was I with today?',               'scale10','evening',1,1,'scale10','same'),
 ('GE2','general',   'Did I reach my goal today?',                  'choice', 'evening',1,1,'goal4',  'same'),
 ('GE3','general',   'One thing I am grateful for today',           'text',   'evening',0,1,'filled', 'same'),
 ('PAM1','physical_activity','I plan to be active today',           'yes_no', 'morning',1,1,'yes1',   'same'),
 ('PAM2','physical_activity','My step target for today',            'number', 'morning',1,0,None,     'same'),
 ('PAE1','physical_activity','I reached my step target today',      'yes_no', 'evening',1,1,'yes1',   'same'),
 ('SCE1','social',   'I felt connected to someone today',           'yes_no', 'evening',1,1,'yes1',   'same'),
 ('SCE2','social',   'I avoided social contact today',              'yes_no', 'evening',1,1,'no1',    'same'),
 ('SCE3','social',   'Something I enjoyed with others today',       'text',   'evening',0,0,None,     'same'),
]
BEST  = dict(GM1=10, GM2=10, GE0=10, GE2=3, GE3='my friend called me', PAM1='Yes', PAM2=8000, PAE1='Yes', SCE1='Yes', SCE2='No', SCE3='a walk with a friend')
GOOD  = dict(BEST, GM1=8, GM2=8, GE0=8, GE2=2)
MIXED = dict(GM1=6, GM2=4, GE0=5, GE2=1, GE3='the sunny weather', PAM1='Yes', PAM2=6000, PAE1='No', SCE1='Yes', SCE2='Yes')
ROUGH = dict(GM1=2, GM2=2, GE0=1, GE2=0, GE3='idk', PAM1='No', PAM2=6000, PAE1='No', SCE1='No', SCE2='Yes')
MORNING = {k: v for k, v in GOOD.items() if k in ('GM1', 'GM2', 'PAM1', 'PAM2')}
EVENING_ROUGH = {k: v for k, v in ROUGH.items() if k in ('GE0', 'GE2', 'GE3', 'PAE1', 'SCE1', 'SCE2')}
EVENING_GOOD = {k: v for k, v in GOOD.items() if k in ('GE0', 'GE2', 'GE3', 'PAE1', 'SCE1', 'SCE2', 'SCE3')}


def build():
    if os.path.exists(DB):
        os.remove(DB)
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    con.executescript(open(os.path.join(HERE, 'schema.sql')).read())
    con.executemany('INSERT INTO settings VALUES (?,?,?)', [
        ('green_min', '70', 'light-green band starts here (scores run 0 to 100)'),
        ('rolling_days', '7', 'rolling average window'), ('skip_value', '-1', 'skipped / junk / blank answer'),
        ('batch_minutes', '60', 'morning + evening within this gap -> batched flag'),
        ('edit_hours', '24', 'edit window from original completion'), ('day_start_hour', '4', 'check-in day = 4 AM - 4 AM'),
        ('credit_quick', '2.5', 'completion credit, quick'), ('credit_full', '3', 'completion credit, full'),
        ('free_miss_days', '7', 'one free miss per slot per rolling window'), ('as_of', '2026-11-08', 'demo "today"'), ('graph_min_days', '1', 'scored days before the patient graph appears')])
    con.executemany('INSERT INTO domains VALUES (?,?,?)', [
        ('general', 'General', 1), ('physical_activity', 'Physical activity', 0), ('social', 'Social', 0)])
    for b in BANK:
        con.execute('INSERT INTO questions(question_id,domain,text,answer_type,slot,is_bold,default_graded,score_rule,score_day) VALUES (?,?,?,?,?,?,?,?,?)',
                    (b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8]))
    return con


def add_patient(con, pid, name, domains=('physical_activity', 'social')):
    con.execute("INSERT INTO patients(patient_id,first_name,last_name,enrolled_on) VALUES (?,?,?,'2026-10-01')", (pid, name, 'Demo'))
    for d in ('general',) + tuple(domains):
        con.execute("INSERT INTO patient_domains VALUES (?,?,1,'full','2026-10-01',NULL)", (pid, d))


def show(con, pid, label, day):
    r = S.score_day(con, pid, day)
    if r is None:
        print(f'  {label:<44} no score (left out of the graph)')
        return
    doms = '  '.join(f"{k[:3]} {v:+.2f}" for k, v in r['domains'].items())
    print(f"  {label:<44} {r['score']:+6.2f}   base {r['base']:+6.2f} + credit {r['credit']:.2f}   [{doms}]")


def main():
    con = build()
    D = '2026-11-02'
    print('\n== Single-day scenarios (patient: General + Physical activity + Social) ==')
    pid = 0
    def one(label, morning, evening, prior_free=False, n=[0]):
        n[0] += 1
        p = n[0]
        add_patient(con, p, label)
        if prior_free:                                    # a free evening miss earlier in the same week
            S.decline_checkin(con, p, '2026-10-30', 'evening')
        S.record_checkin(con, p, D, 'morning', morning)
        if isinstance(evening, dict):
            S.record_checkin(con, p, D, 'evening', evening)
        else:
            outcome = S.decline_checkin(con, p, D, 'evening')
            label += f' ({outcome})'
        show(con, p, label, D)
    one('A  everything best', {k: BEST[k] for k in ('GM1','GM2','PAM1','PAM2')}, {k: BEST[k] for k in ('GE0','GE2','GE3','PAE1','SCE1','SCE2','SCE3')})
    one('B  good day', MORNING, EVENING_GOOD)
    one('C  mixed day', {k: MIXED[k] for k in ('GM1','GM2','PAM1','PAM2')}, {k: MIXED[k] for k in ('GE0','GE2','GE3','PAE1','SCE1','SCE2')})
    one('D  good morning, honest rough evening', MORNING, EVENING_ROUGH)
    one('E  good morning, evening declined (1st this week)', MORNING, None)
    one('F  good morning, evening declined (2nd this week)', MORNING, None, prior_free=True)
    one('G  good morning, evening answered with junk', MORNING, dict(EVENING_GOOD, GE3='asdfgh'))

    print('\n== General-only patient ==')
    add_patient(con, 20, 'Gen-only', domains=())
    S.record_checkin(con, 20, D, 'morning', MORNING)
    S.record_checkin(con, 20, D, 'evening', EVENING_GOOD)
    show(con, 20, 'H  General only, good day', D)

    print('\n== Rae: ten days with one free miss each slot, a counted miss, then a gap ==')
    add_patient(con, 30, 'Rae')
    days = ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']
    plan = {
      days[0]: (MORNING, EVENING_GOOD, 'good day'),
      days[1]: (MORNING, EVENING_GOOD, 'good day'),
      days[2]: ({k: MIXED[k] for k in ('GM1','GM2','PAM1','PAM2')}, {k: MIXED[k] for k in ('GE0','GE2','GE3','PAE1','SCE1','SCE2')}, 'mixed day'),
      days[3]: (MORNING, None, 'evening declined -> free'),
      days[4]: (None, EVENING_GOOD, 'morning declined -> free (own slot)'),
      days[5]: (MORNING, None, 'evening declined -> counted (2nd in 7 days)'),
      days[6]: ({k: ROUGH[k] for k in ('GM1','GM2','PAM1','PAM2')}, EVENING_ROUGH, 'rough day'),
    }
    for day, (m, e, label) in plan.items():
        for slot, content in (('morning', m), ('evening', e)):
            if isinstance(content, dict):
                S.record_checkin(con, 30, day, slot, content)
            else:
                S.decline_checkin(con, 30, day, slot)
        show(con, 30, f'{day}  {label}', day)
    S.rescore_patient(con, 30)      # the 'rescore' command: previous-day sleep answers now land on the day before

    print('\n== Flags demo: batched and late ==')
    add_patient(con, 40, 'Lee')
    S.record_checkin(con, 40, '2026-11-03', 'morning', MORNING)
    S.record_checkin(con, 40, '2026-11-03', 'evening', EVENING_GOOD)
    S.record_checkin(con, 40, '2026-11-04', 'morning', MORNING, started='2026-11-04 20:20:00', completed='2026-11-04 20:30:00')
    S.record_checkin(con, 40, '2026-11-04', 'evening', EVENING_GOOD, started='2026-11-04 20:55:00', completed='2026-11-04 21:05:00')
    S.record_checkin(con, 40, '2026-11-05', 'morning', MORNING)
    S.record_checkin(con, 40, '2026-11-05', 'evening', EVENING_GOOD, started='2026-11-06 07:45:00', completed='2026-11-06 07:50:00', via_popup=1)
    print('  popup if Lee starts the 11-06 morning check-in:', S.popup_needed(con, 40, 'morning', '2026-11-06'), '(evening of 11-05 already done late)')
    add_patient(con, 41, 'Mo')
    S.record_checkin(con, 41, '2026-11-05', 'morning', MORNING)
    print('  popup if Mo starts the 11-06 morning check-in:  ', S.popup_needed(con, 41, 'morning', '2026-11-06'))
    add_patient(con, 42, 'Nia')
    print('  popup if Nia starts an evening check-in on 11-06 with no morning:', S.popup_needed(con, 42, 'evening', '2026-11-06'))

    print('\n== Down-trend and gap patients ==')
    add_patient(con, 50, 'Kai')
    for day in ('2026-10-31', '2026-11-01', '2026-11-02'):
        S.record_checkin(con, 50, day, 'morning', {k: ROUGH[k] for k in ('GM1','GM2','PAM1','PAM2')})
        S.record_checkin(con, 50, day, 'evening', EVENING_ROUGH)
        show(con, 50, f'Kai {day} rough', day)
    S.record_checkin(con, 50, '2026-11-03', 'morning', MORNING)   # (Kai has a check-in 5 days ago? no: as_of is 11-08)
    con.commit()

    q = lambda sql: con.execute(sql).fetchall()
    print('\n== Flags (views) ==')
    print('  late:        ', [tuple(r) for r in q('SELECT patient_id, checkin_day, slot FROM v_flag_late')])
    print('  batched:     ', [tuple(r) for r in q('SELECT patient_id, checkin_day, minutes_apart FROM v_flag_batched')])
    print('  free misses: ', [tuple(r) for r in q('SELECT patient_id, checkin_day, slot FROM v_flag_free_miss')])
    print('  3 days below green:', [tuple(r) for r in q('SELECT patient_id, latest_day FROM v_flag_below_green_3')])
    print('  3+ days missed:    ', [tuple(r) for r in q('SELECT patient_id, last_checkin_day, days_missed FROM v_flag_missed_3')])
    print('\n== Rae: graph values (daily + 7-day rolling) ==')
    for r in q('SELECT day, ROUND(score,2) s, ROUND(rolling_score,2) r FROM v_rolling_scores WHERE patient_id=30 ORDER BY day'):
        print(f'  {r["day"]}  daily {r["s"]:+6.2f}   rolling {r["r"]:+6.2f}')
    con.close()
    print(f'\nBuilt {DB}')


if __name__ == '__main__':
    main()
