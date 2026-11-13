// WHAT THIS FILE DOES
// The server sends back information in its own shape. This file reshapes it into the simpler records the screens use,
// and holds the small bits of wording (like "Doing well" or "Below green zone"). It only does math on numbers and
// text, so it can be tested without a server.
// Shapes backend responses into the records the screens read (see public/js/hk-data.js).
// Pure functions only, so they can be unit tested without a server.
// Matches the server's names for the areas (like physical_activity) to the names the screens use (like activity)
export const DOMAIN_TO_CARD = {
  physical_activity: 'activity', nutrition: 'diet', mindfulness: 'mind',
  sleep: 'sleep', social: 'social', substance_use: 'substance',
};
// The same list the other way around
export const CARD_TO_DOMAIN = Object.fromEntries(Object.entries(DOMAIN_TO_CARD).map(([d, c]) => [c, d]));

// The server scores run 0 to 100 and the graph uses the same numbers, so these two only keep a missing value missing (never zero).
// Gives back the score shown on the graph (0 to 100)
export const percentToGraph = p => p == null ? null : Math.round(p * 100) / 100;
// A difference between two scores, in score points
export const percentDiffToGraph = d => d == null ? null : d;

// Turns the server's list of areas into the list the screens use
export const cardsOf = domains => (domains || []).filter(d => d in DOMAIN_TO_CARD).map(d => DOMAIN_TO_CARD[d]);

// One entry per calendar day. A missing score stays null (never 0); today is flagged provisional.
// g and rg are the server's graph_value and rolling_graph_value (0 to 100). Today with no check-in submitted yet has no score to show, so its numbers are left empty.
// ci lists the check-in periods the server says were submitted that day.
// Builds one entry for each day with its score, whether the day is still open and which check-ins were done
export const shapeSeries = days => days.map(d => {
  const done = (d.checkins_done || []).length > 0;
  const none = !!d.in_progress && !done;
  return {
    d: d.date,
    score: none ? null : d.percent ?? null,
    prov: !!d.in_progress,
    roll: none ? null : d.rolling_percent ?? null,
    g: none ? null : d.graph_value ?? null,
    rg: none ? null : d.rolling_graph_value ?? null,
    ci: d.checkins_done || [],
    done,
  };
});

// Builds the score for each area on each day
export function shapeDomainScores(days) {
  const out = {};
  for (const d of days) {
    const row = {};
    for (const [domain, v] of Object.entries(d.domains || {})) if (domain in DOMAIN_TO_CARD) row[DOMAIN_TO_CARD[domain]] = v.percent;
    out[d.date] = row;
  }
  return out;
}

// Builds one patient's record from what the server sent
export function shapePatient(p, days, overview) {
  const id = String(p.patient_id);
  const name = `${p.first_name} ${p.last_name}`.trim();
  return {
    id, name, state: 'active',
    unlocked: cardsOf(p.domains),
    series: shapeSeries(days),
    enrolledOn: p.enrolled_on,
    backend: {
      patientId: p.patient_id,
      preferredName: p.preferred_name || p.first_name,
      streak: overview ? overview.days_below_green_in_a_row : 0,
      needsAttention: !!(overview && overview.needs_attention),
      missed: overview ? overview.days_missed : 0,
      lastFull: overview ? overview.last_full_day : null,
    },
  };
}

// Which check-in periods are done on a given day (from the scores response).
// Which check-ins (morning or evening) are done on one day
export const doneOn = (days, iso) => (days.find(d => d.date === iso) || {}).checkins_done || [];

/* what is still missing today, judged only by the periods the server lists as submitted */
// The sentence that says which check-in is still waiting today
export const todayWait = ci => {
  const am = (ci || []).includes('morning'), pm = (ci || []).includes('evening');
  return am && pm ? 'Checked in today' : am ? 'Waiting for evening check-in' : 'Waiting for morning check-in';
};

/* ---- wording and counts the phone screens show ---- */
// "5.2 points" (one decimal, singular only for exactly 1.0).
// Writes a number as "5.2 points" (or "1.0 point")
export const pointsText = n => `${n.toFixed(1)} point${n.toFixed(1) === '1.0' ? '' : 's'}`;

// The week-over-week line. delta is this week's average minus the previous week's, in graph points,
// or null when the previous week has no scored days. It is a weekly comparison, never today's change.
// The sentence comparing this week to the week before
export const weekCompareText = delta => delta == null ? 'No previous week to compare.'
  : Math.abs(delta) < 0.05 ? 'Weekly average unchanged vs previous week.'
  : `Weekly average ${delta > 0 ? 'up' : 'down'} ${pointsText(Math.abs(delta))} vs previous week.`;

// One card's line on the week screen. n = finished, scored days for that card; met = how many reached the green zone.
// The sentence that says how many days were in the green zone
export const greenDaysText = (met, n) => n === 0 ? 'No scored days' : `Green-zone days: ${met} / ${n}`;

// The server's own percent, rounded for display. It is never worked back from the rounded graph value.
// The sentence that says what percent of the points were earned
export const percentEarnedText = percent => percent == null ? '' : `${Math.round(percent)}% of available points earned.`;

/* ---- practitioner status, check-in text and day indicators ---- */
// Status of one patient from the backend overview: the needs_attention flag first, then the latest finished day against the configured green-zone start.
// lastFull is the overview's last_full_day (or null). Nothing is inferred from sparklines.
// Picks a patient's status: needs attention, below green, doing well, or no score yet
export const statusOf = (bk, greenGraph) => {
  if (!bk) return 'new';
  if (bk.needsAttention) return 'attention';   /* the server's flag counts even with no finished scored day (e.g. no check-in for many days) */
  if (!bk.lastFull) return 'new';
  return bk.lastFull.graph_value != null && bk.lastFull.graph_value < greenGraph ? 'watch' : 'good';
};
// The sentence that says how many days in a row a patient has been below green
export const belowText = n => `Below the green zone for ${n} consecutive day${n === 1 ? '' : 's'}.`;

// 'AM', 'PM' or 'AM & PM' from the periods the server lists as submitted.
// Short text for which check-ins were done: AM, PM or AM & PM
export const periodsShort = ci => {
  const am = (ci || []).includes('morning'), pm = (ci || []).includes('evening');
  return am && pm ? 'AM & PM' : am ? 'AM' : pm ? 'PM' : '';
};
// One concise value for the roster: "Today · AM", "Yesterday · PM & AM"... days: [{d: 'YYYY-MM-DD', ci}], dayLabel(iso) names older dates.
// Short text for the last check-in, like "Yesterday · AM"
export const lastCheckinText = (days, todayIso, dayLabel) => {
  const last = [...days].reverse().find(x => (x.ci || []).length);
  if (!last) return 'No check-in yet';
  const t = new Date(todayIso + 'T00:00:00'), d = new Date(last.d + 'T00:00:00'), diff = Math.round((t - d) / 86400000);
  return `${diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : dayLabel(last.d)} · ${periodsShort(last.ci)}`;
};
// Consecutive calendar days with at least one submitted check-in, ending today (or yesterday while today has none yet).
// A day with a score but no submitted period does not count, and a missing date breaks the run.
// Counts how many days in a row the patient checked in
export const checkinStreak = (days, todayIso) => {
  const by = Object.fromEntries(days.map(x => [x.d, (x.ci || []).length > 0]));
  const step = iso => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  let k = by[todayIso] ? todayIso : step(todayIso), n = 0;
  while (by[k]) { n++; k = step(k); }
  return n;
};
// Split-circle state for one day: which halves are filled. Shows submissions only, never a score.
// Says which half of a day's circle is filled in (morning, evening, both or none)
export const dayIndicator = ci => {
  const am = (ci || []).includes('morning'), pm = (ci || []).includes('evening');
  return am && pm ? 'both' : am ? 'am' : pm ? 'pm' : 'none';
};
// The words that go with that circle
export const dayIndicatorText = ci => ({ both: 'morning and evening submitted', am: 'morning submitted', pm: 'evening submitted', none: 'no check-in submitted' })[dayIndicator(ci)];

/* ---- patient Today and check-in chooser wording, from the submitted periods only ---- */
// Heading, button and completion check for the Today check-in section.
// The heading and button text for the check-in area on the Today screen
export const checkinPrompt = ci => {
  const am = (ci || []).includes('morning'), pm = (ci || []).includes('evening');
  if (am && pm) return { heading: 'Both check-ins complete', button: 'Review check-ins', complete: true };
  if (am) return { heading: 'Evening check-in needs completing', button: 'Check in', complete: false };
  if (pm) return { heading: 'Morning check-in needs completing', button: 'Check in', complete: false };
  return { heading: 'Both check-ins need completing', button: 'Check in', complete: false };
};
// The chooser's main button for the selected period.
// The button text when choosing a check-in: Review or Start
export const chooserAction = done => done ? 'Review check-in' : 'Start check-in';
// The roster status words for statusOf's result.
// The words shown for each status on the patient list
export const STATUS_TEXT = { good: 'Doing well', watch: 'Below green zone', attention: 'Needs attention', new: 'No score yet' };
