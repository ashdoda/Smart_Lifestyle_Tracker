// WHAT THIS FILE DOES
// The patient's phone screens: the phone frame with its tab bar, and the Today screen (greeting, the pet, today's
// score, the area tiles and the check-in section). It also holds the pop-up sheet used for "how it works" details
// and the heart button on the pet picture.
/* ===== Patient app (phone): shell, Today screen with the pet and the day rating ===== */
// Small helpers: which patient the phone shows, the greeting, dates and the clock in the status strip
const PSTATE = {};
function phoneQuery() { return new URLSearchParams(location.hash.split('?')[1] || ''); }
function phonePid() { const p = phoneQuery().get('p'); return PAT[p] ? p : ((session.role === 'patient' && session.id && PAT[session.id]) ? session.id : firstPid()); }
function phoneEmpty() { return { html: `<div class="card" style="max-width:520px;margin:var(--s7) auto"><h2>No patient yet</h2><p class="ink2" style="margin:8px 0 16px">This screen shows one patient\u2019s phone app. Add a patient from the provider patient list first.</p><a class="btn primary" href="#/provider/add">Add a patient</a> <a class="btn" href="#/provider">Patient list</a></div>` }; }
const greetWord = () => { const h = HK.now().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const LONG_DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const longDate = d => `${LONG_DOW[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
const statusClock = () => { const n = HK.now(); return `${((n.getHours() + 11) % 12) + 1}:${String(n.getMinutes()).padStart(2, '0')}`; };
// Which check-ins (morning, evening) are done today, as listed by the server
/* today's check-in status comes from the periods the server lists as submitted (refreshed after every save) */
const todayStatus = pid => { const t = HK.provider.todayStatus(pid); return { am: !!t.amDone, pm: !!t.pmDone }; };
// Builds the "?p=..." part of a link so the same patient is kept
const pq = (pid, extra = '') => { const a = []; if (pid && pid !== 'none') a.push('p=' + pid); if (extra) a.push(extra); if (isClean()) a.push('clean=1'); return a.length ? '?' + a.join('&') : ''; };
// Finds today's row of scores for the patient
const todayRow = pid => PAT[pid].series.find(x => sameDay(x.d, TODAY)) || {};
// The line that says whether today is in the green zone
const zoneLine = pid => { const e = todayRow(pid), inZone = e.g != null && e.g >= (HK.config.greenGraph ?? 70); return `${inZone ? 'In' : 'Below'} the green zone`; };
// Today's score as a percent from the server
function todayScore(pid) { const p = PAT[pid]; const e = p.series.find(x => sameDay(x.d, TODAY)); return e && e.score != null ? e.score : null; }
// Today's score for each area
/* each card's percent today, from the server; shown on the lifestyle score scale */
function todayDomains(pid) { const p = PAT[pid], sc = todayScore(pid), got = HK.provider.domainScores(p, TODAY, sc) || {}, out = {}; p.unlocked.forEach(k => { out[k] = sc == null || got[k] == null ? null : got[k]; }); return out; }

// Opens a sheet that slides up inside the phone (used for "how it works" notes)
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

// The small "i" button that opens those notes
/* a small info button: the short screen stays clean and the calculation details open in a sheet inside the phone */
const infoBtn = (title, paras, key) => `<button type="button" class="infob" data-it="${esc(title)}" data-ip="${esc(JSON.stringify(paras))}"${key ? ` data-ik="${esc(JSON.stringify(key))}"` : ''} aria-label="More about ${esc(title)}">${ic('info', 'sm')}</button>`;
// The small key (line, dashes, band) shown inside the notes
/* a graph key for an info sheet: [kind, label] where kind is line, dash, band or open */
const KEY_SWATCH = { line: '<svg viewBox="0 0 28 12" aria-hidden="true"><path d="M2 6h24" class="k-line"/></svg>', dash: '<svg viewBox="0 0 28 12" aria-hidden="true"><path d="M2 6h24" class="k-dash"/></svg>', band: '<svg viewBox="0 0 28 12" aria-hidden="true"><rect x="2" y="1" width="24" height="10" rx="3" class="k-band"/></svg>', open: '<svg viewBox="0 0 28 12" aria-hidden="true"><circle cx="14" cy="6" r="4.2" class="k-open"/></svg>' };
const keyHTML = key => `<ul class="ikey">${key.map(([k, t]) => `<li>${KEY_SWATCH[k] || ''}<span>${esc(t)}</span></li>`).join('')}</ul>`;
// Opens the notes when an "i" button is pressed
function bindInfo(root) {
  on(root, 'click', '.infob', (e, b) => {
    const paras = JSON.parse(b.dataset.ip), key = b.dataset.ik ? JSON.parse(b.dataset.ik) : null, inner = `<h2 style="margin:0 0 var(--s3)">${esc(b.dataset.it)}</h2>${key ? keyHTML(key) : ''}${paras.map(t => `<p class="ink2" style="margin:0 0 var(--s3);font-size:var(--t-sm)">${esc(t)}</p>`).join('')}<div class="row end"><button type="button" class="btn primary" data-sheetclose data-close>Got it</button></div>`;
    if ($('#phone')) phoneSheet(root, inner); else openDialog(inner, { label: b.dataset.it });   /* inside the phone: a sheet; on practitioner screens: a small dialog */
  });
}

// Builds the phone: top strip, the screen, the tab bar, and the notes box beside it on a computer
function phoneStage(pid, tab, inner, notes) {
  const tabs = [['today', 'Today', 'house', '/patient'], ['checkin', 'Check-in', 'clipboard-check', '/patient/checkin'], ['week', 'Week', 'chart-line', '/patient/week']];
  return `<div class="stage"><div class="phone" id="phone" data-pid="${esc(pid)}"><span class="island"></span>
    <div class="pstatus" aria-hidden="true"><span>${statusClock()}</span><span class="row" style="gap:6px">${ic('signal', 'sm')}${ic('wifi', 'sm')}${ic('battery-full')}</span></div>
    <main class="pbody" id="pbody">${inner}</main>
    <nav class="tabbar" aria-label="Patient app">${tabs.map(([k, l, i, p]) => `<a href="#${p}${pq(pid)}" ${k === tab ? 'aria-current="page"' : ''}><span class="ti">${ic(i)}</span>${l}</a>`).join('')}</nav></div>
    <aside class="notes">${notes}</aside></div>`;
}

// The notes shown beside the phone on the Today screen
const NOTES_HOME = pid => `<div class="card"><h2>About this screen</h2><ul>
    <li>Today’s lifestyle score runs from 0 to 100, calculated from the answers saved so far. The green zone is 70 to 100.</li>
    <li>“So far today” means the day is not finished. Questions not answered yet count as zero, so the score can change until the day ends.</li>
    <li>The score counts how many of the day’s lifestyle questions earned points. It does not measure mood, contentment or clinical health.</li>
    <li>Each domain tile shows that domain’s score on the same scale. Physical Activity comes from the answers to its questions, not from a step counter.</li>
    <li>The check-in heading and button follow the morning and evening check-ins saved today.</li>
    <li>Pip is a friendly companion. It does not react to the score or to how the patient says they feel.</li></ul></div>
  `;

/* Physical Activity tile: the step target saved this morning; after the evening check-in, steps so far over that target (a day with no step reading counts as 0) */
const STEPS = {};
const fmtSteps = n => Math.round(n).toLocaleString('en-US');
function stepsLine(pid, st) {
  const s = STEPS[pid]; if (!s || s.target == null) return '';
  return `<span class="dsteps num">${st && st.pm ? `${fmtSteps(s.steps ?? 0)} / ${fmtSteps(s.target)} steps` : `Step target ${fmtSteps(s.target)}`}</span>`;
}
async function loadSteps(pid) {
  const p = PAT[pid], H = window.HKL, srv = p.backend.patientId, st = todayStatus(pid);
  const day = (await H.request(`/patients/${srv}/now`)).checkin_day;
  const d = await H.request(`/patients/${srv}/days/${day}`);
  let target = d.answers && d.answers.PAM1 != null && d.answers.PAM1 !== '' ? Number(d.answers.PAM1) : null, steps = null;
  if (st.pm) { const c = (await H.request(`/patients/${srv}/checkins/${day}/evening`)).context || {}; steps = c.steps_today ?? null; if (c.step_target != null) target = Number(c.step_target); }
  STEPS[pid] = { target: Number.isFinite(target) ? target : null, steps };
}

// The Today screen itself
route(/^\/patient$/, () => {
  const pid = phonePid(), p = PAT[pid]; if (!p) return phoneEmpty();
  const first = (p.backend && p.backend.preferredName) || p.name.split(' ')[0];
  // Builds the whole Today screen (greeting, pet, score, area tiles, check-in section)
  const draw = () => {
    const row = todayRow(pid), st = todayStatus(pid), g = row.g ?? null, pct = todayScore(pid), dom = todayDomains(pid);
    const both = st.am && st.pm, suggest = !st.am && !st.pm ? (HK.now().getHours() < 12 ? 'am' : 'pm') : st.am ? 'pm' : 'am';
    const cp = window.checkinPrompt([st.am && 'morning', st.pm && 'evening'].filter(Boolean)), head = cp.heading;
    const tiles = Object.entries(dom).slice(0, 6).map(([k, v]) => `<div class="dtile">${ic(DOM[k].icon)}<span class="dn">${DOM[k].name}</span><b class="num">${v == null ? '--' : fmtG(pctToG(v))}</b>${k === 'activity' ? stepsLine(pid, st) : ''}</div>`).join('');
    return `<div class="ph-head"><div class="hd"><h1>${greetWord()}, ${esc(first)}</h1><p>${longDate(TODAY)}</p></div></div>
      <div class="petscene" id="petbox"><button type="button" class="pill info moodchip" id="pipheart" aria-label="Show Pip some love">${ic('heart', 'sm')}<span>Pip</span></button><button type="button" class="btn sm hi" id="hi">${ic('hand-heart', 'sm')}<span>Say hi</span></button>${sceneSVG({ w: 390, h: 292, mood: 'content', seed: 3, petScale: .95, label: 'Pip the pet on a hill' })}</div>
      <p class="petline" id="petline" aria-live="polite">${esc(PET_LINES.content[0])}</p>
      <div class="pad stack">
        <section class="pcard scorecard" aria-label="Today's lifestyle score">
          <span class="sc-info">${infoBtn('Today’s lifestyle score', ['The score runs from 0 to 100. The green zone is 70 to 100.', 'It counts how many of the day’s lifestyle questions earned points. It is not a mood or health score.', 'So far today: the day is not finished. Questions not answered yet count as zero, so the score can still change until the day ends.', 'Each domain has its own score on the same scale. Physical Activity comes from your answers, not from counting steps.'])}</span>
          <p class="sc-label">Today’s lifestyle score</p>
          <b class="sc-num num" aria-label="${g == null ? 'No score yet' : fmtG(g) + ' on a scale of 0 to 100'}">${g == null ? '—' : fmtG(g)}</b>
          <p class="sc-scale">Scale: 0 to 100</p>
          <p class="sc-sub">${g == null ? 'Appears after your first check-in' : `${row.prov ? 'So far today · ' : ''}${esc(zoneLine(pid))}`}</p>
          ${tiles ? `<div class="dtiles" id="dtiles">${tiles}</div><button type="button" class="dmore" id="dmore" aria-expanded="false" aria-controls="dtiles"><span>More domains</span>${ic('chevron-down', 'sm')}</button>` : ''}
          <div class="sharedline">${ic('lock', 'sm')}<span>Your practitioner can view this score.</span></div></section>
        <section class="ckline" aria-label="Check-ins"><div class="ckl-head"><h2>${head}</h2>${both ? `<span class="ckl-done" role="img" aria-label="Both check-ins complete">${ic('circle-check')}</span>` : ''}</div>
          <a class="btn primary lg block ck-go" id="ckgo" href="#/patient/checkin${pq(pid, 'when=' + suggest)}"><span class="lbl"><span class="clip">${ic('clipboard-check')}</span><span>${cp.button}</span><span class="go-arrow">${ic('arrow-right')}</span></span></a>
          <a class="btn lg block" id="ckquick" href="#/patient/checkin${pq(pid, 'when=' + suggest + '&quick=1')}"><span class="lbl">${ic('zap')}<span>Quick check-in</span></span></a></section>
      </div>`;
  };
  return {
    // "html" draws the screen; "mount" turns on its buttons
    html: phoneStage(pid, 'today', draw(), NOTES_HOME(pid)),
    mount(root) {
      bindInfo(root);
      const body = $('#pbody', root);
      const redraw = () => { body.innerHTML = draw(); };
      loadSteps(pid).then(redraw).catch(() => { /* no step line when the server does not answer */ });
      // Show more or fewer area tiles
      on(root, 'click', '#dmore', (e, b) => { const t = $('#dtiles', root), open = t.classList.toggle('open'); b.setAttribute('aria-expanded', String(open)); b.querySelector('span').textContent = open ? 'Fewer domains' : 'More domains'; });
      // The pet chip: when pressed, the heart turns red and hearts fly out, float over the pet, then gather on its chest and fade away
      /* the pet chip: the heart fills red, a burst of hearts pops out of it, floats over the pet, then they all fly into its chest, rest there for a moment and vanish. the pet hops and smiles */
      // Timers so a new press restarts the effect
      let joyTimer = null, redTimer = null;
      // Runs when the heart chip is pressed
      on(root, 'click', '#pipheart', (e, chip) => {
        const scene = $('#petbox', root), pet = $('.pet', scene); if (!scene || !pet) return;
        const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        chip.classList.add('loved'); clearTimeout(redTimer); redTimer = setTimeout(() => chip.classList.remove('loved'), calm ? 1500 : 4600);
        pet.classList.add('joy'); pet.classList.remove('joyhop'); void pet.getBoundingClientRect(); if (!calm) pet.classList.add('joyhop');
        clearTimeout(joyTimer); joyTimer = setTimeout(() => pet.classList.remove('joy', 'joyhop'), calm ? 1500 : 4600);
        if (calm) return;
        const sr = scene.getBoundingClientRect(), cr = $('.ic', chip).getBoundingClientRect(), br = ($('ellipse.pbelly[cy="152"]', pet) || pet).getBoundingClientRect(), pr = pet.getBoundingClientRect();
        const S = 14, bx = cr.left - sr.left + cr.width / 2 - S / 2, by = cr.top - sr.top + cr.height / 2 - S / 2;       /* the chip's heart */
        const cx = br.left - sr.left + br.width * .8 - S / 2, cy = br.top - sr.top + br.height * .16 - S / 2;               /* the pet's chest */
        const px = pr.left - sr.left + pr.width / 2 - S / 2, py = pr.top - sr.top;
        const n = 5 + Math.floor(Math.random() * 3), R = (a, b) => a + Math.random() * (b - a);
        for (let i = 0; i < n; i++) {
          const h = document.createElement('span'); h.className = 'flyheart'; h.setAttribute('aria-hidden', 'true'); h.innerHTML = ic('heart', 'sm'); scene.appendChild(h);
          const pop = [bx + R(14, 64), by + R(18, 56)], a = [px + R(-62, 62), py + R(10, 60)], b2 = [px + R(-54, 54), py + R(50, 120)], c2 = [px + R(-40, 40), py + R(30, 100)];
          const T = x => `translate(${x[0].toFixed(1)}px,${x[1].toFixed(1)}px)`, K = (x, extra = '') => ({ transform: T(x) + extra });
          const kf = [{ ...K([bx, by], ' scale(.4)'), opacity: 0 }, { ...K(pop, ' scale(1.15) rotate(' + R(-25, 25) + 'deg)'), opacity: 1, offset: .12 }, K(a, ' scale(1)', ), K(b2, ' rotate(' + R(-18, 18) + 'deg)'), K(c2), { ...K([cx, cy], ' scale(1)'), opacity: 1, offset: .8 }, { ...K([cx, cy], ' scale(1.25)'), opacity: 1, offset: .92 }, { ...K([cx, cy], ' scale(.2)'), opacity: 0 }];
          const anim = h.animate(kf, { duration: 4400, delay: i * 35, easing: 'ease-in-out', fill: 'both' });
          anim.onfinish = () => h.remove();
        }
      });
      // The "Say hi" button makes the pet hop twice and shows a message
      on(root, 'click', '#hi', () => { const pet = $('.pet', root); pet.classList.remove('boop'); void document.body.offsetWidth; pet.classList.add('boop'); toast('Pip says hi'); });
    }
  };
}, 'p-home');
