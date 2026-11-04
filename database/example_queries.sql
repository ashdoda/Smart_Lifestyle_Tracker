-- Example queries for the synthetic check-in database (SQLite).

-- 1. One user's profile: name, domains, tier
SELECT n.full_name, u.base_tier, u.goal_domain, group_concat(d.domain, ', ') AS domains
FROM users u JOIN user_names n USING (user_id) JOIN user_domains d USING (user_id)
WHERE u.user_id = 1 GROUP BY u.user_id;

-- 2. Completion rate by period and tier
SELECT period, tier_offered,
       ROUND(100.0 * SUM(status = 'completed') / COUNT(*), 1) AS pct_completed,
       ROUND(100.0 * SUM(status = 'skipped')   / COUNT(*), 1) AS pct_skipped
FROM checkins GROUP BY period, tier_offered ORDER BY period, tier_offered;

-- 3. Goal-met rate by that day's mood (joins answers to fitness data. Fitness has several rows per day,
--    so take one mood per user-day first)
WITH day_mood AS (
    SELECT user_id, date, MIN(mood) AS mood FROM fitness_records GROUP BY user_id, date
)
SELECT m.mood, COUNT(*) AS answers, ROUND(AVG(r.response_numeric), 3) AS goal_met_rate
FROM responses r JOIN day_mood m ON m.user_id = r.user_id AND m.date = r.date
WHERE r.question_id = 'GE2' GROUP BY m.mood ORDER BY goal_met_rate DESC;

-- 4. A provider-style weekly summary for one user (goal-met days per week)
SELECT strftime('%Y-W%W', date) AS week,
       SUM(response_numeric) AS days_goal_met, COUNT(*) AS evenings_answered
FROM responses WHERE user_id = 1 AND question_id = 'GE2'
GROUP BY week ORDER BY week DESC LIMIT 8;

-- 5. Every answer from one day, with question text
SELECT period, question_text, response_value
FROM v_responses WHERE user_id = 1 AND date = '2024-03-04' ORDER BY period DESC, response_id;

-- 6. Users who were auto-downgraded most often
SELECT n.full_name, COUNT(*) AS downgrades
FROM tier_events e JOIN user_names n USING (user_id)
WHERE e.event = 'auto_downgrade' GROUP BY e.user_id ORDER BY downgrades DESC LIMIT 10;
