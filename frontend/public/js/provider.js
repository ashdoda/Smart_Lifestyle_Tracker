// WHAT THIS FILE DOES
// The practitioner screens: the shared top bar, the patient list (search, filters, sorting, resizable columns) and the
// Add patient form. It also holds the on/off switches for each area, which are used on the patient list and on the
// one-patient page. Every change is sent to the server and the list is reloaded from it.
/* ===== Provider: shell, roster (live search, card switches), add patient. Every action here is a server route. ===== */
// Turns a date into text like 2026-11-08
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Counts the patients (total and how many checked in today)
const patientStats = () => ({ n: PATIENTS.length, today: PATIENTS.filter(p => p.checkedToday).length, attn: PATIENTS.filter(p => p.status === 'attention').length });

// The frame around every practitioner page: top bar with the name and Sign out
function providerShell(inner, { fit = false } = {}) {
  return `<div class="pshell"><header class="ptop">
      <a class="brandmark" href="#/provider" aria-label="Lifestyle Tracker, patient list">${LOGO}<span>Lifestyle Tracker</span></a>
      <span class="pill info">${ic('user')} Provider view</span><div class="grow"></div>
      <div class="who"><span class="avatar" data-tone="3" aria-hidden="true">${esc(initials(provName()))}</span><div><b>${esc(provName())}</b><small>${esc(HK.config.providerEmail)}</small></div></div>
      <button class="btn sm" type="button" data-signout>${ic('log-out')}<span>Sign out</span></button>
    </header><main class="pmain ${fit ? 'fit' : ''}">${inner}</main></div>`;
}
// Shown when there is no patient to display
function noPatientView(id) {
  if (id !== 'none') { go('/provider'); return null; }
  return { html: providerShell(`<div class="card" style="max-width:560px"><h2>No patient selected</h2><p class="ink2" style="margin:8px 0 16px">There are no patients yet. Add one from the patient list, then open this screen again.</p><a class="btn primary" href="#/provider/add">Add a patient</a> <a class="btn" href="#/provider">Patient list</a></div>`), mount(root) { mountShell(root); } };
}
// Makes the Sign out button work
function mountShell(root) { on(root, 'click', '[data-signout]', () => { session.role = null; go('/login'); }); }

// Draws the tiny score line shown in each list row
function spark(vals, w = 92, h = 28) {
  /* fixed scale (the server's graph range) so every row is comparable; the faint dashed line is the green-zone start */
  const v = vals.filter(x => x != null); if (v.length < 2) return '';
  const lo = HK.config.graphMin ?? -10, hi = HK.config.graphMax ?? 10, gz = HK.config.greenGraph ?? 4;
  const Y = y => h - 4 - ((Math.max(lo, Math.min(hi, y)) - lo) / (hi - lo)) * (h - 8);
  const pts = vals.map((y, i) => y == null ? null : [(i / (vals.length - 1)) * (w - 8) + 4, Y(y)]);
  let d = '', pen = false; pts.forEach(p => { if (!p) { pen = false; return; } d += (pen ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); pen = true; });
  const e = pts.filter(Boolean).pop();
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><line x1="0" x2="${w}" y1="${Y(gz).toFixed(1)}" y2="${Y(gz).toFixed(1)}" stroke="var(--good)" stroke-opacity=".45" stroke-dasharray="3 3"/><path d="${d}" fill="none" stroke="var(--chart)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${e[0].toFixed(1)}" cy="${e[1].toFixed(1)}" r="3.5" fill="var(--chart)" stroke="var(--surface)" stroke-width="2"/></svg>`;
}
// Builds the small up / down / steady marker
function deltaHTML(d, unit = '', title = 'Change in lifestyle score points', when = '') {
  if (d == null) return '';
  const r = Math.round(d * 10) / 10, cls = r > .2 ? 'up' : r < -.2 ? 'down' : 'flat';
  const icon = cls === 'up' ? 'trending-up' : cls === 'down' ? 'trending-down' : 'minus';
  const word = cls === 'up' ? 'up' : cls === 'down' ? 'down' : 'steady';
  return `<span class="delta ${cls}" title="${esc(title)}">${ic(icon, 'sm')}<span>${cls === 'flat' ? 'Steady' : Math.abs(r).toFixed(1) + unit}</span><span class="sr"> ${word}${when ? ' ' + when : ''}</span></span>`;
}
// Highlights the part of a name that matches what was typed in search
function hl(name, q) {
  if (!q) return esc(name);
  const i = name.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 ? esc(name) : esc(name.slice(0, i)) + '<mark>' + esc(name.slice(i, i + q.length)) + '</mark>' + esc(name.slice(i + q.length));
}

// The on/off switches for each area. They are shared by the patient page and the Domains pop-up
/* ===== Card switches: one component for the patient page and the roster dialog =====
   GET /patients/{id} reads the latest settings, PUT /admin/patients/{id}/domains saves the FULL set of optional domains,
   GET /questions (already loaded) gives each card's real question list. Saves run one at a time. ===== */
// Saves happen one after another so they do not collide
let domainQueue = Promise.resolve();
// The questions that belong to one area
const questionsOfCard = id => (HK.data.questions || []).filter(q => q.domain === window.HKL.CARD_TO_DOMAIN[id]).sort((a, b) => a.order - b.order);
// Builds the list of morning and evening questions for one area
function questionsHTML(id) {
  const list = questionsOfCard(id);
  const grp = (per, name) => { const qs = list.filter(q => q.period === per); return qs.length ? `<h4>${name}</h4><ol>${qs.map(q => `<li>${esc(q.text)}${q.show_if ? ' <small class="muted">Follow-up</small>' : ''}</li>`).join('')}</ol>` : ''; };
  return grp('morning', 'Morning') + grp('evening', 'Evening') || '<p class="muted">No questions.</p>';
}
// Builds one row of the area list: icon, name, optional score, On/Off switch and a Questions link
/* one row: icon, full name, optional summary, On/Off switch, and a separate Questions disclosure */
// Builds that row
function domainRowHTML(p, d, on, summary) {
  const first = p.name.split(' ')[0], n = per => questionsOfCard(d.id).filter(q => q.period === per).length;
  const key = `dq-${p.id}-${d.id}`;
  return `<div class="drow ${on ? 'on' : ''}" data-d="${d.id}"><span class="dic">${ic(on ? d.icon : 'lock')}</span>
    <div class="dm"><b class="dn">${esc(d.name)}</b>${summary === undefined ? `<small class="muted">${n('morning')} morning, ${n('evening')} evening</small>` : summary}</div>
    <div class="dsw"><span class="dst" data-state>${on ? 'On' : 'Off'}</span><button type="button" class="switch" role="switch" data-card="${d.id}" aria-checked="${on}" aria-label="${esc(d.name)} for ${esc(first)}"></button></div>
    <p class="drow-err msg" role="alert" hidden></p>
    <button type="button" class="dq" data-q="${d.id}" aria-expanded="false" aria-controls="${key}">Questions ${ic('chevron-down', 'sm')}</button>
    <div class="dqbody" id="${key}" hidden>${questionsHTML(d.id)}</div></div>`;
}
// Makes the switches work: ask the server, save the change, then update the row (or show an error)
/* Wires the switches and disclosures inside `box`. opts.summary(p, d) gives the score summary shown while a card is on;
   opts.saved(id, isOn) runs after a save has succeeded and the patient's data has been read again. */
// Turns on the switches and the Questions links in a box
function mountDomainControls(box, p0, opts = {}) {
  const H = window.HKL, srv = p0.backend.patientId, first = p0.name.split(' ')[0], live = $('.dlive', box) || box;
  const setRow = (row, on) => {
    const id = row.dataset.d, d = DOM[id], sw = $('[data-card]', row);
    sw.setAttribute('aria-checked', String(on)); row.classList.toggle('on', on); $('[data-state]', row).textContent = on ? 'On' : 'Off'; $('.dic', row).innerHTML = ic(on ? d.icon : 'lock');
    const m = $('.dm', row); const sm = opts.summary ? opts.summary(PAT[p0.id] || p0, d, on) : null; if (sm != null) { const old = m.querySelector('.dsum'); old && old.remove(); m.insertAdjacentHTML('beforeend', sm); }
  };
  const busy = (row, b) => { const sw = $('[data-card]', row); sw.disabled = b; row.classList.toggle('busy', b); row.setAttribute('aria-busy', String(b)); if (b) $('[data-state]', row).textContent = 'Saving…'; };
  const err = (row, m) => { const e = $('.drow-err', row); e.hidden = !m; e.textContent = m || ''; };
  on(box, 'click', '[data-q]', (e, b) => {            /* opening the questions never touches the card setting */
    const open = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', String(open));
    const body = document.getElementById(b.getAttribute('aria-controls')); body.hidden = !open;
  });
  on(box, 'click', '[data-card]', (e, sw) => {
    if (sw.disabled) return;
    const row = sw.closest('.drow'), id = sw.dataset.card, want = sw.getAttribute('aria-checked') !== 'true', was = !want;
    busy(row, true); err(row, '');
    domainQueue = domainQueue.then(async () => {
      try {
        const cur = H.cardsOf((await H.getPatient(srv)).domains);              /* the latest saved set, so other domains are kept */
        if (cur.includes(id) !== want) await H.setDomains(srv, want ? [...cur, id] : cur.filter(x => x !== id));
        await H.refreshPatient(srv);
        busy(row, false); setRow(row, want); live.textContent = `${DOM[id].name} turned ${want ? 'on' : 'off'} for ${first}.`;
        opts.saved && opts.saved(id, want);
      } catch (ex) {
        let now = was;
        try { now = H.cardsOf((await H.getPatient(srv)).domains).includes(id); } catch (e2) { /* keep the old state */ }
        busy(row, false); setRow(row, now); err(row, /Cannot reach/.test(ex.message || '') ? 'Could not save. Check the connection and try again.' : (ex.message || 'Could not save. Try again.'));
      }
    });
  });
}
// The Domains pop-up opened from the patient list
/* roster: Cards button opens this dialog. Switches save at once; Done closes it. */
// Builds that pop-up
function cardsDialog(p, after) {
  const H = window.HKL, srv = p.backend.patientId, first = p.name.split(' ')[0];
  openDialog(`<div class="cards-dlg"><div class="cd-head row between"><h2>Domains for ${esc(p.name)}</h2>${infoBtn('Domains', ['Each switch saves right away. The General domain is always on.', 'A change starts today. Earlier days keep the domains they had.'])}</div>
    <div class="cd-body" id="cdbody"><p class="muted">Loading…</p><span class="sr dlive" aria-live="polite"></span></div>
    <div class="cd-foot"><button type="button" class="btn primary" data-close>Done</button></div></div>`,
  { label: 'Domains for ' + p.name, wide: true, cls: 'dlg-cards', onMount(dlg) {
    const body = $('#cdbody', dlg); bindInfo(dlg);
    H.getPatient(srv).then(r => {
      const onSet = H.cardsOf(r.domains);
      body.innerHTML = `<div class="dlist">${DOMAINS.map(d => domainRowHTML(p, d, onSet.includes(d.id))).join('')}</div><span class="sr dlive" aria-live="polite"></span>`;
      mountDomainControls(body, p, { saved: () => after && after() });
    }).catch(e => { body.innerHTML = `<p class="msg" role="alert">${esc(e.message || 'Could not load this patient.')}</p>`; });
  } });
}

// The order used to sort patients by how much attention they need
const RANK = { attention: 0, watch: 1, new: 2, good: 3 };
// The text explaining the arrow next to a score
const ROSTER_DELTA = 'Latest finished day. The arrow compares the average of the last 7 finished days with the average of the up to 21 finished days before them, in score points.';

// The patient list page
route(/^\/provider$/, () => {
  // What the list remembers: the search text, the filter and the sort
  const st = { q: '', filter: 'all', sort: store.get('sort', 'attn') };
  const s = patientStats();
  // The filter buttons (All, Needs attention, and so on)
  const FILTERS = [['all', 'All', 'n'], ['attn', 'Needs attention', 'attn'], ['today', 'Checked in today', 'today']];
  // Builds the page: title, counts, search box, filters, column headings and the rows area
  const html = providerShell(`
    <div class="phead-row"><div><h1 style="font-size:var(--t-2xl)">Patients</h1><p class="num" id="sub">${s.n} patients</p></div>
      <div class="right"><div class="kpis"><div class="kpi"><b class="num" id="k1">${s.today}</b><span>checked in today</span></div><div class="kpi"><b class="num" id="k2">${s.attn}</b><span>need attention</span></div></div>
      <div class="row wrap" style="gap:var(--s2)"><a class="btn primary" href="#/provider/add">${ic('user-plus')}<span>Add patient</span></a></div></div></div>
    <section class="plist" aria-label="Patient list">
      <div class="psearch prow-grid"><span class="gut">${ic('search')}</span>
        <div class="qwrap"><input class="line" id="q" type="search" placeholder="Search patients by name" aria-label="Search patients by name" autocomplete="off" spellcheck="false">
        <button type="button" class="clear hide" id="qclear" aria-label="Clear search">${ic('x', 'sm')}</button></div></div>
      <div class="pfilters" role="group" aria-label="Filter patients">
        ${FILTERS.map(([k, l, c], i) => `<button type="button" class="chip sm" data-f="${k}" aria-pressed="${i === 0}">${l} <span class="num" data-c="${c}">${s[c]}</span></button>`).join('')}
        <label class="sortwrap"><span>Sort by</span><select class="select sm" id="sort" aria-label="Sort patients"><option value="attn">Needs attention first</option><option value="name">Name, A to Z</option><option value="last">Latest check-in</option><option value="score">Score, low to high</option><option value="scoreHi">Score, high to low</option></select></label></div>
      <div class="pscroll" id="pscroll" tabindex="0" aria-label="Patients, scrollable list">
        <div class="phead prow-grid"><span></span><span>Name</span><span>Status</span><span title="${esc(ROSTER_DELTA)}">Last full day</span><span class="c-spark">Last 2 weeks</span><span>Last check-in</span><span>Domains</span><span></span></div>
        <ul class="plist-ul" id="rows"></ul></div>
      <div class="pfoot" id="pfoot" aria-live="polite"></div>
      <button type="button" class="lgrip" id="lgrip" aria-label="Make the list taller or shorter. Drag, or use the up and down arrow keys." title="Drag to make the list taller or shorter. Double-click to reset."><span></span></button>
    </section>`);
  // Used to clean up listeners when the page is left
  let offWin = null;
  return {
    cleanup() { offWin && offWin(); },
    // "html" is the page; "mount" turns on search, filters, sorting and the resize handles
    html, mount(root) {
      mountShell(root);
      const rows = $('#rows', root), q = $('#q', root);
      $('#sort', root).value = st.sort;
      // Lets the list be made taller or shorter by dragging the bar under it
      /* list height: fills the screen by default; drag the bar underneath to show more patients. Width never changes. */
      const box = $('.plist', root), lgrip = $('#lgrip', root), MINH = 300; let lh = store.get('listH2', null), ld = null;
      const avail = () => { const sc = $('#pscroll', root), r = $('.prow', root), rh = r ? r.getBoundingClientRect().height : 72, chrome = box.offsetHeight - sc.clientHeight; return Math.max(MINH, window.innerHeight - box.getBoundingClientRect().top - 32, chrome + 25 * rh); }; /* default: room for 25 patients, taller if the screen is */
      const applyH = () => { box.style.height = Math.round(clamp(lh ?? avail(), MINH, 5000)) + 'px'; };
      applyH(); const onWin = () => { if (lh == null) applyH(); }; window.addEventListener('resize', onWin); offWin = () => window.removeEventListener('resize', onWin);
      const saveH = () => store.set('listH2', lh == null ? null : Math.round(lh));
      lgrip.addEventListener('pointerdown', e => { e.preventDefault(); lgrip.setPointerCapture(e.pointerId); ld = { y: e.clientY, h: box.getBoundingClientRect().height }; box.classList.add('resizing'); });
      lgrip.addEventListener('pointermove', e => { if (!ld) return; lh = ld.h + e.clientY - ld.y; applyH(); });
      const endL = () => { if (ld) { ld = null; box.classList.remove('resizing'); lh = box.getBoundingClientRect().height; saveH(); } };
      lgrip.addEventListener('pointerup', endL); lgrip.addEventListener('pointercancel', endL);
      lgrip.addEventListener('dblclick', () => { lh = null; saveH(); applyH(); toast('List size reset'); });
      lgrip.addEventListener('keydown', e => { const dy = { ArrowDown: 48, ArrowUp: -48 }[e.key]; if (!dy) return; e.preventDefault(); lh = box.getBoundingClientRect().height + dy; applyH(); saveH(); });
      // Lets each column be made wider or narrower by dragging the grey bars in the headings
      /* resizable columns: a short grey bar on each column edge. Drag it (or use the left and right arrow keys) to trade width between the two columns beside it.
         Domains stays last. Widths last for this visit only and are never saved. */
      const head = $('.phead', root), MINW = { 1: 130, 2: 120, 3: 110, 4: 80, 5: 120, 6: 96 }, NAMES = { 1: 'Name', 2: 'Status', 3: 'Last full day', 4: 'Last 2 weeks', 5: 'Last check-in' }, wideMq = window.matchMedia('(min-width:1181px)');
      let fr = null, dflt = null, cd = null;
      const cols = () => getComputedStyle(head).gridTemplateColumns.split(' ').map(parseFloat);
      const paintCols = () => { if (!fr) return; box.style.setProperty('--rcols', `56px ${[1, 2, 3, 4, 5, 6].map(i => `minmax(${MINW[i]}px,${fr[i].toFixed(1)}fr)`).join(' ')} 44px`); box.classList.add('rz'); };
      const initCols = () => {
        if (!wideMq.matches) { box.style.removeProperty('--rcols'); box.classList.remove('rz'); fr = null; return; }
        box.style.removeProperty('--rcols'); box.classList.remove('rz');
        const m = cols(); if (m.length < 8 || m.some(isNaN)) return;
        fr = { }; for (let i = 1; i <= 6; i++) fr[i] = m[i];
        const shift = Math.min(window.innerWidth >= 1300 ? 96 : 48, fr[1] - MINW[1]);   /* Status starts a little further left by default */
        fr[1] -= shift; fr[2] += shift; dflt = { ...fr }; paintCols();
      };
      const move = (i, dx) => { const d = clamp(dx, MINW[i] - cd.s[i], cd.s[i + 1] - MINW[i + 1]); fr[i] = cd.s[i] + d; fr[i + 1] = cd.s[i + 1] - d; paintCols(); };   /* stops at each column's minimum width */
      [1, 2, 3, 4, 5].forEach(i => { const cell = head.children[i + 0]; if (!cell) return; cell.classList.add('rzc'); cell.insertAdjacentHTML('beforeend', `<i class="rzh" role="separator" aria-orientation="vertical" tabindex="0" data-i="${i}" aria-label="Resize the ${NAMES[i]} column. Drag, or use the left and right arrow keys. Double-click to reset." title="Drag to resize. Double-click to reset."></i>`); });
      head.addEventListener('pointerdown', e => { const h = e.target.closest('.rzh'); if (!h || !fr) return; e.preventDefault(); h.setPointerCapture(e.pointerId); const m = cols(); fr = { }; for (let i = 1; i <= 6; i++) fr[i] = m[i]; cd = { i: +h.dataset.i, x: e.clientX, s: { ...fr } }; h.classList.add('on'); });
      head.addEventListener('pointermove', e => { if (cd) move(cd.i, e.clientX - cd.x); });
      const endC = e => { if (!cd) return; const h = e.target.closest && e.target.closest('.rzh'); h && h.classList.remove('on'); $$('.rzh.on', head).forEach(x => x.classList.remove('on')); cd = null; };
      head.addEventListener('pointerup', endC); head.addEventListener('pointercancel', endC);
      head.addEventListener('dblclick', e => { if (!e.target.closest('.rzh') || !dflt) return; fr = { ...dflt }; paintCols(); });
      head.addEventListener('keydown', e => { const h = e.target.closest('.rzh'); if (!h || !fr) return; const dx = { ArrowRight: 16, ArrowLeft: -16 }[e.key]; if (!dx) return; e.preventDefault(); const m = cols(); fr = { }; for (let i = 1; i <= 6; i++) fr[i] = m[i]; cd = { i: +h.dataset.i, x: 0, s: { ...fr } }; move(cd.i, dx); cd = null; });
      wideMq.addEventListener('change', initCols); initCols();
      const offPrev = offWin; offWin = () => { offPrev && offPrev(); wideMq.removeEventListener('change', initCols); };
      // Builds the HTML for one patient row
      const rowHTML = p => {
        const pill = statusPill(p);
        const sc = p.today == null ? '<span class="muted">No score</span>' : `<b class="num">${fmtG(p.todayG)}</b>${deltaHTML(p.delta7, ' pts', ROSTER_DELTA, 'compared with the earlier finished days')}<small class="muted lfd">${fmtD(p.lastDate)}</small>`;
        return `<li class="prow prow-grid" data-id="${p.id}">
          <span class="avatar gutav" data-tone="${hashStr(p.id) % 4}" aria-hidden="true">${initials(p.name)}</span>
          <div class="who">
            <div class="nm"><a class="rowlink" href="#/provider/patient/${p.id}"><b>${hl(p.name, st.q)}</b></a>
              <div class="only-sm">${pill}<span class="c-score">${sc}</span></div></div></div>
          <div class="c-status">${pill}</div>
          <div class="c-score">${sc}</div>
          <div class="c-spark" title="Last 14 days, history only">${spark(p.series.slice(-14).map(x => x.g))}</div>
          <div class="c-last"><span>${esc(p.lastCheckin)}</span></div>
          <div class="c-cards"><button type="button" class="btn sm invbtn" data-cards="${p.id}" aria-label="Domains for ${esc(p.name)}">${ic('sliders-horizontal', 'sm')}<span>Domains</span></button></div>
          <span class="chev" aria-hidden="true">${ic('chevron-right')}</span></li>`;
      };
      // Applies the search, filter and sort, then draws the rows and the counts
      const view = () => {
        const q0 = st.q.trim().toLowerCase();
        const pass = p => st.filter === 'all' || (st.filter === 'attn' && p.status === 'attention') || (st.filter === 'today' && p.checkedToday);
        let list = PATIENTS.filter(p => pass(p) && (!q0 || p.name.toLowerCase().includes(q0)));
        const rel = p => { const n = p.name.toLowerCase(); return n.startsWith(q0) ? 0 : n.split(' ').some(w => w.startsWith(q0)) ? 1 : 2; };
        const byName = (a, b) => a.name.localeCompare(b.name);
        if (q0) list.sort((a, b) => rel(a) - rel(b) || byName(a, b));
        else if (st.sort === 'name') list.sort(byName);
        else if (st.sort === 'last') list.sort((a, b) => a.daysSince - b.daysSince || byName(a, b));
        else if (st.sort === 'score') list.sort((a, b) => (a.todayG ?? 999) - (b.todayG ?? 999));
        else if (st.sort === 'scoreHi') list.sort((a, b) => (b.todayG ?? -999) - (a.todayG ?? -999) || byName(a, b));
        else list.sort((a, b) => RANK[a.status] - RANK[b.status] || byName(a, b));
        if (!list.length) {
          rows.innerHTML = `<li class="empty">${ic('search', 'lg')}<b>${st.q.trim() ? `No patients match “${esc(st.q.trim())}”` : 'No patients here yet'}</b><span>${st.q.trim() ? (st.filter === 'all' ? 'Check the spelling or clear the search.' : 'Try the All filter or clear the search.') : 'Try another filter.'}</span>${st.q.trim() ? '<button type="button" class="btn sm" id="clr2">Clear search</button>' : ''}</li>`;
        } else rows.innerHTML = list.map(rowHTML).join('');
        $('#pfoot', root).textContent = `Showing ${list.length} of ${PATIENTS.length} patients`;
        $('#qclear', root).classList.toggle('hide', !st.q);
        const t = patientStats(); $$('[data-c]', root).forEach(e => { e.textContent = t[e.dataset.c]; });
        $('#sub', root).textContent = `${t.n} patients`; $('#k1', root).textContent = t.today; $('#k2', root).textContent = t.attn;
      };
      view(); if (lh == null) applyH();
      // Search as you type
      q.addEventListener('input', () => { st.q = q.value; $('#pscroll', root).scrollTop = 0; view(); });
      // Clears the search box
      const clear = () => { st.q = ''; q.value = ''; view(); q.focus(); };
      on(root, 'click', '#qclear', clear); on(root, 'click', '#clr2', clear);
      // Filter buttons
      on(root, 'click', '[data-f]', (e, b) => { st.filter = b.dataset.f; $$('[data-f]', root).forEach(x => x.setAttribute('aria-pressed', String(x === b))); $('#pscroll', root).scrollTop = 0; view(); });
      // Sort menu
      $('#sort', root).addEventListener('change', e => { st.sort = e.target.value; store.set('sort', st.sort); view(); });
      // Opens the Domains pop-up for a patient
      on(root, 'click', '[data-cards]', (e, b) => cardsDialog(PAT[b.dataset.cards], view));
      q.addEventListener('keydown', e => { if (e.key === 'Escape' && st.q) clear(); if (e.key === 'Enter') { const a = $('.rowlink', rows); a && go(a.getAttribute('href').slice(1)); } });
    }
  };
}, 'providers');

// The Add patient page
/* ----- add a patient: POST /patients (first name, last name, preferred name, start date, optional domains) ----- */
// Builds the Add patient form
route(/^\/provider\/add$/, () => {
  const html = providerShell(`<div><a class="link" href="#/provider">${ic('arrow-left', 'sm')} Back to patients</a></div>
    <div><h1 style="font-size:var(--t-2xl)">Add patient</h1><p class="ink2" style="margin-top:6px;max-width:64ch">The General domain is always on. Choose any optional domains to start with.</p></div>
    <div class="add-grid">
      <div class="card"><h2 class="sh">New patient</h2>
        <form id="addform" novalidate class="col" style="gap:var(--s4)">
          ${fieldHTML('afirst', 'First name', { ph: 'Jamie', ac: 'off' })}
          ${fieldHTML('alast', 'Last name', { ph: 'Rivera', ac: 'off' })}
          ${fieldHTML('apref', 'Preferred name (optional)', { ph: 'Jay', ac: 'off', hint: 'Leave empty to use the first name.' })}
          ${fieldHTML('astart', 'Start date', { type: 'date', value: iso(TODAY), hint: 'Leave as today unless the patient started earlier.' })}
          <div class="field"><span class="label" id="cardlbl">Optional domains to start with</span>
            <div class="col" style="gap:var(--s2)" role="group" aria-labelledby="cardlbl">${DOMAINS.map(d => `<label class="opt optchk"><span class="t">${esc(d.name)}</span><input type="checkbox" class="chk" data-card="${d.id}"></label>`).join('')}</div></div>
          <div class="msg" id="aerr" role="alert" style="display:none"></div>
          <button class="btn primary lg block" type="submit" id="asubmit">Add patient</button></form>
        <div class="success-card hide" id="asuccess" aria-live="polite"></div></div></div>`);
  return {
    html, mount(root) {
      mountShell(root);
      const H = window.HKL, aerr = $('#aerr', root);
      // The checks for each field (first and last name must not be empty)
      const val = { afirst: v => v.trim() ? '' : 'Enter the first name.', alast: v => v.trim() ? '' : 'Enter the last name.', astart: v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? '' : 'Choose a start date.' };
      Object.keys(val).forEach(id => { const el = $('#' + id, root); el.addEventListener('blur', () => setErr(root, id, val[id](el.value))); el.addEventListener('input', () => { if ($('#f-' + id, root).classList.contains('err') && !val[id](el.value)) setErr(root, id, ''); }); });
      // When the form is sent: check the fields, send them to the server, then show a success message
      $('#addform', root).addEventListener('submit', async e => {
        e.preventDefault(); aerr.style.display = 'none'; let bad = false;
        for (const id of Object.keys(val)) { const m = val[id]($('#' + id, root).value); setErr(root, id, m); bad = bad || !!m; }
        if (bad) { $('.field.err input', root).focus(); return; }
        // The optional areas that were ticked
        const cards = $$('input[data-card]:checked', root).map(x => H.CARD_TO_DOMAIN[x.dataset.card]);
        const btn = $('#asubmit', root); btn.disabled = true;
        try {
          // Sends the new patient to the server and loads them into the list
          const made = await H.createPatient({ first_name: $('#afirst', root).value.trim(), last_name: $('#alast', root).value.trim(), preferred_name: $('#apref', root).value.trim() || null, enrolled_on: $('#astart', root).value, domains: cards });
          const rec = await H.refreshPatient(made.patient_id);
          $('#addform', root).classList.add('hide'); const sx = $('#asuccess', root); sx.classList.remove('hide');
          sx.innerHTML = `<div class="notice">${ic('circle-check')}<span>${esc(rec.name)} was added.</span></div>
            <a class="btn primary lg block" href="#/provider/patient/${rec.id}">Open ${esc(rec.name.split(' ')[0])}’s page</a><button type="button" class="btn block" id="another">Add another patient</button><a class="link" style="align-self:center" href="#/provider">Back to patient list</a>`;
          on(sx, 'click', '#another', () => { sx.classList.add('hide'); $('#addform', root).classList.remove('hide'); $('#addform', root).reset(); $$('input[data-card]', root).forEach(x => { x.checked = false; }); $('#astart', root).value = iso(TODAY); btn.disabled = false; $('#afirst', root).focus(); });
          toast('Patient added');
        } catch (ex) {
          btn.disabled = false; aerr.style.display = 'block';
          const f = ex.fields && Object.keys(ex.fields).length ? ' ' + Object.values(ex.fields).join(' ') : '';
          aerr.textContent = (ex.message || 'Could not add the patient.') + f;
        }
      });
    }
  };
}, 'providers');
