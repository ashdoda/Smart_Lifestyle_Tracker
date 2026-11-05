/* ===== EXAMPLE DATA: one provider login and one example patient, so every screen can be opened and clicked through =====
   Loaded right after js/hk-data.js on every page. It only fills HK.config and HK.data; no screen code reads this file directly.
   Dates are built from today's date when the page loads, so the example always looks current.
   Everything here is made up (example.org e-mails, shared password below).
   FOR REAL USE: delete this file and its <script src="js/hk-example-data.js"> line from the 10 page files
   (docs/BACKEND_HANDOFF.md and docs/DATABASE_HANDOFF.md say how real data replaces it). */
(function () {
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const ago = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return d; };
  const PW = 'Test1234!', PID = 'pat-7f3a';

  const series = [], dom = {};
  for (let i = 39; i >= 0; i--) {
    const s = 55 + (i * 7) % 21;
    series.push({ d: iso(ago(i)), score: s });
    dom[iso(ago(i))] = { activity: s + 3, diet: s - 4, sleep: s + 1 };
  }

  Object.assign(HK.config, {
    providerName: 'Dr. Provider',
    providerEmail: 'provider@example.org',
    demoLogins: [
      { label: 'Provider', email: 'provider@example.org', pw: PW },
      { label: 'Patient (Alex)', email: 'alex.sample@example.org', pw: PW },
    ],
    demoNote: 'Example accounts for walking through the screens. Press one to fill the form.',
  });

  Object.assign(HK.data, {
    patients: [
      { id: PID, name: 'Alex Sample', email: 'alex.sample@example.org', state: 'active', fav: true, age: 34, pronouns: 'they/them',
        goal: 'Walk after dinner', lengthChosen: 'standard', lengthNow: 'standard', unlocked: ['activity', 'diet', 'sleep'], series },
    ],
    accounts: {
      'provider@example.org': { pw: PW, role: 'provider', id: null, name: 'Dr. Provider' },
      'alex.sample@example.org': { pw: PW, role: 'patient', id: PID, name: 'Alex Sample' },
    },
    domainScores: { [PID]: dom },
    events: { [PID]: { [iso(ago(0))]: [[6.7, 'Woke up', null], [8.1, 'Morning check-in', 'am'], [12.6, 'Movement logged', 'activity']] } },
    answers: { [PID]: [
      { d: iso(ago(0)), when: 'Morning', dom: 'activity', txt: 'Walked to the park.', barrier: null },
      { d: iso(ago(1)), when: 'Evening', dom: 'sleep', txt: 'In bed by ten.', barrier: 'Low energy' },
    ] },
    week: { [PID]: { barriers: [['Low energy', 3], ['Forgot', 1]], conf: 7.4, pconf: 6.9, checkins: 11 } },
    customResults: { [PID]: { 'q-1': 'Yes 5, No 2' } },
    privateGoals: { [PID]: [
      { id: 'g1', title: 'Read before bed', type: 'yesno', unit: 'times', limit: 0, shared: true, log: { [iso(ago(1))]: 1, [iso(ago(0))]: 0 } },
      { id: 'g2', title: 'Hidden private goal', type: 'count', unit: 'drinks', limit: 2, shared: false, log: {} },
    ] },
    customQuestions: { [PID]: [{ id: 'q-1', dom: 'activity', when: 'pm', type: 'yesno', text: 'Did you take the evening walk?' }] },
    notes: { [PID]: 'Ask about the weekend routine.' },
    today: { [PID]: { amDone: true, amTime: '7:05 AM', pmDone: false } },
  });
})();
