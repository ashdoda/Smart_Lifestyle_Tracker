/* ===== HK: the ONE file where real data plugs into the screens =====
   Every screen reads its data through window.HK. All defaults in THIS file are EMPTY, so with no other data every
   page opens in its empty state and every control still works. js/hk-example-data.js (loaded right after this file)
   adds one example provider login and one example patient; delete that file for real use. See docs/BACKEND_HANDOFF.md and docs/DATABASE_HANDOFF.md.

   HK.config   small settings (provider display name, clock override, placeholder score)
   HK.data     plain tables the screens read (shapes are documented in docs/DATABASE_HANDOFF.md)
   HK.provider functions the screens call; each default reads the matching table in HK.data
   HK.ready(cb) runs cb once data is in place. Default runs it right away. To load from a server, replace it
                with: HK.ready = cb => fetch(...).then(r => r.json()).then(d => { Object.assign(HK.data, d); cb(); });
*/
(function () {
  const pad = n => String(n).padStart(2, '0');
  const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateOf = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d, 12); };

  window.HK = {
    config: {
      providerName: 'Provider',       /* shown in the provider header, invite emails and patient screens */
      providerEmail: '',              /* shown under the provider name in the provider header */
      now: null,                      /* optional Date (or ISO string) that replaces the real clock; null = real clock */
      defaultScore: 56,               /* PLACEHOLDER: Overall Score shown for a patient with no check-in yet; BACKEND owns the real formula */
      demoLogins: [],                 /* optional [{ label, email, pw }] chips under the sign-in form; empty = no chips */
      demoNote: '',                   /* sentence shown above the chips */
    },
    data: {
      patients: [],                   /* patient records, see DATABASE_HANDOFF.md section "patients" */
      accounts: {},                   /* email (lowercase) -> { pw, role: 'provider'|'patient', id, name } */
      domainScores: {},               /* patientId -> 'YYYY-MM-DD' -> { <cardId>: 0-100 } */
      events: {},                     /* patientId -> 'YYYY-MM-DD' -> [ [hourOfDay, label, cardId|'am'|'pm'|null], ... ] */
      answers: {},                    /* patientId -> [ { d:'YYYY-MM-DD', when:'Morning'|'Evening', dom:cardId, txt, barrier|null } ] newest first */
      week: {},                       /* patientId -> { barriers:[[label,days],...], conf, pconf, checkins } */
      customResults: {},              /* patientId -> questionId -> short result text for the weekly report */
      privateGoals: {},               /* patientId -> [ private goal ] */
      customQuestions: {},            /* patientId -> [ custom question ] used as the starting list in card settings */
      notes: {},                      /* patientId -> provider's private note text */
      today: {},                      /* patientId -> { amDone:boolean, amTime:'6:22 AM'|null, pmDone:boolean } */
    },
    now() { return this.config.now ? new Date(this.config.now) : new Date(); },
    ready(cb) { cb(); },
    provider: {
      /* card scores (0-100) for one patient on one day. date = Date, score = that day's Overall Score or null. Returns { cardId: n } */
      domainScores(p, date, score) { return (HK.data.domainScores[p.id] || {})[isoOf(date)] || {}; },
      /* the day's timeline for the 1D chart and "last check-in" labels. Returns { ev:[[hour,label,tag]], r: seeded random fn for chart smoothing } */
      dayEvents(p, date) {
        const key = isoOf(date), list = (HK.data.events[p.id] || {})[key] || [];
        return { ev: list.map(e => [e[0], e[1], e[2] == null ? null : e[2]]), r: rng(hashStr(p.id + key)) };
      },
      /* newest-first answers shown under "Recent check-ins". Returns [{ d:Date, when, dom:cardId, txt, barrier|null }] */
      recentAnswers(p) { return (HK.data.answers[p.id] || []).map(a => ({ d: dateOf(a.d), when: a.when, dom: a.dom, txt: a.txt, barrier: a.barrier || null })); },
      /* barriers named this week: [[label, days], ...] most common first */
      weekBarriers(p) { return (HK.data.week[p.id] || {}).barriers || []; },
      /* average morning confidence (0-10) this week and last week; null when unknown. ctx = { avg, pavg } Overall Score averages */
      weekConfidence(p, ctx) { const w = HK.data.week[p.id] || {}; return { conf: w.conf ?? null, pconf: w.pconf ?? null }; },
      /* number of check-ins completed in the last 7 days (0 to 14) */
      weekCheckins(p, W) { return (HK.data.week[p.id] || {}).checkins ?? 0; },
      /* one line result for a provider-added question in the weekly report, e.g. "Yes 4, No 2" */
      customResult(p, q, W) { return (HK.data.customResults[p.id] || {})[q.id] || ''; },
      /* private goals the patient already has (only used until the patient saves their own list) */
      seedPrivateGoals(pid) { return HK.data.privateGoals[pid] || []; },
      /* provider-added questions that start in a patient's card settings */
      defaultCustomQuestions(pid) { return HK.data.customQuestions[pid] || []; },
      /* provider's private note text for a patient */
      providerNote(p) { return HK.data.notes[p.id] || ''; },
      /* today's check-in status for a patient */
      todayStatus(pid) { return HK.data.today[pid] || { amDone: false, amTime: null, pmDone: false }; },
    },
  };
})();
