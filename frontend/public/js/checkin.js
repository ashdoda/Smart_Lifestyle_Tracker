// WHAT THIS FILE DOES
// The check-in screen on the patient's phone. It shows the morning or evening questions one at a time, saves the answers
// to the server when the last one is done, reads them back to make sure they were saved, then shows the day's score
// and a short celebration by the pet. It also holds the little "pop and sparkle" effect used by the big buttons.
/* ===== Patient check-in: one question per card, length picker, adaptive follow-ups ===== */

/* a small, satisfying click: the button pops, a few sparks fly out, then we carry on */
// The button pop: the button squishes, a few sparks fly out, then the next step runs
function satisfy(el, go) {
  if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { go(); return; }
  if (el.classList.contains('popping')) return;
  el.classList.add('popping');
  const n = 12, box = document.createElement('span'); box.className = 'sparks'; box.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + (i % 2 ? .2 : 0), d = 34 + (i % 3) * 14, s = document.createElement('i'); s.style.setProperty('--dx', Math.cos(a) * d + 'px'); s.style.setProperty('--dy', Math.sin(a) * d * .7 + 'px'); s.style.setProperty('--c', i % 3 === 0 ? 'var(--edge)' : i % 3 === 1 ? 'var(--on-accent)' : 'var(--accent-soft)'); box.appendChild(s); }
  el.appendChild(box); setTimeout(() => { go(); el.classList.remove('popping'); box.remove(); }, 260);
}
/* every big button of this style (links) gets the same feedback: pop, sparks, then it goes where it points */
// Gives every big link-button the same pop, then follows the link
document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a.ck-go'); if (!a || e.defaultPrevented) return; e.preventDefault(); const h = a.getAttribute('href'); satisfy(a, () => { location.hash = h; }); });
// The small spark picture used by the effect
const SPARK_ICON = '<svg class="spark" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path class="base" d="M3 19h18" opacity=".35"/><path class="ln" d="M3 16.5 9 10.5l4 3.5 8-8"/><path class="hd" d="M16 6h5v5"/></svg>';
/* ===== Patient check-in: backend questions, one per card. Answers are saved to the server and read back. ===== */
// Matches the server's area names to the screen's names
const CARD_OF = { general: null, physical_activity: 'activity', nutrition: 'diet', mindfulness: 'mind', sleep: 'sleep', social: 'social', substance_use: 'substance' };
// Matches "am" and "pm" to the server's "morning" and "evening"
const PERIOD_OF = { am: 'morning', pm: 'evening' };

// The check-in screen itself
route(/^\/patient\/checkin$/, () => {
  // Find out which patient this is, and set up the notes the screen will keep while it runs
  const pid = phonePid(), p = PAT[pid]; if (!p) return phoneEmpty();
  const qs = phoneQuery(), H = window.HKL, today = iso(TODAY), srv = p.backend.patientId;
  const st = { stage: 'setup', when: qs.get('when') === 'am' ? 'am' : qs.get('when') === 'pm' ? 'pm' : (HK.now().getHours() < 12 ? 'am' : 'pm'), questions: [], saved: {}, ctx: {}, ans: {}, pos: 0, fields: {}, existing: false, beforeG: null };
  // The short notes shown beside the phone on a computer
  const notes = `<div class="card"><h2>About this screen</h2><ul>
      <li>One question per card, in a fixed order. Follow-up questions appear only when the earlier answer calls for them.</li>
      <li>Answers are saved when the check-in is finished, then read back to confirm.</li>
      <li>The lifestyle score shown afterwards is calculated on a scale of −10 to +10. Today is not finished, so it can still change.</li>
      <li>“Skip this one” leaves an unanswered question empty. A saved answer stays unless you choose to clear it.</li></ul></div>`;
  // Small helpers: talk to the server for this patient, find the current period, question and area
  const api = (path, opt) => H.request(`/patients/${srv}${path}`, opt);
  const period = () => PERIOD_OF[st.when];
  const domOf = q => (CARD_OF[q.domain] ? DOM[CARD_OF[q.domain]] : null);
  const vis = q => H.visible(q, { ...st.ctx, ...st.ans });
  const list = () => st.questions.filter(vis);
  const cur = () => st.questions[st.pos];
  // Finds the next or previous question that should be shown
  const step = dir => { for (let i = st.pos + dir; i >= 0 && i < st.questions.length; i += dir) if (vis(st.questions[i])) return i; return -1; };
  const firstPos = () => { for (let i = 0; i < st.questions.length; i++) if (vis(st.questions[i])) return i; return -1; };
  return {
    // "html" draws the page; "mount" below turns on the buttons
    html: phoneStage(pid, 'checkin', '<div id="ck"></div>', notes),
    mount(root) {
      const box = $('#ck', root), body = $('#pbody', root);
      // Small helpers for the progress bar and the picture at the top
      const counter = () => { const l = list(), i = l.indexOf(cur()); return `${Math.max(i, 0) + 1}/${l.length}`; };
      const pbar = (pct, label) => `<div class="pwrap"><span class="pcount num" aria-hidden="true">${label}</span><div class="pbar" role="progressbar" aria-label="Check-in progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-valuetext="Question ${label.replace('/', ' of ')}"><i style="width:${Math.max(pct, 6)}%"></i></div></div>`;
      const progress = () => { const l = list(), i = l.indexOf(cur()); return l.length ? Math.round(Math.max(i, 0) / l.length * 100) : 0; };
      const banner = `<div class="scene ckbanner" aria-hidden="true">${sceneSVG({ w: 390, h: 128, mood: null, seed: 3, label: 'Calm hills at dusk' })}</div>`;
      const stateCard = (title, text, buttons) => { box.innerHTML = `${banner}<div class="ck-card"><div><h1 class="q" id="qtitle" tabindex="-1">${esc(title)}</h1><p class="ink2" style="margin-top:var(--s2)">${esc(text)}</p></div>${buttons}</div>`; };

      // First step: choose morning or evening and press Start
      function setup() {
        st.stage = 'setup';
        const ts = todayStatus(pid), done = st.when === 'am' ? ts.am : ts.pm;
        const seg = (w, label, icon, isDone) => `<button type="button" data-w="${w}" aria-pressed="${st.when === w}" aria-label="${label}${isDone ? ', completed' : ''}">${ic(icon, 'sm')}<span>${label}</span>${isDone ? `<span class="segdone" aria-hidden="true">${ic('check', 'sm')}</span>` : ''}</button>`;
        const note = st.existing ? `<div class="notice info">${ic('info')}<span>This check-in is already saved today. Your answers will be filled in, and you can change them.</span></div>` : '';
        box.innerHTML = `${banner}
          <div class="ck-card"><div><h1 class="q" id="settitle" tabindex="-1">${st.when === 'am' ? 'Morning' : 'Evening'} check-in</h1><p class="ink2" style="margin-top:var(--s2)">Answer what you can. Finish whenever you’re ready.</p></div>
          <div class="seg fill ckseg" id="when" role="group" aria-label="Time of day">${seg('am', 'Morning', 'sun', ts.am)}${seg('pm', 'Evening', 'moon', ts.pm)}</div>
          ${note}
          <button type="button" class="btn primary lg block ck-go" id="start"><span class="lbl">${ic(done ? 'clipboard-check' : 'sparkles')}<span>${window.chooserAction(done)}</span><span class="go-arrow">${ic('arrow-right')}</span></span></button></div>`;
      }

      // Loads the questions for the chosen time from the server
      async function begin() {
        stateCard('Loading your questions', 'One moment.', '');
        try {
          const [c, d] = await Promise.all([api(`/checkins/${today}/${period()}`), api(`/days/${today}`)]);
          st.questions = c.questions; st.saved = c.saved_answers || {}; st.existing = !!c.submitted;
          /* follow-up rules look at the whole day's saved answers; this period's own questions are read from the answers on screen instead */
          const own = new Set(c.questions.map(q => q.id));
          st.ctx = { ...Object.fromEntries(Object.entries(d.answers || {}).filter(([id]) => !own.has(id))), ...(c.context || {}) }; st.ans = { ...st.saved }; st.fields = {};
          st.beforeG = todayRow(pid).g ?? null;
          st.pos = firstPos(); st.stage = 'q'; show();
        } catch (e) {
          stateCard('We could not load the questions', e.message, `<div class="ck-actions"><button type="button" class="btn primary lg block" id="retry">Try again</button><button type="button" class="btn lg block" id="toSetup">Back</button></div>`);
        }
      }

      // The answer controls: a different one for each kind of question (text, choices, yes/no, slider, time, number)
      /* ----- controls ----- */
      const optBtn = (v, on_, extra = '') => `<button type="button" class="opt-btn" data-v="${esc(v)}" aria-pressed="${on_}" ${extra}><span class="rd">${ic('check')}</span><span>${esc(v)}</span></button>`;
      function control(q) {
        const a = st.ans[q.id]; let h = '';
        if (q.type === 'text') h = `<div class="field"><label class="sr" for="ans">Your answer</label><textarea class="textarea" id="ans" placeholder="Write a sentence or two">${esc(a || '')}</textarea></div>`;
        else if (q.type === 'single_choice') h = `<div class="opts" role="group" aria-label="Choose one">${q.options.map(o => optBtn(o, a === o)).join('')}</div>`;
        else if (q.type === 'multi_choice') h = `<div class="opts" role="group" aria-label="Choose any that apply">${q.options.map(o => optBtn(o, (a || []).includes(o))).join('')}</div>`;
        else if (q.type === 'yes_no') h = `<div class="yn" role="group" aria-label="Yes or no">${['Yes', 'No'].map(o => optBtn(o, a === o)).join('')}</div>`;
        else if (q.type === 'scale_0_10') { const v = a ?? 5; h = `<div class="scalev"><div class="val num" id="sv" aria-live="polite">${v}</div><input class="range" id="sc" type="range" min="0" max="10" step="1" value="${v}" aria-label="${esc(q.text)}" style="--fill:${v * 10}%"><div class="ends"><span>Low</span><span>High</span></div></div>`; }
        else if (q.type === 'time') h = `<div class="field"><label class="sr" for="ans">Time</label><input class="input" id="ans" type="time" value="${esc(a || '')}" style="font-size:var(--t-xl);text-align:center"></div>`;
        else if (q.type === 'integer' || q.type === 'minutes') h = `<div class="field"><label class="sr" for="ans">${q.type === 'minutes' ? 'Minutes' : 'Number'}</label><input class="input" id="ans" type="number" inputmode="numeric" min="0" step="1" value="${a == null ? '' : esc(a)}" style="font-size:var(--t-xl);text-align:center"></div>`;
        return h;
      }
      // True once the current question has an answer
      const answered = q => { const a = st.ans[q.id]; if (q.type === 'scale_0_10') return a != null; if (q.type === 'multi_choice') return (a || []).length > 0; if (q.type === 'text') return !!(a && String(a).trim()); return a != null && a !== ''; };

      // Draws the current question
      function show() {
        const q = cur(); if (!q) return save();
        const last = step(1) < 0, pct = progress(), d = domOf(q), errs = st.fields[q.id];
        box.innerHTML = `<div class="ck-top"><button type="button" class="btn icon sm" id="back" aria-label="Previous question">${ic('arrow-left', 'sm')}</button>${pbar(pct, counter())}<button type="button" class="link" id="finish">Finish</button></div>
          <div class="ck-card">${errs ? `<div class="notice warn" role="alert">${ic('triangle-alert')}<span>${esc(errs)}</span></div>` : ''}
            <span class="pill ${d ? 'info' : ''}" style="align-self:flex-start">${d ? ic(d.icon, 'sm') + d.name : ic('target', 'sm') + 'Today’s goal'}</span>
            <h1 class="q" id="qtitle" tabindex="-1">${esc(q.text)}</h1>${control(q)}
            <div class="ck-actions"><button type="button" class="btn primary lg block ck-go${last ? ' ck-fin' : ''}" id="next" ${answered(q) ? '' : 'disabled'}>${nextHTML(last)}</button><button type="button" class="link" id="skip" style="align-self:center">${answered(q) ? 'Clear my answer and skip' : 'Skip this one'}</button></div></div>`;
        body.scrollTop = 0; const t = $('#qtitle', box); t && t.focus({ preventScroll: true });
      }
      // The text on the Next button, and what happens when you go on
      /* Next: shine + a right arrow. The last question: the same shine, and a tilted raised-hands emoji on the right */
      const nextHTML = last => last ? '<span class="lbl"><span>Finish check-in!</span><span class="ck-yay" aria-hidden="true">\u{1F64C}</span></span>' : `<span class="lbl"><span>Next</span><span class="go-arrow">${ic('arrow-right')}</span></span>`;
      const nextLabel = () => { const b = $('#next', box); if (!b) return; const last = step(1) < 0; b.classList.toggle('ck-fin', last); b.innerHTML = nextHTML(last); };
      function go() { const n = step(1); if (n < 0) return save(); st.pos = n; show(); }

      // Saving: send the answers, read them back, and compare to make sure they match
      /* ----- save, then read back to confirm ----- */
      // Sends the answers to the server and then reloads the patient's scores
      async function save() {
        stateCard('Saving your check-in', 'One moment.', '');
        const answers = H.submission(st.questions, {}, st.ans, st.ctx);
        try {
          const res = await api(`/checkins/${today}/${period()}`, { method: 'PUT', body: JSON.stringify({ answers }) });
          const back = await api(`/checkins/${today}/${period()}`);
          const bs = back.saved_answers || {};
          const same = JSON.stringify(Object.entries(res.saved).sort()) === JSON.stringify(Object.entries(bs).sort()) && Object.keys(answers).every(k => k in bs);
          /* read every affected day again (earlier days, rolling averages, counts and the attention flags), not only the days the save returned */
          try { await window.HKL.refreshPatient(pid); } catch (e2) { window.HKL.applyDays(pid, res.scores); }
          done(res, back, same);
        } catch (e) {
          st.fields = e.fields || {}; const first = st.questions.findIndex(q => st.fields[q.id]);
          if (first >= 0) { st.pos = first; toast('Please check this answer'); show(); st.fields[st.questions[first].id] = null; return; }
          stateCard('Your check-in was not saved', e.message, `<div class="ck-actions"><button type="button" class="btn primary lg block" id="again">Try again</button><button type="button" class="btn lg block" id="toQ">Back to my answers</button></div>`);
        }
      }
      // Last screen: shows the day's score, what changed and the answers shared
      function done(res, back, same) {
        st.stage = 'done';
        const row = todayRow(pid), g = row.g ?? null, percent = row.score ?? null;
        const got = list().filter(q => back.saved_answers && back.saved_answers[q.id] != null);
        const rows = got.map(q => {
          const a = back.saved_answers[q.id], d = domOf(q), t = Array.isArray(a) ? a.join(', ') : (q.type === 'scale_0_10' ? a + ' out of 10' : q.type === 'minutes' ? a + ' min' : a);
          return `<li><span>${d ? ic(d.icon, 'sm') : ic('target', 'sm')}</span><span><b class="pt">${esc(q.text)}</b><span class="a">${esc(t)}</span></span></li>`;
        }).join('');
        /* the change is labelled with what it compares: the score just before this check-in was saved */
        const delta = st.beforeG != null && g != null ? Math.round((g - st.beforeG) * 10) / 10 : null;
        const fail = same ? '' : `<div class="notice warn" role="alert" style="text-align:left">${ic('triangle-alert')}<span>We could not confirm that your answers were saved correctly. What was saved did not match what was sent.</span></div><div class="ck-actions"><button type="button" class="btn primary lg block" id="again">Save again</button><button type="button" class="btn lg block" id="toQ">Back to my answers</button></div>`;
        box.innerHTML = `<div class="scene ckbanner done-scene" aria-hidden="true">${sceneSVG({ w: 390, h: 150, mood: 'content', seed: 3, petScale: .6, label: 'Pip on a hill' })}</div>
          <div class="ck-card done-card"><div class="done-head"><h1 class="q" id="qtitle" tabindex="-1">${same ? 'Check-in saved' : 'Please check your answers'}</h1>${same ? '<p class="ink2">Your answers were saved and confirmed.</p>' : ''}</div>${fail}
          <div class="pcard done-score"><p class="sc-label">Today’s lifestyle score</p>
            <b class="sc-num num">${g == null ? '--' : fmtG(g)}</b>
            <p class="sc-scale">Scale: −10 to +10${row.prov ? ' · So far today' : ''}</p>
            ${percent == null ? '' : `<p class="sc-sub">${window.percentEarnedText(percent)}</p>`}
            ${delta == null || delta === 0 ? '' : `<p class="done-delta ${delta > 0 ? 'up' : 'down'}">${ic(delta > 0 ? 'trending-up' : 'trending-down', 'sm')}<span>${delta > 0 ? '+' : '\u2212'}${Math.abs(delta).toFixed(1)} since before this check-in</span></p>`}</div>
          <div class="ck-actions"><a class="btn primary lg block ck-go see" href="#/patient/week${pq(pid)}"><span class="lbl">${SPARK_ICON}<span>See your week</span><span class="go-arrow">${ic('arrow-right')}</span></span></a><a class="btn lg block" href="#/patient${pq(pid)}">Back to today</a></div>
          ${rows ? `<div class="pcard" style="text-align:left"><h2 style="font-size:var(--t-md);margin:0">What you shared</h2><ul class="summary">${rows}</ul></div>` : ''}
          <div class="sharedline" style="justify-content:center">${ic('lock', 'sm')}<span>Your practitioner can view this check-in.</span></div></div>`;
        body.scrollTop = 0; $('#qtitle', box).focus({ preventScroll: true });
        // Start the pet's celebration
        /* The pet celebrates once the check-in is saved: arms up, two pumps, a happy walk left and right, back to the middle, still smiling */
        const pip = $('.done-scene .pet', box);
        if (pip) { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) pip.classList.add('cheered'); else { pip.classList.add('cheer', 'cheered'); setTimeout(() => pip.classList.remove('cheer'), 5400); } }
      }
      on(box, 'click', '.more', (e, b) => { const a = b.previousElementSibling, open = a.classList.toggle('clamp') === false; b.textContent = open ? 'Show less' : 'Show more'; b.setAttribute('aria-expanded', String(open)); });

      // Turn on the buttons: pick morning/evening, start, back, skip, next, choose an answer and typing
      /* ----- events ----- */
      setup();
      on(box, 'click', '#when button', (e, b) => { st.when = b.dataset.w; setup(); });
      on(box, 'click', '#start', (e, b) => satisfy(b, begin));
      on(box, 'click', '#retry', begin);
      on(box, 'click', '#toSetup', setup);
      on(box, 'click', '#again', save);
      on(box, 'click', '#toQ', () => { st.pos = Math.max(step(-1), firstPos()); show(); });
      on(box, 'click', '#back', () => { const n = step(-1); if (n >= 0) { st.pos = n; show(); } else setup(); });
      on(box, 'click', '#finish', save);
      on(box, 'click', '#skip', () => { delete st.ans[cur().id]; go(); });   /* the link says "Clear my answer and skip" when an answer exists, so removing it is explicit */
      on(box, 'click', '#next', (e, b) => { const q = cur(); if (q.type === 'scale_0_10' && st.ans[q.id] == null) st.ans[q.id] = +$('#sc', box).value; satisfy(b, go); });
      on(box, 'click', '.opt-btn', (e, b) => {
        const q = cur(), v = b.dataset.v;
        if (q.type === 'multi_choice') { const a = st.ans[q.id] || []; st.ans[q.id] = a.includes(v) ? a.filter(x => x !== v) : [...a, v]; b.setAttribute('aria-pressed', String(st.ans[q.id].includes(v))); }
        else { st.ans[q.id] = v; $$('.opt-btn', box).forEach(x => x.setAttribute('aria-pressed', String(x === b))); }
        $('#next', box).disabled = !answered(q); nextLabel();
      });
      box.addEventListener('input', e => {
        const q = cur(); if (!q || st.stage !== 'q') return;
        if (e.target.id === 'ans') { const v = e.target.value; st.ans[q.id] = (q.type === 'integer' || q.type === 'minutes') ? (v === '' ? undefined : Math.round(+v)) : v; $('#next', box).disabled = !answered(q); nextLabel(); }
        if (e.target.id === 'sc') { const v = +e.target.value; st.ans[q.id] = v; $('#sv', box).textContent = v; e.target.style.setProperty('--fill', v * 10 + '%'); $('#next', box).disabled = false; }
      });
    }
  };
}, 'p-checkin');
