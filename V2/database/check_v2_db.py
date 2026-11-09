#!/usr/bin/env python3
"""Read-only sanity check for the V2 database.   python3 check_v2_db.py [v2.db]"""
import os
import sqlite3
import sys

db = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'v2.db')
con = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
q1 = lambda sql: con.execute(sql).fetchone()[0]
rows = lambda sql: con.execute(sql).fetchall()
problems = []


def check(ok, msg):
    print(('  ok   ' if ok else '  FAIL ') + msg)
    if not ok:
        problems.append(msg)


print('Counts')
for t in ('patients', 'patient_domains', 'patient_questions', 'questions', 'checkins', 'answers', 'daily_scores', 'domain_scores', 'fitness_records'):
    print(f'  {t:<18}{q1(f"SELECT COUNT(*) FROM {t}"):>12,}')
print('\nIntegrity')
check(q1('PRAGMA foreign_key_check') is None if False else not rows('PRAGMA foreign_key_check'), 'no foreign-key violations')
check(q1("SELECT COUNT(*) FROM daily_scores WHERE score < -10 OR score > 10") == 0, 'every daily score is within -10..+10')
check(q1("SELECT COUNT(*) FROM answers a JOIN checkins c USING(checkin_id) WHERE c.status='free_miss'") == 0, 'free-miss check-ins have no answer rows')
check(q1("SELECT COUNT(*) FROM answers a JOIN checkins c USING(checkin_id) WHERE c.status='counted_miss' AND a.status!='skipped'") == 0, 'counted-miss answers are all skipped')
check(q1("""SELECT COUNT(*) FROM checkins a JOIN checkins b ON a.patient_id=b.patient_id AND a.slot=b.slot
            AND b.checkin_day > a.checkin_day AND b.checkin_day <= date(a.checkin_day,'+6 days')
            WHERE a.status='free_miss' AND b.status='free_miss'""") == 0, 'never two free misses in the same slot within 7 days')
check(q1("SELECT COUNT(*) FROM answers a JOIN questions q USING(question_id) WHERE a.graded=1 AND a.points_earned IS NULL") == 0, 'every scored answer has points stored')
check(q1("SELECT COUNT(*) FROM answers a JOIN checkins c USING(checkin_id) WHERE c.slot='weekly' AND a.graded=1") == 0, 'weekly answers are never graded')
check(q1("""SELECT COUNT(*) FROM patients p WHERE NOT EXISTS (SELECT 1 FROM patient_domains d WHERE d.patient_id=p.patient_id AND d.domain='general')""") == 0, 'every patient has General')
# independent re-computation of the daily score from the stored points
bad = q1("""
WITH eff AS (
  SELECT c.patient_id, q.domain,
         CASE q.score_day WHEN 'previous' THEN date(c.checkin_day,'-1 day') ELSE c.checkin_day END AS day,
         a.points_earned AS pts
  FROM answers a JOIN checkins c USING(checkin_id) JOIN questions q USING(question_id) WHERE a.graded=1),
dom AS (SELECT patient_id, day, domain, AVG(pts) AS s FROM eff GROUP BY 1,2,3),
day AS (SELECT patient_id, day, 10*AVG(s) AS base FROM dom GROUP BY 1,2)
SELECT COUNT(*) FROM daily_scores d JOIN day USING(patient_id, day) WHERE ABS(d.base_score - day.base) > 0.01""")
check(bad == 0, 'stored base scores match an independent SQL recomputation from the stored points')

print('\nCheck-ins')
for r in rows("SELECT slot, status, COUNT(*) FROM checkins GROUP BY 1,2 ORDER BY 1,2"):
    print(f'  {r[0]:<8}{r[1]:<18}{r[2]:>9,}')
print(f'  late (answered through the popup): {q1("SELECT COUNT(*) FROM v_flag_late"):,}')
print(f'  batched (< 60 min apart):          {q1("SELECT COUNT(*) FROM v_flag_batched"):,}')
print(f'  quick vs full: ', rows("SELECT length, COUNT(*) FROM checkins WHERE status='completed' AND slot!='weekly' GROUP BY 1"))

print('\nPatients')
print('  optional domains per patient:', rows("""SELECT n, COUNT(*) FROM (SELECT patient_id, COUNT(*)-1 AS n FROM patient_domains GROUP BY 1) GROUP BY n ORDER BY n"""))
print('  answer statuses:', rows("SELECT status, COUNT(*) FROM answers GROUP BY 1"))

print('\nScores')
print('  scored days:', q1('SELECT COUNT(*) FROM daily_scores'), ' patients with a score:', q1('SELECT COUNT(DISTINCT patient_id) FROM daily_scores'))
print('  daily score by band:', rows("""SELECT CASE WHEN score<-6 THEN '1 below -6' WHEN score<-2 THEN '2 -6..-2' WHEN score<2 THEN '3 -2..+2'
                                        WHEN score<4 THEN '4 +2..+4' WHEN score<7 THEN '5 +4..+7' ELSE '6 above +7' END b, COUNT(*)
                                 FROM daily_scores GROUP BY 1 ORDER BY 1"""))
print('  average daily score:', round(q1('SELECT AVG(score) FROM daily_scores'), 2),
      ' average completion credit:', round(q1('SELECT AVG(completion_credit) FROM daily_scores'), 2))
print('  domains per scored day:', rows("SELECT n, COUNT(*) FROM (SELECT COUNT(*) n FROM domain_scores GROUP BY patient_id, day) GROUP BY n ORDER BY n"))
print('  domain-days built from a single graded answer:',
      rows("SELECT domain, COUNT(*) FROM domain_scores WHERE n_graded=1 GROUP BY 1 ORDER BY 2 DESC"))
print('  mean daily score, evening free miss vs evening answered:',
      rows("""SELECT e.status, ROUND(AVG(d.score),2), COUNT(*) FROM daily_scores d JOIN checkins e
              ON e.patient_id=d.patient_id AND e.checkin_day=d.day AND e.slot='evening'
              WHERE e.status IN ('completed','free_miss','counted_miss','closed_unstarted') GROUP BY 1"""))
print('  patients with the 3-day flags:', q1('SELECT COUNT(DISTINCT patient_id) FROM v_flag_below_green_3'), 'below green,',
      q1('SELECT COUNT(*) FROM v_flag_missed_3'), 'missed 3+ days')
print()
print('ALL CHECKS PASSED' if not problems else f'{len(problems)} CHECK(S) FAILED')
sys.exit(1 if problems else 0)
