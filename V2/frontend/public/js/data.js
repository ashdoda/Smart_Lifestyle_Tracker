// WHAT THIS FILE DOES
// This file holds the list of patients in memory and works out the simple facts the list page shows for each one
// (their status, last check-in, and so on). It does not make up any numbers: it only uses what the server sent.
/* ===== The six optional cards (names and icons) and how patient records are analysed ===== */

/* The six optional cards: display name, short label and icon. The questions come from the server. */
// The six optional areas (cards) a patient can be given: name, short label and icon
const DOMAINS = [
  { id: 'activity', name: 'Physical Activity', short: 'Move', icon: 'footprints' },
  { id: 'diet', name: 'Diet & Nutrition', short: 'Eat', icon: 'apple' },
  { id: 'mind', name: 'Mind-body & Mindfulness', short: 'Pause', icon: 'flower-2' },
  { id: 'sleep', name: 'Restorative Sleep', short: 'Rest', icon: 'moon-star' },
  { id: 'social', name: 'Social Connection', short: 'Connect', icon: 'users' },
  { id: 'substance', name: 'Avoiding Harmful Substances', short: 'Steady', icon: 'shield-check' },
];
// The same list, looked up by its id so it is quick to find one
const DOM = Object.fromEntries(DOMAINS.map(d => [d.id, d]));

/* ===== Patients: the list comes from HK.data.patients (see hk-data.js). Nothing is generated here. =====
   A patient record: { id, name, state: 'active', unlocked: [cardId], series: [{ d: 'YYYY-MM-DD', score, g, ... }], backend: {...} } */
// The list of patients, and the same patients looked up by id
const PATIENTS = [];
const PAT = {};
// Takes the patients from the server and stores them here, ready for the screens
function hkLoadPatients(list) {
  PATIENTS.length = 0; Object.keys(PAT).forEach(k => delete PAT[k]);
  (list || []).forEach(r => {
    const p = { ...r };
    p.unlocked = [...(r.unlocked || [])];
    p.series = (r.series && r.series.length ? r.series : [{ d: iso(TODAY), score: null }]).map(x => ({ d: typeof x.d === 'string' ? parseISO(x.d) : x.d, score: x.score == null ? null : x.score, prov: !!x.prov, roll: x.roll == null ? null : x.roll, g: x.g == null ? null : x.g, rg: x.rg == null ? null : x.rg, ci: x.ci || [], done: !!x.done }));
    if (r.start && !r.series) p.series[0].d = parseISO(r.start);
    applyState(p); PATIENTS.push(p); PAT[p.id] = p;
  });
}

// Works out the facts for one patient and saves them on that patient
function applyState(p) {
  Object.assign(p, analyze(p));
  if (window.__hkBooted) syncLastActiveOne(p);
}

// Works out the status, last check-in and score change for one patient, using only numbers the server gave
function analyze(p) {
  /* Every number here is the server's own. The roster score is the server's last_full_day (the latest finished day; today is still open).
     Check-in dates come from the periods the server lists as submitted, not from whether a score exists, because the server can
     score a day that has no check-in. The attention flag and the below-green streak are the server's, unchanged. */
  const bk = p.backend || {}, lf = bk.lastFull || null;
  const fin = p.series.filter(x => !x.prov);
  const subm = p.series.filter(x => (x.ci || []).length);
  const lastCi = subm[subm.length - 1] || null, since = lastCi ? dayDiff(TODAY, lastCi.d) : null;
  const lastCheckin = window.lastCheckinText(p.series.map(x => ({ d: iso(x.d), ci: x.ci })), iso(TODAY), k => fmtD(parseISO(k)));
  const todayRow = p.series.find(x => sameDay(x.d, TODAY));
  /* last 7 finished days compared with the up to 21 finished days before them, in score points; no comparison when either side is empty */
  const gl = fin.slice(-7).map(x => x.g), gp = fin.slice(-28, -7).map(x => x.g);
  const delta = mean(gl) != null && mean(gp) != null ? mean(gl) - mean(gp) : null;
  const below = bk.streak || 0;
  const gg = HK.config.greenGraph ?? 70, status = window.statusOf(bk, gg);
  /* hover text for the status pill: the backend streak and the latest finished day */
  const reason = !lf ? `${status === 'attention' ? 'Needs attention. ' : ''}${bk.missed > 0 ? `No check-in for ${bk.missed} days. ` : ''}No finished day to score yet.` : `${status === 'attention' ? 'Needs attention. ' : ''}${below > 0 ? window.belowText(below) + ' ' : ''}Latest finished day: ${fmtD(parseISO(lf.date))}, ${fmtG(lf.graph_value)}.`;
  return { today: lf ? lf.percent : null, todayG: lf ? lf.graph_value : null, lastDate: lf ? parseISO(lf.date) : null, daysSince: since == null ? 9999 : since, delta7: delta, lastActive: lastCheckin, lastCheckin,
    todayNote: todayRow ? dayNote(todayRow) : '', todayWait: todayWait(todayRow), status, reason, checkins: subm.length, checkedToday: todayWait(todayRow) === 'Checked in today' };
}

/* card scores for one day: comes from the adapter (real values), never generated here */
// Gives the score for each of the patient's areas on one day
function domainScores(p, d, score) {
  const got = HK.provider.domainScores(p, d, score) || {}, out = {};
  p.unlocked.forEach(k => { out[k] = score == null || got[k] == null ? null : Math.round(got[k]); });
  return out;
}

// Turns a name into initials, for example "Jo Smith" becomes "JS"
const initials = n => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
/* status pills: label, colour class, icon (only Needs attention has one) */
// The words, colour and icon used for each status (Doing well, Below green zone, and so on)
const STATUS_LABEL = { good: ['Doing well', 'good', ''], watch: ['Below green zone', 'warn', ''], attention: ['Needs attention', 'bad', 'triangle-alert'], new: ['No score yet', 'info', ''], invited: ['Invite sent', 'info', ''], none: ['Not invited', '', ''] };
// Builds the small coloured status label shown next to a patient
const statusPill = p => { const [lab0, cls, icon] = STATUS_LABEL[p.status], lab = (window.STATUS_TEXT && window.STATUS_TEXT[p.status]) || lab0; return `<span class="pill ${cls}" title="${esc(p.reason)}">${icon ? ic(icon) : ''}${lab}</span>`; };
