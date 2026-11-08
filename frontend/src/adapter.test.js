// WHAT THIS FILE DOES
// Checks the functions in adapter.js, which turn the server's answers into what the screens show
// (scores, status words, sentences). Each test() is one check with a plain-English name.
// `npm test` runs all of them and says which one failed, if any.
// Bring in the test tools and the functions being checked
import test from 'node:test';
import assert from 'node:assert/strict';
import {shapeSeries, shapeDomainScores, shapePatient, cardsOf, doneOn, percentToGraph, percentDiffToGraph, todayWait, pointsText, weekCompareText, greenDaysText, percentEarnedText, statusOf, belowText, periodsShort, lastCheckinText, checkinStreak, dayIndicator, dayIndicatorText, checkinPrompt, chooserAction, STATUS_TEXT} from './adapter.js';

// Made-up days of server data used by the checks below
const days = [
  {date: '2026-11-05', percent: 30, graph_value: -4, rolling_graph_value: -4.8, in_progress: false, rolling_percent: 26.2, checkins_done: ['morning', 'evening'], domains: {sleep: {percent: 50}, general: {percent: 10}}},
  {date: '2026-11-06', percent: 0, graph_value: -10, rolling_graph_value: -5.1, in_progress: false, rolling_percent: 22.4, checkins_done: [], domains: {}},
  {date: '2026-11-07', percent: null, in_progress: true, checkins_done: ['morning']},
];

test('score boundaries map to the server graph scale', () => {
  assert.equal(percentToGraph(0), -10);
  assert.equal(percentToGraph(50), 0);
  assert.equal(percentToGraph(70), 4);
  assert.equal(percentToGraph(100), 10);
  assert.equal(percentToGraph(62.5), 2.5);
});

test('missing stays missing, a real zero percent is -10 and a real 50 percent is 0', () => {
  assert.equal(percentToGraph(null), null);
  assert.equal(percentToGraph(undefined), null);
  assert.equal(percentToGraph(0), -10);
  assert.equal(percentToGraph(50), 0);
  assert.equal(percentDiffToGraph(null), null);
});

test('a difference of percents is divided by 5, never shifted by 10', () => {
  assert.equal(percentDiffToGraph(20), 4);
  assert.equal(percentDiffToGraph(-10), -2);
  assert.equal(percentDiffToGraph(0), 0);
  assert.equal(percentToGraph(70) - percentToGraph(50), percentDiffToGraph(20));
});

test('series keeps server values, marks today provisional, never invents a score', () => {
  const s = shapeSeries(days);
  assert.deepEqual(s.map(x => x.score), [30, 0, null]);
  assert.deepEqual(s.map(x => x.prov), [false, false, true]);
  assert.deepEqual(s.map(x => x.done), [true, false, true]);
  assert.deepEqual(s.map(x => x.ci), [['morning', 'evening'], [], ['morning']]);
  assert.equal(s[2].roll, null);
  assert.equal(s[0].g, -4);
  assert.equal(s[0].rg, -4.8);
  assert.equal(s[1].g, -10);
  assert.equal(s[2].g, null);
});

test('a finished day with no check-in keeps the server score but is not counted as checked in', () => {
  const s = shapeSeries([days[1]]);
  assert.equal(s[0].g, -10);
  assert.equal(s[0].done, false);
  assert.deepEqual(s[0].ci, []);
});

test('today with no check-in submitted yet has no score numbers', () => {
  const s = shapeSeries([{date: '2026-11-08', percent: 0, graph_value: -10, rolling_graph_value: -3, rolling_percent: 40, in_progress: true, checkins_done: []}]);
  assert.equal(s[0].prov, true);
  for (const k of ['score', 'g', 'rg', 'roll']) assert.equal(s[0][k], null);
});

test('today after a check-in keeps the server numbers', () => {
  const s = shapeSeries([{date: '2026-11-08', percent: 25, graph_value: -5, rolling_graph_value: -2.5, in_progress: true, checkins_done: ['morning']}]);
  assert.equal(s[0].g, -5);
  assert.equal(s[0].rg, -2.5);
  assert.equal(s[0].score, 25);
});

test('domain scores are keyed by card and skip the general domain', () => {
  assert.deepEqual(shapeDomainScores(days)['2026-11-05'], {sleep: 50});
});

test('patient record carries the server flags', () => {
  const p = shapePatient({patient_id: 7, first_name: 'A', last_name: 'B', enrolled_on: '2026-09-01', domains: ['general', 'sleep']}, days, {days_below_green_in_a_row: 3, needs_attention: true, last_full_day: null});
  assert.equal(p.id, '7');
  assert.deepEqual(p.unlocked, ['sleep']);
  assert.equal(p.backend.needsAttention, true);
  assert.equal(p.backend.streak, 3);
});

test('helpers', () => {
  assert.deepEqual(cardsOf(['general', 'nutrition', 'x']), ['diet']);
  assert.deepEqual(doneOn(days, '2026-11-05'), ['morning', 'evening']);
  assert.deepEqual(doneOn(days, '2020-01-01'), []);
});

test('today status follows only the submitted periods', () => {
  assert.equal(todayWait([]), 'Waiting for morning check-in');
  assert.equal(todayWait(undefined), 'Waiting for morning check-in');
  assert.equal(todayWait(['evening']), 'Waiting for morning check-in');
  assert.equal(todayWait(['morning']), 'Waiting for evening check-in');
  assert.equal(todayWait(['evening', 'morning']), 'Checked in today');
});

test('percent to graph is monotonic and stays inside the server range', () => {
  let prev = -Infinity;
  for (let p = 0; p <= 100; p += 2.5) { const g = percentToGraph(p); assert.ok(g >= prev && g >= -10 && g <= 10); prev = g; }
});

test('points read with one decimal and a singular only for exactly 1.0', () => {
  assert.equal(pointsText(3.04), '3.0 points');
  assert.equal(pointsText(1), '1.0 point');
  assert.equal(pointsText(1.04), '1.0 point');
  assert.equal(pointsText(0.5), '0.5 points');
});

test('the weekly comparison names the real direction and size, and is about the week, not today', () => {
  assert.equal(weekCompareText(-3.04), 'Weekly average down 3.0 points vs previous week.');
  assert.equal(weekCompareText(5.2), 'Weekly average up 5.2 points vs previous week.');
  assert.ok(!/today/i.test(weekCompareText(-3.04)));
});

test('a tiny difference reads as unchanged, and a missing previous week is never called "about the same"', () => {
  assert.equal(weekCompareText(0.04), 'Weekly average unchanged vs previous week.');
  assert.equal(weekCompareText(-0.04), 'Weekly average unchanged vs previous week.');
  assert.equal(weekCompareText(null), 'No previous week to compare.');
  assert.ok(!/same|unchanged/i.test(weekCompareText(null)));
});

test('a card with no scored days is told apart from a card with zero green-zone days', () => {
  assert.equal(greenDaysText(0, 6), 'Green-zone days: 0 / 6');
  assert.equal(greenDaysText(2, 6), 'Green-zone days: 2 / 6');
  assert.equal(greenDaysText(0, 0), 'No scored days');
  assert.notEqual(greenDaysText(0, 0), greenDaysText(0, 6));
});

test('the saved screen shows the server percent, rounded only for display', () => {
  assert.equal(percentEarnedText(33.4), '33% of available points earned.');
  assert.equal(percentEarnedText(0), '0% of available points earned.');
  assert.equal(percentEarnedText(100), '100% of available points earned.');
  assert.equal(percentEarnedText(null), '');
  // the percent is not rebuilt from the rounded graph value: 33.4% maps to -3.32 on the graph, but the text stays 33%
  assert.equal(percentToGraph(33.4), -3.32);
  assert.equal(percentEarnedText(33.4), '33% of available points earned.');
});

test('status follows the backend flag first, then the latest finished day against the threshold', () => {
  const lf = g => ({date: '2026-11-07', graph_value: g});
  assert.equal(statusOf({lastFull: null, needsAttention: false}, 4), 'new');
  assert.equal(statusOf(null, 4), 'new');
  assert.equal(statusOf({lastFull: lf(-10), needsAttention: true}, 4), 'attention');
  assert.equal(statusOf({lastFull: lf(9), needsAttention: true}, 4), 'attention');
  assert.equal(statusOf({lastFull: lf(3.98), needsAttention: false}, 4), 'watch');
  assert.equal(statusOf({lastFull: lf(4), needsAttention: false}, 4), 'good');
  assert.equal(statusOf({lastFull: lf(4.02), needsAttention: false}, 4), 'good');
  assert.equal(statusOf({lastFull: {date: '2026-11-07', graph_value: null}, needsAttention: false}, 4), 'good');
});

test('below-green text uses the real streak', () => {
  assert.equal(belowText(1), 'Below the green zone for 1 consecutive day.');
  assert.equal(belowText(3), 'Below the green zone for 3 consecutive days.');
});

test('periods and indicators come from submitted periods only', () => {
  assert.equal(periodsShort(['morning']), 'AM');
  assert.equal(periodsShort(['evening']), 'PM');
  assert.equal(periodsShort(['evening', 'morning']), 'AM & PM');
  assert.equal(periodsShort([]), '');
  assert.equal(dayIndicator([]), 'none');
  assert.equal(dayIndicator(undefined), 'none');
  assert.equal(dayIndicator(['morning']), 'am');
  assert.equal(dayIndicator(['evening']), 'pm');
  assert.equal(dayIndicator(['morning', 'evening']), 'both');
  assert.equal(dayIndicatorText(['morning']), 'morning submitted');
  assert.equal(dayIndicatorText([]), 'no check-in submitted');
});

test('last check-in is one concise value', () => {
  const lab = iso => 'Nov ' + Number(iso.slice(8));
  const d = [{d: '2026-11-05', ci: ['morning']}, {d: '2026-11-06', ci: ['morning', 'evening']}, {d: '2026-11-07', ci: []}];
  assert.equal(lastCheckinText(d, '2026-11-08', lab), 'Nov 6 · AM & PM');
  assert.equal(lastCheckinText(d, '2026-11-07', lab), 'Yesterday · AM & PM');
  assert.equal(lastCheckinText([{d: '2026-11-08', ci: ['morning']}], '2026-11-08', lab), 'Today · AM');
  assert.equal(lastCheckinText([{d: '2026-11-07', ci: ['evening']}], '2026-11-08', lab), 'Yesterday · PM');
  assert.equal(lastCheckinText([{d: '2026-11-07', ci: []}], '2026-11-08', lab), 'No check-in yet');
});

test('check-in streak counts submitted days, not scores or enrollment length', () => {
  const ci = ['morning'];
  assert.equal(checkinStreak([{d: '2026-11-06', ci}, {d: '2026-11-07', ci}, {d: '2026-11-08', ci}], '2026-11-08'), 3);
  assert.equal(checkinStreak([{d: '2026-11-06', ci}, {d: '2026-11-07', ci}, {d: '2026-11-08', ci: []}], '2026-11-08'), 2);
  assert.equal(checkinStreak([{d: '2026-11-05', ci}, {d: '2026-11-07', ci}, {d: '2026-11-08', ci}], '2026-11-08'), 2);
  assert.equal(checkinStreak([{d: '2026-11-07', ci: []}, {d: '2026-11-08', ci: []}], '2026-11-08'), 0);
  assert.equal(checkinStreak([], '2026-11-08'), 0);
});

/* ---- final delivery: scores and wording used by the patient and practitioner screens ---- */
test('graph scale matches the backend formula round(percent / 5 - 10, 2), with the green zone at 70 percent = +4', () => {
  for (const p of [0, 12.5, 18.2, 50, 66.67, 70, 83.3, 100]) assert.equal(percentToGraph(p), Math.round((p / 5 - 10) * 100) / 100);
  assert.equal(percentToGraph(70), 4);
  assert.equal(percentToGraph(18.2), -6.36);
  assert.equal(percentToGraph(0), -10);
  assert.equal(percentToGraph(100), 10);
});

test('Today check-in section: heading, button and completion check for all four AM/PM states', () => {
  assert.deepEqual(checkinPrompt([]), { heading: 'Both check-ins need completing', button: 'Check in', complete: false });
  assert.deepEqual(checkinPrompt(['morning']), { heading: 'Evening check-in needs completing', button: 'Check in', complete: false });
  assert.deepEqual(checkinPrompt(['evening']), { heading: 'Morning check-in needs completing', button: 'Check in', complete: false });
  assert.deepEqual(checkinPrompt(['evening', 'morning']), { heading: 'Both check-ins complete', button: 'Review check-ins', complete: true });
  assert.deepEqual(checkinPrompt(undefined), checkinPrompt([]));
});

test('check-in chooser: Review for a completed period, Start otherwise', () => {
  assert.equal(chooserAction(true), 'Review check-in');
  assert.equal(chooserAction(false), 'Start check-in');
});

test('roster status words follow the four backend-based statuses', () => {
  const lf = g => ({ lastFull: { date: '2026-11-07', graph_value: g }, needsAttention: false });
  assert.equal(STATUS_TEXT[statusOf(lf(4), 4)], 'Doing well');
  assert.equal(STATUS_TEXT[statusOf(lf(1.2), 4)], 'Below green zone');
  assert.equal(STATUS_TEXT[statusOf({ ...lf(9), needsAttention: true }, 4)], 'Needs attention');
  assert.equal(STATUS_TEXT[statusOf({ lastFull: null, needsAttention: false }, 4)], 'No score yet');
});

test('a +1.2 latest finished day is below the +4 green zone, +4.0 exactly is in it', () => {
  assert.equal(statusOf({ lastFull: { graph_value: 1.2 }, needsAttention: false }, 4), 'watch');
  assert.equal(statusOf({ lastFull: { graph_value: 4.0 }, needsAttention: false }, 4), 'good');
});

test('week day indicator: left half morning, right half evening, order does not matter', () => {
  assert.equal(dayIndicator(['evening', 'morning']), 'both');
  assert.equal(dayIndicator(['morning', 'evening']), 'both');
  assert.equal(dayIndicatorText(['evening']), 'evening submitted');
  assert.equal(dayIndicatorText(['morning', 'evening']), 'morning and evening submitted');
});

test('report domains keep a domain that was scored on a day even if it is off now', () => {
  const ds = shapeDomainScores([{ date: '2026-11-03', domains: { sleep: { percent: 80 }, general: { percent: 50 } } }, { date: '2026-11-04', domains: {} }]);
  assert.deepEqual(ds['2026-11-03'], { sleep: 80 });
  assert.deepEqual(ds['2026-11-04'], {});
});

test('domain change uses the same points as the displayed average', () => {
  const avg = 60, prev = 45;
  assert.equal(percentToGraph(avg) - percentToGraph(prev), percentDiffToGraph(avg - prev));
});

test('green-zone day counts read "Green-zone days: X / Y"', () => {
  assert.equal(greenDaysText(2, 6), 'Green-zone days: 2 / 6');
  assert.equal(greenDaysText(0, 5), 'Green-zone days: 0 / 5');
  assert.equal(greenDaysText(0, 0), 'No scored days');
});

test('saved-screen percent is the backend percent, rounded for display only', () => {
  assert.equal(percentEarnedText(18.2), '18% of available points earned.');
  assert.equal(percentEarnedText(66.67), '67% of available points earned.');
  assert.equal(percentEarnedText(null), '');
});

test('cards come only from optional backend domains', () => {
  assert.deepEqual(cardsOf(['general', 'physical_activity', 'social', 'unknown']), ['activity', 'social']);
  assert.deepEqual(cardsOf(null), []);
});
