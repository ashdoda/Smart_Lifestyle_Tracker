/* ===== Patient app (phone): shell, Today screen with Pip + day rating ===== */
const PSTATE = {};
function phoneQuery() { return new URLSearchParams(location.hash.split('?')[1] || ''); }
function phonePid() { const p = phoneQuery().get('p'); return PAT[p] ? p : ((session.role === 'patient' && session.id && PAT[session.id]) ? session.id : firstPid()); }
function phoneEmpty() { return { html: `<div class="card" style="max-width:520px;margin:var(--s7) auto"><h2>No patient yet</h2><p class="ink2" style="margin:8px 0 16px">This screen shows one patient\u2019s phone app. Add a patient from the provider patient list first.</p><a class="btn primary" href="#/provider/add">Add a patient</a> <a class="btn" href="#/provider">Patient list</a></div>` }; }
const greetWord = () => { const h = HK.now().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const LONG_DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const longDate = d => `${LONG_DOW[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
const statusClock = () => { const n = HK.now(); return `${((n.getHours() + 11) % 12) + 1}:${String(n.getMinutes()).padStart(2, '0')}`; };
function PS(pid) {
  if (!PSTATE[pid]) PSTATE[pid] = { score: null, done: { am: !!HK.provider.todayStatus(pid).amDone, pm: !!HK.provider.todayStatus(pid).pmDone }, mood: store.get('petMood', 'auto'), logs: {}, goalMet: null, offer: false };
  return PSTATE[pid];
}
const pq = (pid, extra = '') => { const a = []; if (pid !== firstPid()) a.push('p=' + pid); if (extra) a.push(extra); if (isClean()) a.push('clean=1'); return a.length ? '?' + a.join('&') : ''; };
const ratingWord = s => s >= 85 ? 'A great day' : s >= 70 ? 'A good day' : s >= 55 ? 'A steady day' : s >= 40 ? 'A tough day. Small steps count.' : 'A rough day. Be gentle with yourself.';
function todayScore(pid) { const p = PAT[pid]; return PS(pid).score ?? (p.today != null ? Math.round(p.today) : HK.config.defaultScore); }
function todayDomains(pid) { const p = PAT[pid]; return domainScores(p, TODAY, todayScore(pid)); }

function phoneSheet(root, html, onMount) {
  const sc = $('#phone', root); const el = document.createElement('div'); el.className = 'sheet-wrap';
  el.innerHTML = `<div class="sheet-scrim" data-sheetclose></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab" aria-hidden="true"></div>${html}</div>`;
  sc.appendChild(el); requestAnimationFrame(() => el.classList.add('in'));
  const close = () => { el.classList.remove('in'); setTimeout(() => el.remove(), 260); document.removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  on(el, 'click', '[data-sheetclose]', close);
  setTimeout(() => { const f = $('button,input,textarea', $('.sheet', el)); f && f.focus(); }, 80);
  onMount && onMount(el, close);
  return close;
}

function phoneStage(pid, tab, inner, notes) {
  const tabs = [['today', 'Today', 'house', '/patient'], ['checkin', 'Check-in', 'clipboard-check', '/patient/checkin'], ['week', 'Week', 'chart-line', '/patient/week']];
  return `<div class="stage"><div class="phone" id="phone"><span class="island"></span>
    <div class="pstatus" aria-hidden="true"><span>${statusClock()}</span><span class="row" style="gap:6px">${ic('signal', 'sm')}${ic('wifi', 'sm')}${ic('battery-full')}</span></div>
    <main class="pbody" id="pbody">${inner}</main>
    <nav class="tabbar" aria-label="Patient app">${tabs.map(([k, l, i, p]) => `<a href="#${p}${pq(pid)}" ${k === tab ? 'aria-current="page"' : ''}><span class="ti">${ic(i)}</span>${l}</a>`).join('')}</nav></div>
    <aside class="notes">${notes}</aside></div>`;
}

const RES_STEPS = {
  '1-minute breathing reset': ['Sit comfortably and let your shoulders drop.', 'Breathe in through your nose for a count of 4.', 'Breathe out slowly for a count of 6.', 'Repeat for one minute. Let thoughts drift by without judging them.'],
  '5-minute grounding, 5-4-3-2-1': ['Name 5 things you can see.', 'Name 4 things you can touch.', 'Name 3 things you can hear.', 'Name 2 things you can smell.', 'Name 1 thing you can taste.'],
  '3-minute body scan': ['Sit or lie down and close your eyes if you like.', 'Notice your feet, then your legs, then your belly.', 'Move up through your chest, hands, shoulders and face.', 'Let each area soften as you notice it.'],
};
function resourceSheet(root, d, r) {
  const steps = RES_STEPS[r.title];
  phoneSheet(root, `<span class="pill info">${ic(d.icon, 'sm')}${d.name}</span><h2 style="margin-top:var(--s3)">${esc(r.title)}</h2>
    <div class="row wrap" style="gap:var(--s2)"><span class="pill">${esc(r.kind)}</span><span class="pill">${r.len} min</span><span class="pill">${esc(r.energy)}</span></div>
    <h3>Why this helps</h3><p class="ink2" style="font-size:var(--t-sm)">${esc(d.why)}</p>
    ${steps ? `<h3>Try it now</h3><ol class="steps">${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : `<h3>In the full app</h3><p class="ink2" style="font-size:var(--t-sm)">This ${esc(r.kind.toLowerCase())} will open here. The practitioner’s resource list fills this library.</p>`}
    <div class="col" style="margin-top:var(--s5)"><button class="btn primary lg block" data-sheetclose data-save>${ic('check')}<span>Save for later</span></button><button class="btn block" data-sheetclose>Close</button></div>`,
  (el) => on(el, 'click', '[data-save]', () => toast('Saved to your ideas')));
}

const NOTES_HOME = pid => `<div class="card"><h2>About this screen</h2><ul>
    <li>Pip reflects how the day is going: happy, content, tired or down. The animation is real, not a static picture.</li>
    <li>Today’s rating combines everything the patient did. The practitioner sees the same number as the line on the patient page.</li>
    <li>Quick-log buttons are chosen by the provider in card settings.</li>
    <li>Private goals are only for the patient. The provider sees one only if the patient chooses to share it.</li>
    <li>A shortened check-in is offered automatically when questions get skipped, and a longer one is offered again after a week of steady check-ins.</li></ul></div>
  <div class="card"><h2>Demo: adaptive length</h2><p class="muted" style="font-size:var(--t-sm);margin-top:4px">The practitioner\u2019s idea: shorten when questions are skipped, then offer more after a steady week.</p>
    <div class="chips"><button type="button" class="chip sm" data-adapt="short">Skipping a lot</button><button type="button" class="chip sm" data-adapt="offer">A week of check-ins</button></div></div>
  <div class="card"><h2>Demo: Pip’s mood</h2><p class="muted" style="font-size:var(--t-sm);margin-top:4px">Only for the prototype. In the app this follows the rating and sleep.</p>
    <div class="chips" id="moodchips">${['auto', 'happy', 'content', 'tired', 'down'].map(m => `<button type="button" class="chip sm" data-mood="${m}" aria-pressed="${PS(pid).mood === m}">${m === 'auto' ? 'Automatic' : MOODS[m]}</button>`).join('')}</div></div>`;

route(/^\/patient$/, () => {
  const pid = phonePid(), p = PAT[pid]; if (!p) return phoneEmpty();
  const C = cfg(pid), S = PS(pid), first = p.name.split(' ')[0];
  const draw = () => {
    const score = todayScore(pid), dom = todayDomains(pid), mood = S.mood === 'auto' ? petMood(score, dom) : S.mood;
    const weakest = Object.entries(dom).filter(([, v]) => v != null).sort((a, b) => a[1] - b[1])[0];
    const wd = weakest ? DOM[weakest[0]] : DOMAINS[0];
    const ideas = [...wd.resources.slice(0, 2).map(r => [wd, r]), ...DOMAINS.filter(d => d.id !== wd.id && C.unlocked.includes(d.id)).slice(0, 1).map(d => [d, d.resources[0]])];
    const circ = 2 * Math.PI * 54, off = circ * (1 - score / 100);
    const quick = QUICKLOG.filter(q => C.quick[q.id]);
    const streak = streakOf(p) + (S.done.pm ? 0 : 0);
    return `<div class="ph-head"><div class="hd"><h1>${greetWord()}, ${esc(first)}</h1><p>${longDate(TODAY)}</p></div></div>
      <div class="petscene" id="petbox"><span class="pill info moodchip">${ic('heart', 'sm')}Pip feels ${MOODS[mood].toLowerCase()}</span><button type="button" class="btn sm hi" id="hi">${ic('hand-heart', 'sm')}<span>Say hi</span></button>${sceneSVG({ w: 390, h: 292, mood, seed: 3, petScale: .95, label: `Pip the pet feeling ${MOODS[mood].toLowerCase()} on a hill` })}</div>
      <p class="petline" id="petline" aria-live="polite">${esc(PET_LINES[mood][score % 2])}</p>
      <div class="pad stack">
        <section class="pcard" aria-label="Today's rating"><div class="rating">
          <div class="ring" role="img" aria-label="Today's rating ${score} out of 100"><svg viewBox="0 0 132 132" aria-hidden="true"><circle class="tr" cx="66" cy="66" r="54"/><circle class="pg" cx="66" cy="66" r="54" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg><div class="n"><b class="num">${score}</b><span>out of 100</span></div></div>
          <div><h2>Today’s rating</h2><p>${esc(ratingWord(score))}</p><p class="muted" style="font-size:var(--t-xs)">${S.done.pm ? 'Updated after your evening check-in.' : 'So far today. Your evening check-in will update it.'}</p></div></div>
          <div class="dchips">${Object.entries(dom).slice(0, 6).map(([k, v]) => `<div class="dchip">${ic(DOM[k].icon)}<b class="num">${v == null ? '--' : v}</b>${DOM[k].short}</div>`).join('')}</div>
          <div class="sharedline">${ic('lock', 'sm')}<span>Your provider sees this rating over time.</span></div></section>
        <section class="pcard nextup" aria-label="Next check-in">${S.done.pm ? `<div class="row">${ic('circle-check', 'lg')}<div><h2 style="margin:0">All done for today</h2><p class="ink2" style="font-size:var(--t-sm)">Both check-ins are in. That is plenty.</p></div></div><a class="btn lg block" href="#/patient/week${pq(pid)}">${ic('chart-line')}<span>See your week</span></a>`
          : `<div class="row">${ic('moon-star', 'lg')}<div><h2 style="margin:0">Evening check-in</h2><p class="ink2" style="font-size:var(--t-sm)">${HK.provider.todayStatus(pid).amTime ? 'Morning check-in done at ' + HK.provider.todayStatus(pid).amTime + '. Nice start.' : 'Your evening check-in is ready whenever you are.'}</p></div></div>
          <div class="tag"><span class="pill info">${LENGTH[p.lengthNow].name}, about ${LENGTH[p.lengthNow].min} min</span><span class="pill good">${ic('flame', 'sm')}${streak} day streak</span></div>
          ${S.offer && p.lengthNow !== p.lengthChosen ? `<div class="notice info" role="group" aria-label="Try a longer check-in">${ic('sparkles')}<span>You checked in 7 days in a row. Want to try the ${LENGTH[p.lengthChosen].name} check-in again?</span></div><div class="row" style="gap:var(--s2)"><button type="button" class="btn primary grow" data-offer="yes">Yes, try it</button><button type="button" class="btn grow" data-offer="no">Not yet</button></div>` : ''}
          ${p.lengthNow !== p.lengthChosen ? `<p class="ink2" style="font-size:var(--t-sm)">You chose ${LENGTH[p.lengthChosen].name}. We shortened it for now because busy days made it hard. Switch back any time.</p>` : ''}
          <a class="btn primary lg block ck-go" href="#/patient/checkin${pq(pid, 'when=pm')}"><span class="lbl"><span class="clip">${ic('clipboard-check')}</span><span>Start evening check-in</span><span class="go-arrow">${ic('arrow-right')}</span></span></a>`}</section>
        ${quick.length ? `<section class="pcard" aria-label="Quick log"><h2>Quick log</h2><p class="ink2" style="font-size:var(--t-sm);margin-bottom:var(--s3)">Note something between check-ins. No judgment.</p><div class="qlog">${quick.map(q => `<button type="button" class="btn" data-ql="${q.id}">${ic(q.icon)}<span>${q.short || q.label}${S.logs[q.id] ? ` x${S.logs[q.id]}` : ''}</span></button>`).join('')}</div></section>` : ''}
        ${privCardHTML(pid)}
        <section class="stack" aria-label="Ideas for you"><h2 style="font-size:var(--t-lg)">Ideas for you</h2>${ideas.map(([d, r], i) => `<button type="button" class="idea" data-idea="${d.id}:${DOM[d.id].resources.indexOf(r)}"><span class="ii">${ic(d.icon)}</span><span><b>${esc(r.title)}</b><small>${esc(d.name)}, ${r.len} min</small></span><span class="chev">${ic('chevron-right')}</span></button>`).join('')}</section>
      </div>`;
  };
  return {
    html: phoneStage(pid, 'today', draw(), NOTES_HOME(pid)),
    mount(root) {
      const body = $('#pbody', root);
      const redraw = () => { body.innerHTML = draw(); };
      mountPrivate(root, pid, redraw);
      on(root, 'click', '#hi', () => { const pet = $('.pet', root); pet.classList.remove('boop'); void pet.offsetWidth; pet.classList.add('boop'); toast('Pip says hi'); });
      on(root, 'click', '[data-mood]', (e, b) => { S.mood = b.dataset.mood; store.set('petMood', S.mood); $$('[data-mood]', root).forEach(x => x.setAttribute('aria-pressed', String(x === b))); redraw(); });
      on(root, 'click', '[data-adapt]', (e, b) => { if (b.dataset.adapt === 'offer') { if (p.lengthNow === p.lengthChosen) p.lengthNow = 'quick'; S.offer = true; } else { S.offer = false; p.lengthNow = 'quick'; } redraw(); toast(b.dataset.adapt === 'offer' ? 'Offer shown on Today' : 'Shortened to Quick for now'); });
      on(root, 'click', '[data-offer]', (e, b) => { if (b.dataset.offer === 'yes') { p.lengthNow = p.lengthChosen; toast('Switched back to ' + LENGTH[p.lengthChosen].name); } S.offer = false; redraw(); });
      on(root, 'click', '[data-idea]', (e, b) => { const [d, i] = b.dataset.idea.split(':'); resourceSheet(root, DOM[d], DOM[d].resources[+i]); });
      on(root, 'click', '[data-ql]', (e, b) => {
        const q = QUICKLOG.find(x => x.id === b.dataset.ql);
        phoneSheet(root, `<h2>Log: ${q.label}</h2><p class="ink2" style="font-size:var(--t-sm)">This only takes a second. It helps you and ${esc(cfg(pid).custom ? 'your provider' : 'your provider')} spot patterns, and nobody is grading you.</p>
          <h3>When was it?</h3><div class="chips" id="qwhen">${['Just now', 'Earlier today', 'Last night'].map((t, i) => `<button type="button" class="chip" aria-pressed="${i === 0}" data-t="${t}">${t}</button>`).join('')}</div>
          <div class="field" style="margin-top:var(--s4)"><label for="qnote">Anything you want to add? (optional)</label><input class="input" id="qnote" placeholder="Where were you, how were you feeling?"></div>
          ${q.sensitive && q.id === 'drip' ? `<div class="notice warn" style="margin-top:var(--s4)">${ic('phone')}<span>If you are in danger or thinking about hurting yourself, call or text 988 now (Suicide and Crisis Lifeline, US).</span></div>` : ''}
          <div class="col" style="margin-top:var(--s5)"><button class="btn primary lg block" data-sheetclose data-savelog>${ic('check')}<span>Save</span></button><button class="btn block" data-sheetclose>Cancel</button></div>`,
        (el) => { on(el, 'click', '#qwhen .chip', (e2, c) => $$('#qwhen .chip', el).forEach(x => x.setAttribute('aria-pressed', String(x === c)))); on(el, 'click', '[data-savelog]', () => { S.logs[q.id] = (S.logs[q.id] || 0) + 1; toast('Logged. Thank you for noting it.'); setTimeout(redraw, 300); }); });
      });
    }
  };
}, 'p-home');
