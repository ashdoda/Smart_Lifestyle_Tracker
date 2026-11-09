// WHAT THIS FILE DOES
// This is the file that talks to the server (the backend). It asks the server for patients, scores and answers,
// saves new things (like a new patient or a check-in), and puts what comes back into the app's memory so the screens can show it.
// The screens never talk to the server directly: they go through the functions made here.
// Bring in the helper functions from the other source files
import {request, visible, filled, submission, scoreText} from './logic.js';
import {shapePatient, shapeDomainScores, shapeSeries, doneOn, cardsOf, percentToGraph, percentDiffToGraph, todayWait, pointsText, weekCompareText, greenDaysText, percentEarnedText, statusOf, belowText, periodsShort, lastCheckinText, checkinStreak, dayIndicator, dayIndicatorText, CARD_TO_DOMAIN, DOMAIN_TO_CARD, checkinPrompt, chooserAction, STATUS_TEXT} from './adapter.js';

// Make the helpers reachable from the page scripts under one name (HKL)
window.HKL = {request, visible, filled, submission, scoreText};
// Short names for the score and text helpers so the screens can call them
window.pctToG = percentToGraph;
window.pctDiffToG = percentDiffToGraph;
window.todayWaitText = todayWait;
window.weekCompareText = weekCompareText;
window.greenDaysText = greenDaysText;
window.percentEarnedText = percentEarnedText;
Object.assign(window, {statusOf, belowText, periodsShort, lastCheckinText, checkinStreak, dayIndicator, dayIndicatorText, checkinPrompt, chooserAction, STATUS_TEXT});
// Small helper for sending information to the server
const post = (path, method, body) => request(path, {method, body: JSON.stringify(body)});

// The list of things the screens can ask the server to do
// Server calls used by the roster and the patient page. Every one is a documented route.
Object.assign(window.HKL, {
  // GET /patients/{id}: the current record, read fresh from the server.
  getPatient: id => request(`/patients/${id}`),
  // GET /patients/{id}/scores/{day}: one day with the points earned per question.
  dayScore: (id, day) => request(`/patients/${id}/scores/${day}`),
  // GET /patients/{id}/days/{day}: every answer saved on that day.
  dayAnswers: (id, day) => request(`/patients/${id}/days/${day}`),
  // POST /patients: first_name, last_name, preferred_name, enrolled_on, domains.
  createPatient: body => post('/patients', 'POST', body),
  // PUT /admin/patients/{id}/domains: the full set of optional cards that should be on, from today on.
  setDomains: (id, cardIds) => post(`/admin/patients/${id}/domains`, 'PUT', {domains: cardIds.map(c => CARD_TO_DOMAIN[c]).filter(Boolean)}),
  cardsOf, CARD_TO_DOMAIN, DOMAIN_TO_CARD,
});

// Looks back over recent days to get the average morning confidence and the written answers
// Reads the saved answers of the last `count` days (GET /patients/{id}/days/{day}, one at a time) and returns
// the average morning confidence for the last 7 days and the 7 days before, plus the written answers from the last `wordDays` days, newest first.
window.HKL.insights = async (rec, count = 14, wordDays = 7) => {
  const days = [];
  for (let i = 0; i < count; i++) { const d = HK.now(); d.setDate(d.getDate() - i); const k = isoOf(d); if (k >= rec.enrolledOn) days.push(k); }
  const byId = Object.fromEntries((HK.data.questions || []).map(q => [q.id, q]));
  const conf = [], pconf = [], words = [];
  for (const [i, k] of days.entries()) {
    const a = (await request(`/patients/${rec.backend.patientId}/days/${k}`)).answers || {};
    if (typeof a['GM5'] === 'number') (i < 7 ? conf : pconf).push(a['GM5']);
    if (i < wordDays) for (const [id, v] of Object.entries(a)) {
      const q = byId[id];
      if (q && q.type === 'text' && filled(v)) words.push({date: k, period: q.period, card: DOMAIN_TO_CARD[q.domain] || null, question: q.text, text: String(v)});
    }
  }
  const avg = list => list.length ? list.reduce((x, y) => x + y, 0) / list.length : null;
  return {conf: avg(conf), pconf: avg(pconf), confN: conf.length, pconfN: pconf.length, words};
};

// After saving, updates the patient in memory with the new scores from the server
// Puts freshly saved server scores (list of days) into the records the screens read.
window.HKL.applyDays = (pid, days) => {
  const p = PAT[pid]; if (!p) return;
  const fresh = shapeSeries(days), dom = shapeDomainScores(days);
  fresh.forEach(x => {
    const row = {d: parseISO(x.d), score: x.score, prov: x.prov, roll: x.roll, g: x.g, rg: x.rg, ci: x.ci, done: x.done};
    const i = p.series.findIndex(q => iso(q.d) === x.d);
    if (i >= 0) p.series[i] = row; else p.series.push(row);
  });
  HK.data.domainScores[pid] = {...(HK.data.domainScores[pid] || {}), ...dom};
  applyState(p);
};

// Small helpers to turn a date into text like 2026-11-08
const pad = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// If the server cannot be reached, show a simple message with a Try again button
function showError(message) {
  const app = document.getElementById('app');
  app.innerHTML = `<main class="card" style="max-width:520px;margin:48px auto" role="alert"><h2>Could not load data</h2><p class="ink2" style="margin:8px 0 16px">${String(message).replace(/[<>&]/g, '')}</p><button class="btn primary" id="retry">Try again</button></main>`;
  document.getElementById('retry').addEventListener('click', () => location.reload());
}

// Collects everything shown for one patient: their record, area scores, week numbers and today's check-in status
// Everything the screens need about one patient: record, card scores, week numbers, today's check-in status.
async function buildRecord(p, ov, today) {
  const res = await request(`/patients/${p.patient_id}/scores?start=${p.enrolled_on}&end=${today}`);
  const rec = shapePatient(p, res.days, ov);
  const done = doneOn(res.days, today);
  return {
    rec, ds: shapeDomainScores(res.days),
    wk: {barriers: [], conf: null, pconf: null, checkins: res.days.slice(-7).reduce((n, d) => n + (d.checkins_done || []).length, 0)},
    ts: {amDone: done.includes('morning'), amTime: null, pmDone: done.includes('evening')},
  };
}

// Reloads one patient from the server and replaces the old copy
// Reads one patient again (GET /patients/{id}, scores, overview) and puts the fresh record into the screens' list.
window.HKL.refreshPatient = async id => {
  const today = isoOf(HK.now());
  const p = await request(`/patients/${id}`);
  const overview = await request('/admin/overview');
  const b = await buildRecord(p, overview.find(o => o.patient_id === p.patient_id), today);
  const list = HK.data.patients, i = list.findIndex(r => r.id === b.rec.id);
  if (i >= 0) list[i] = b.rec; else list.push(b.rec);
  HK.data.domainScores[b.rec.id] = b.ds; HK.data.week[b.rec.id] = b.wk; HK.data.today[b.rec.id] = b.ts;
  HK.data.accounts[`patient${b.rec.id}@demo.local`] = {pw: 'demo', role: 'patient', id: b.rec.id, name: b.rec.name};
  hkLoadPatients(list); syncLastActive();
  return b.rec;
};

// Loads everything when the page opens: settings, questions, patients and their scores
async function load() {
  const today = isoOf(HK.now());
  await request('/health');
  const config = await request('/config');
  const questions = await request('/questions');
  const patients = await request('/patients');
  const overview = await request('/admin/overview');
  const ov = Object.fromEntries(overview.map(o => [o.patient_id, o]));

  const records = [], domainScores = {}, todayStatus = {}, week = {};
  for (const p of patients) {
    // Requests run one at a time (see logic.js), so this loop is safe for the server.
    const b = await buildRecord(p, ov[p.patient_id], today);
    records.push(b.rec); domainScores[b.rec.id] = b.ds; week[b.rec.id] = b.wk; todayStatus[b.rec.id] = b.ts;
  }

  // Demo sign-in accounts. There are no real accounts on the server yet
  const accounts = {'provider@demo.local': {pw: 'demo', role: 'provider', id: null, name: 'Practitioner'}};
  records.forEach(r => { accounts[`patient${r.id}@demo.local`] = {pw: 'demo', role: 'patient', id: r.id, name: r.name}; });

  Object.assign(HK.config, {
    providerName: 'Practitioner', providerEmail: '',
    greenZone: config.green_zone_min_percent, greenGraph: config.green_zone_min_graph_value, graphMin: config.graph_min, graphMax: config.graph_max, rollingDays: config.rolling_average_days, alertAfter: config.alert_after_days_below,
    demoLogins: [{label: 'Practitioner', email: 'provider@demo.local', pw: 'demo'}, ...records.slice(0, 3).map(r => ({label: r.name, email: `patient${r.id}@demo.local`, pw: 'demo'}))],
    demoNote: 'Demonstration sign-in only: accounts are not set up yet. Press one to fill the form.',
  });
  Object.assign(HK.data, {patients: records, accounts, domainScores, today: todayStatus, week, questions});
  HK.config.serverOk = true;
}

// Start loading. When done, start the app; if it fails, show the error message
load().then(() => { window.__hkLoaded = true; if (window.__hkStart) window.__hkStart(); })
  .catch(e => showError(e.message || e));
