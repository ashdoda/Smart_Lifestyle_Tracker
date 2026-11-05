/* ===== Patient check-in: one question per card, length picker, adaptive follow-ups ===== */
const SIZE_INFO = { quick: ['1', 'One main question. Stop whenever you like.'], standard: ['3', 'The main question plus a few follow-ups.'], extended: ['5', 'Time to reflect, problem-solve and plan.'] };
const GOAL_IDEAS = ['After breakfast, I will stretch for 5 minutes at home.', 'At 3 PM, I will step outside for 5 minutes.', 'Before bed, I will write down tomorrow’s one goal.'];

/* a small, satisfying click: the button pops, a few sparks fly out, then we carry on */
function satisfy(el, go) {
  if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { go(); return; }
  if (el.classList.contains('popping')) return;
  el.classList.add('popping');
  const n = 12, box = document.createElement('span'); box.className = 'sparks'; box.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + (i % 2 ? .2 : 0), d = 34 + (i % 3) * 14, s = document.createElement('i'); s.style.setProperty('--dx', Math.cos(a) * d + 'px'); s.style.setProperty('--dy', Math.sin(a) * d * .7 + 'px'); s.style.setProperty('--c', i % 3 === 0 ? 'var(--edge)' : i % 3 === 1 ? 'var(--on-accent)' : 'var(--accent-soft)'); box.appendChild(s); }
  el.appendChild(box); setTimeout(() => { go(); el.classList.remove('popping'); box.remove(); }, 260);
}
/* every big button of this style (links) gets the same feedback: pop, sparks, then it goes where it points */
document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a.ck-go'); if (!a || e.defaultPrevented) return; e.preventDefault(); const h = a.getAttribute('href'); satisfy(a, () => { location.hash = h; }); });
const SPARK_ICON = '<svg class="spark" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path class="base" d="M3 19h18" opacity=".35"/><path class="ln" d="M3 16.5 9 10.5l4 3.5 8-8"/><path class="hd" d="M16 6h5v5"/></svg>';
function buildQueue(when, length, C) {
  const G = GENERAL[when], q = [];
  const gen = (x, extra = {}) => ({ key: x.id, dom: null, q: x, ...extra });
  const doms = DOMAINS.filter(d => C.unlocked.includes(d.id));
  const domQ = (d, n) => d[when].slice(0, n).map(x => ({ key: x.id, dom: d, q: x }));
  const custom = (C.custom || []).filter(c => c.when === when).map(c => ({ key: c.id, dom: DOM[c.dom], q: { id: c.id, text: c.text, type: c.type, options: c.options }, custom: true }));
  q.push(gen(G.primary, { primary: true }));
  if (length === 'standard') {
    q.push(gen(when === 'am' ? G.follow[3] : G.follow[2]));
    doms.slice(0, 3).forEach(d => q.push(...domQ(d, 1)));
    q.push(...custom.slice(0, 1));
  }
  if (length === 'extended') {
    G.follow.forEach(f => q.push(gen(f)));
    doms.forEach(d => q.push(...domQ(d, 2)));
    q.push(...custom);
  }
  /* team-suggested sleep log: asked in the morning check-in at Standard and Extended length */
  if (when === 'am' && length !== 'quick') { const sl = doms.find(d => d.id === 'sleep'); if (sl) sl.am.filter(x => x.team).forEach(x => q.push({ key: x.id, dom: sl, q: x })); }
  return q;
}
const SPECIAL = {
  shrink: { key: 'shrink', dom: null, special: 'shrink', intro: 'Confidence looks low today.', q: { id: 'shrink', text: 'That sounds like a big goal for today. Want to make it smaller?', type: 'choice', options: ['Do half of it', 'Do a 5-minute version', 'Pick a different goal', 'Keep it as it is'] } },
  barrier: { key: 'barrier', dom: null, special: 'barrier', intro: 'That happens to everyone. Progress matters more than a perfect day.', q: { id: 'barrier', text: 'What got in the way today?', type: 'multi', options: BARRIERS } },
  repeat: { key: 'repeat', dom: null, special: 'repeat', intro: 'Low energy has come up three days in a row.', q: { id: 'repeat', text: 'Want to try a different plan for tomorrow?', type: 'choice', options: ['Try a 5-minute version', 'Move it to a better time of day', 'Ask my provider for ideas'] } },
};

route(/^\/patient\/checkin$/, () => {
  const pid = phonePid(), p = PAT[pid]; if (!p) return phoneEmpty();
  const C = cfg(pid), S = PS(pid), qs = phoneQuery();
  const baseLen = (C.autoShorten && p.lengthNow !== p.lengthChosen) ? p.lengthNow : C.length;
  const st = { stage: 'setup', when: qs.get('when') === 'am' ? 'am' : 'pm', length: baseLen, queue: [], idx: 0, ans: {}, held: [] };
  const notes = `<div class="card"><h2>About this screen</h2><ul>
      <li>One main question per card. The patient picks 1, 3 or 5 minutes, and can stop at any time.</li>
      <li>After the main question, a short check asks if they want to keep going.</li>
      <li>Follow-ups adapt to the answers: a missed goal asks about barriers and self-kindness, low confidence offers a smaller goal, and a repeated barrier suggests a different plan.</li>
      <li>The Ideas button shows tips, why it matters, and resources next to each question.</li>
      <li>Questions are the practitioner’s wording. Questions the provider adds also appear here.</li></ul></div>
    <div class="card"><h2>Try this</h2><ul><li>Pick Quick, answer, then choose to keep going.</li><li>Evening: answer No to “Did I meet my goal today?”</li><li>Morning: move confidence to 4 or lower.</li></ul></div>`;
  return {
    html: phoneStage(pid, 'checkin', '<div id="ck"></div>', notes),
    mount(root) {
      const box = $('#ck', root), body = $('#pbody', root);
      const keyOf = c => c.key;
      const cur = () => st.queue[st.idx];
      const G = () => GENERAL[st.when];
      const realQ = () => st.queue.filter(x => x.special !== 'keepgoing');
      const counter = () => { const tot = Math.max(1, realQ().length), done = st.queue.slice(0, st.idx).filter(x => x.special !== 'keepgoing').length; return st.queue[st.idx] && st.queue[st.idx].special === 'keepgoing' ? `${tot}/${tot}` : `${Math.min(done + 1, tot)}/${tot}`; };
      const pbar = (pct, label) => `<div class="pwrap"><span class="pcount num" aria-hidden="true">${label}</span><div class="pbar" role="progressbar" aria-label="Check-in progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-valuetext="Question ${label.replace('/', ' of ')}"><i style="width:${Math.max(pct, 6)}%"></i></div></div>`;
      const progress = () => st.stage === 'setup' ? 0 : Math.round(Math.min(100, (st.idx / Math.max(1, st.queue.length)) * 100));

      /* ----- setup ----- */
      function setup() {
        const adaptive = (C.autoShorten && p.lengthNow !== p.lengthChosen) ? `<div class="notice info ncollapse"><button type="button" class="nc-head" aria-expanded="false" aria-controls="ncbody">${ic('info')}<span class="nc-t">Set to ${LENGTH[p.lengthNow].name} for now...</span><span class="nc-chev">${ic('chevron-right', 'sm')}</span></button><p class="nc-body hide" id="ncbody">You chose ${LENGTH[p.lengthChosen].name}, but the last few check-ins were hard to finish. After a week of check-ins we will ask if you want to try more.</p></div>` : '';
        box.innerHTML = `<div class="scene ckbanner" aria-hidden="true">${sceneSVG({ w: 390, h: 128, mood: null, seed: 3, label: 'Calm hills at dusk' })}</div>
          <div class="ck-card"><div><h1 class="q" id="settitle" tabindex="-1">${st.when === 'am' ? 'Morning' : 'Evening'} check-in</h1><p class="ink2" style="margin-top:var(--s2)">Answer as many or as few questions as you like. You can stop at any time.</p></div>
          <div class="seg fill" id="when" role="group" aria-label="Time of day"><button type="button" data-w="am" aria-pressed="${st.when === 'am'}">${ic('sun', 'sm')} Morning</button><button type="button" data-w="pm" aria-pressed="${st.when === 'pm'}">${ic('moon', 'sm')} Evening</button></div>
          <div class="size-card" role="group" aria-label="How much time do you have?"><span class="label">How much time do you have?</span>
            ${['quick', 'standard', 'extended'].map(k => `<button type="button" class="size-opt" data-len="${k}" aria-pressed="${st.length === k}"><span class="mn">${SIZE_INFO[k][0]}<small>min</small></span><span><b>${LENGTH[k].name}</b><span class="d">${SIZE_INFO[k][1]}</span></span></button>`).join('')}</div>
          ${adaptive}
          <button type="button" class="btn primary lg block ck-go" id="start"><span class="lbl">${ic('sparkles')}<span>Start check-in</span><span class="go-arrow">${ic('arrow-right')}</span></span></button></div>`;
      }

      /* ----- controls ----- */
      const optBtn = (v, on_, extra = '') => `<button type="button" class="opt-btn" data-v="${esc(v)}" aria-pressed="${on_}" ${extra}><span class="rd">${ic('check')}</span><span>${esc(v)}</span></button>`;
      function control(c) {
        const q = c.q, a = st.ans[keyOf(c)];
        let h = '';
        if (q.type === 'text') h = `<div class="field"><label class="sr" for="ans">Your answer</label><textarea class="textarea" id="ans" placeholder="${esc(q.ph || 'Write a sentence or two')}">${esc(a || '')}</textarea></div>${q.photo ? `<button type="button" class="btn" id="photo">${ic('camera')}<span>Add a photo (optional)</span></button>` : ''}`;
        else if (q.type === 'choice') h = `<div class="opts" role="group" aria-label="Choose one">${q.options.map(o => optBtn(o, a === o)).join('')}${q.other ? optBtn('Something else', a && !q.options.includes(a)) : ''}</div>`;
        else if (q.type === 'multi') h = `<div class="opts" role="group" aria-label="Choose any that apply">${q.options.map(o => optBtn(o, (a || []).includes(o))).join('')}</div>`;
        else if (q.type === 'yesno') h = `<div class="yn" role="group" aria-label="Yes or no">${['Yes', 'No'].map(o => optBtn(o, a === o.toLowerCase(), `data-yn="${o.toLowerCase()}"`)).join('')}</div>`;
        else if (q.type === 'scale') { const v = a ?? 5, ends = q.id === 'mind-pm-3' ? ['Wired and alert', 'Very calm'] : q.id === 'g-am-5' ? ['Not confident', 'Very confident'] : ['Low', 'High']; h = `<div class="scalev"><div class="val num" id="sv" aria-live="polite">${v}</div><input class="range" id="sc" type="range" min="0" max="10" step="1" value="${v}" aria-label="${esc(q.text)}" style="--fill:${v * 10}%"><div class="ends"><span>${ends[0]}</span><span>${ends[1]}</span></div></div>`; }
        else if (q.type === 'mood') h = `<div class="mood4" role="group" aria-label="How did you feel?">${[['Low', 'frown'], ['Okay', 'meh'], ['Good', 'smile'], ['Great', 'sparkles']].map(([l, i]) => `<button type="button" class="opt-btn" data-v="${l}" aria-pressed="${a === l}">${ic(i, 'lg')}<span>${l}</span></button>`).join('')}</div>`;
        else if (q.type === 'time') h = `<div class="field"><label class="sr" for="ans">Time</label><input class="input" id="ans" type="time" value="${esc(a || q.def || '21:30')}" style="font-size:var(--t-xl);text-align:center"></div>`;
        if (q.plus) h += `<div class="stack" style="gap:var(--s3)"><h2 class="q" style="font-size:var(--t-lg)">${esc(q.plus.text)}</h2><div class="yn" role="group" aria-label="${esc(q.plus.text)}">${['Yes', 'No'].map(o => optBtn(o, st.ans[q.plus.id] === o.toLowerCase(), `data-yn="${o.toLowerCase()}"`)).join('')}</div></div>`;
        return h;
      }
      const answered = c => { const q = c.q, a = st.ans[keyOf(c)]; if (q.plus) return !!st.ans[q.plus.id]; if (q.type === 'scale') return true; if (q.type === 'time') return true; if (q.type === 'multi') return (a || []).length > 0; if (q.type === 'text') return !!(a && a.trim()); return a != null && a !== ''; };
      const hasIdeas = c => !c.special;

      /* ----- question card ----- */
      function show() {
        const c = cur(); if (!c) return finish();
        if (c.special === 'keepgoing') return keepGoing();
        const q = c.q, last = st.idx === st.queue.length - 1, pct = progress();
        box.innerHTML = `<div class="ck-top"><button type="button" class="btn icon sm" id="back" aria-label="Previous question">${ic('arrow-left', 'sm')}</button>${pbar(pct, counter())}<button type="button" class="link" id="finish">Finish</button></div>
          <div class="ck-card">${c.intro ? `<div class="notice info">${ic('hand-heart')}<span>${esc(c.intro)}</span></div>` : ''}
            <span class="pill ${c.dom ? 'info' : ''}" style="align-self:flex-start">${c.dom ? ic(c.dom.icon, 'sm') + c.dom.name : (c.special ? ic('sprout', 'sm') + 'Making it work for you' : ic('target', 'sm') + 'Today’s goal')}</span>
            <h1 class="q" id="qtitle" tabindex="-1">${esc(q.text)}</h1>${control(c)}
            ${hasIdeas(c) ? `<button type="button" class="btn sm" id="ideas" style="align-self:flex-start">${ic('lightbulb', 'sm')}<span>Ideas and why it matters</span></button>` : ''}
            <div class="ck-actions"><button type="button" class="btn primary lg block" id="next" ${answered(c) ? '' : 'disabled'}>${last ? 'Finish check-in' : 'Next'}</button><button type="button" class="link" id="skip" style="align-self:center">Skip this one</button></div></div>`;
        body.scrollTop = 0; const t = $('#qtitle', box); t && t.focus({ preventScroll: true });
      }
      function keepGoing() {
        const g = S.goalMet === 'no' ? ['Thanks for being honest.', 'Want to look at what got in the way? It takes about a minute, and a hard day still counts.', 'Yes, let’s look at it', 'Not now']
          : S.goalMet === 'yes' ? ['Nice work. That follow-through adds up.', 'Want to add what helped, plus a few more questions? About 2 minutes.', 'Keep going', 'I’m done for now']
            : ['Nice. That is a real start.', 'Want to keep going? A few more questions take about 2 minutes. Stopping here counts too.', 'Keep going, 2 more minutes', 'I’m done for now'];
        box.innerHTML = `<div class="ck-top"><button type="button" class="btn icon sm" id="back" aria-label="Previous question">${ic('arrow-left', 'sm')}</button>${pbar(30, counter())}<span style="width:44px"></span></div>
          <div class="ck-card"><div style="text-align:center"><div class="done-pet">${petSVG('content')}</div></div><h1 class="q" id="qtitle" tabindex="-1" style="text-align:center">${g[0]}</h1><p class="ink2" style="text-align:center">${g[1]}</p>
          <div class="ck-actions"><button type="button" class="btn primary lg block" id="more">${g[2]}</button><button type="button" class="btn lg block" id="stop">${g[3]}</button></div></div>`;
        body.scrollTop = 0;
      }

      /* ----- adaptive rules ----- */
      function adapt(c) {
        const q = c.q, ins = [], ids = new Set(st.queue.map(x => x.key));
        if (q.adaptive === 'lowConfidence' && (st.ans[keyOf(c)] ?? 5) <= 4) ins.push(SPECIAL.shrink);
        if (q.plus && q.plus.adaptive === 'goalMet') {
          const g = st.ans[q.plus.id]; S.goalMet = g;
          if (g === 'yes') [G().follow[0], G().follow[1]].forEach(f => ins.push({ key: f.id, dom: null, q: f }));
          else if (g === 'no') { ins.push(SPECIAL.barrier, { key: G().notMet.id, dom: null, q: G().notMet }); st.queue = st.queue.filter((x, i) => !(i > st.idx && x.key === 'g-pm-4')); }
        }
        if (c.special === 'barrier' && (st.ans.barrier || []).includes('Low energy')) ins.push(SPECIAL.repeat);
        return ins.filter(x => !ids.has(x.key));
      }
      function next() {
        const c = cur(), ins = adapt(c);
        const isQuickPrimary = c.primary && st.length === 'quick' && st.queue.length === 1;
        if (isQuickPrimary) { st.held = ins; st.queue.push({ key: 'kg', special: 'keepgoing', q: { text: '' } }); }
        else if (ins.length) st.queue.splice(st.idx + 1, 0, ...ins);
        st.idx++; show();
      }
      function finish() {
        st.stage = 'done';
        const q = st.queue.filter(c => c.special !== 'keepgoing'), got = q.filter(c => st.ans[keyOf(c)] != null && st.ans[keyOf(c)] !== '' && !(Array.isArray(st.ans[keyOf(c)]) && !st.ans[keyOf(c)].length));
        const n = got.length;
        const bump = Math.round((st.when === 'pm' ? .9 : .6) * n + (S.goalMet === 'yes' ? 3 : S.goalMet === 'no' ? -1 : 0));
        const before = todayScore(pid); S.score = clamp(before + bump, 0, 99); S.done[st.when] = true;
        const dom = todayDomains(pid), mood = S.mood === 'auto' ? petMood(S.score, dom) : S.mood;
        const msg = S.goalMet === 'no' ? 'Thanks for being honest. A hard day still counts, and tomorrow is a fresh start.' : S.goalMet === 'yes' ? 'Nice work today. That follow-through adds up.' : n ? 'Thanks for checking in. Every answer helps you and your provider see the full picture.' : 'You checked in, and that counts. Come back whenever you like.';
        const rows = got.slice(0, 5).map(c => { const a = st.ans[keyOf(c)]; const t = Array.isArray(a) ? a.join(', ') : (c.q.type === 'scale' ? a + ' out of 10' : a); return `<li><span>${c.dom ? ic(c.dom.icon, 'sm') : ic('target', 'sm')}</span><span><div class="ptitle"><b class="pt">${esc(c.q.text)}</b><button type="button" class="pcaret hide" aria-expanded="false" aria-label="Show the full question: ${esc(c.q.text)}">${ic('chevron-down', 'sm')}</button></div><span class="a">${esc(String(t))}</span></span></li>`; }).join('');
        box.innerHTML = `<div class="ck-card" style="text-align:center;padding-top:var(--s6)"><div class="done-pet">${petSVG(mood)}</div><h1 class="q" id="qtitle" tabindex="-1">Check-in saved</h1><p class="ink2">${msg}</p>
          <div class="pcard" style="text-align:left"><div class="row between"><div><span class="muted" style="font-size:var(--t-sm)">Today’s rating</span><div class="row" style="gap:var(--s2);align-items:baseline"><b class="num" style="font-family:var(--font-display);font-size:2.4rem;line-height:1">${S.score}</b><span class="delta ${S.score >= before ? 'up' : 'down'}">${ic(S.score >= before ? 'trending-up' : 'trending-down', 'sm')}${S.score >= before ? '+' : '−'}${Math.abs(S.score - before)} from your check-in</span></div></div></div>
            ${rows ? `<h2 style="font-size:var(--t-md);margin:var(--s4) 0 0">What you shared</h2><ul class="summary">${rows}</ul>` : ''}<div class="sharedline">${ic('lock', 'sm')}<span>Shared with your provider, ${esc(provName())}.</span></div></div>
          <div class="ck-actions"><a class="btn primary lg block ck-go see" href="#/patient/week${pq(pid)}"><span class="lbl">${SPARK_ICON}<span>See your week</span><span class="go-arrow">${ic('arrow-right')}</span></span></a><a class="btn lg block" href="#/patient${pq(pid)}">Back to today</a></div></div>`;
        body.scrollTop = 0; $('#qtitle', box).focus({ preventScroll: true });
      }

      /* ----- events ----- */
      setup();
      on(box, 'click', '#when button', (e, b) => { st.when = b.dataset.w; S.goalMet = null; setup(); });
      on(box, 'click', '.size-opt', (e, b) => { st.length = b.dataset.len; $$('.size-opt', box).forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
      on(box, 'click', '#start', (e, b) => satisfy(b, () => { st.stage = 'q'; S.goalMet = null; st.ans = {}; st.held = []; st.idx = 0; st.queue = buildQueue(st.when, st.length, C); show(); }));
      on(box, 'click', '.nc-head', (e, b) => { const open = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', String(open)); $('#ncbody', box).classList.toggle('hide', !open); b.closest('.ncollapse').classList.toggle('open', open); $('.nc-t', b).textContent = $('.nc-t', b).textContent.replace(/\.\.\.$/, '') + (open ? '' : '...'); });

      on(box, 'click', '#back', () => { if (st.idx > 0) { st.idx--; show(); } else { st.stage = 'setup'; setup(); } });
      on(box, 'click', '#finish', finish);
      on(box, 'click', '#skip', () => { st.ans[keyOf(cur())] = undefined; const c = cur(); if (c.primary && st.length === 'quick' && st.queue.length === 1) { st.queue.push({ key: 'kg', special: 'keepgoing', q: { text: '' } }); } st.idx++; show(); });
      on(box, 'click', '#next', () => { const c = cur(), q = c.q; if (q.type === 'scale' && st.ans[keyOf(c)] == null) st.ans[keyOf(c)] = +$('#sc', box).value; if (q.type === 'time') st.ans[keyOf(c)] = $('#ans', box).value; next(); });
      on(box, 'click', '#more', () => {
        st.length = 'standard';
        const rest = buildQueue(st.when, 'standard', C).slice(1).filter(x => !st.held.some(h => h.key === x.key));
        st.queue = [st.queue[0], ...st.held, ...rest]; st.held = []; st.idx = 1; show();
      });
      on(box, 'click', '#stop', finish);
      on(box, 'click', '.opt-btn', (e, b) => {
        const c = cur(), q = c.q;
        if (b.dataset.yn) { const id = q.plus ? q.plus.id : keyOf(c); st.ans[id] = b.dataset.yn; $$('[data-yn]', box).forEach(x => x.setAttribute('aria-pressed', String(x === b))); }
        else if (q.type === 'multi') { const a = st.ans[keyOf(c)] || []; const v = b.dataset.v; st.ans[keyOf(c)] = a.includes(v) ? a.filter(x => x !== v) : [...a, v]; b.setAttribute('aria-pressed', String(st.ans[keyOf(c)].includes(v))); }
        else { st.ans[keyOf(c)] = b.dataset.v; $$('.opt-btn', box).forEach(x => x.setAttribute('aria-pressed', String(x === b))); if (c.special === 'shrink') { toast('A smaller goal still counts.'); } }
        $('#next', box).disabled = !answered(c);
      });
      box.addEventListener('input', e => {
        const c = cur(); if (!c) return;
        if (e.target.id === 'ans' && c.q.type === 'text') { st.ans[keyOf(c)] = e.target.value; $('#next', box).disabled = !answered(c); }
        if (e.target.id === 'sc') { const v = +e.target.value; st.ans[keyOf(c)] = v; $('#sv', box).textContent = v; e.target.style.setProperty('--fill', v * 10 + '%'); }
      });
      on(box, 'click', '#photo', () => toast('Photo added (prototype)'));
      on(box, 'click', '#ideas', () => {
        const c = cur(), d = c.dom, insert = t => { const ta = $('#ans', box); if (ta && c.q.type === 'text') { ta.value = (ta.value ? ta.value + ' ' : '') + t; ta.dispatchEvent(new Event('input', { bubbles: true })); } };
        phoneSheet(root, `<span class="pill info">${ic(d ? d.icon : 'target', 'sm')}${d ? d.name : 'Today’s goal'}</span><h2 style="margin-top:var(--s3)">${d ? 'Ideas for this question' : 'Making a goal that works'}</h2>
          <h3>Why it matters</h3><p class="ink2" style="font-size:var(--t-sm)">${d ? esc(d.why) : 'Small, specific goals with a time and place are easier to follow through on than big, vague ones.'}</p>
          <h3>Ideas to try${c.q.type === 'text' ? ' (tap to add to your answer)' : ''}</h3><div class="chips">${(d ? d.ideas : GOAL_IDEAS).map((t, i) => `<button type="button" class="chip" data-idea="${i}">${esc(t)}</button>`).join('')}</div>
          ${d ? `<h3>Resources</h3><div class="stack" style="gap:var(--s2)">${d.resources.map((r, i) => `<button type="button" class="idea" data-res="${i}"><span class="ii">${ic(d.icon)}</span><span><b>${esc(r.title)}</b><small>${esc(r.kind)}, ${r.len} min</small></span><span class="chev">${ic('chevron-right')}</span></button>`).join('')}</div>` : ''}
          <div class="col" style="margin-top:var(--s5)"><button class="btn block" data-sheetclose>Close</button></div>`,
        (el, close) => {
          on(el, 'click', '[data-idea]', (e2, b) => { const t = (d ? d.ideas : GOAL_IDEAS)[+b.dataset.idea]; if (c.q.type === 'text') { insert(t); close(); toast('Added to your answer'); } else toast(t); });
          on(el, 'click', '[data-res]', (e2, b) => { close(); setTimeout(() => resourceSheet(root, d, d.resources[+b.dataset.res]), 280); });
        });
      });
    }
  };
}, 'p-checkin');
