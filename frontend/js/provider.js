/* ===== Provider: shell, roster (own scroll box, live search), invites, add + import patients ===== */
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function addPatient({ name, email, length = 'standard', state = 'none' }) {
  const id = 'p' + String(PATIENTS.length + 1).padStart(2, '0');
  const p = { id, name, email, start: iso(TODAY), fav: false, unlocked: ['activity', 'diet', 'mind', 'sleep', 'social'], lengthChosen: length, lengthNow: length, age: null, pronouns: '', goal: 'Goal to be set at the first visit', state, invitedOn: null };
  p.series = [{ d: TODAY, score: null, raw: null }];
  applyState(p);
  PATIENTS.push(p); PAT[id] = p;
  return p;
}
function createPatient(info) { const p = addPatient(info); store.set('newPatients', [...store.get('newPatients', []), { name: info.name, email: info.email, length: info.length }]); return p; }
function setEnroll(p, state, on) {
  p.state = state; if (on) p.invitedOn = on; applyState(p);
  const m = store.get('enroll', {}); m[p.id] = { state, on: p.invitedOn }; store.set('enroll', m);
}
function restoreEnrollment() {
  store.get('newPatients', []).forEach(n => addPatient(n));
  Object.entries(store.get('enroll', {})).forEach(([id, v]) => { const p = PAT[id]; if (p) { p.state = v.state; p.invitedOn = v.on; applyState(p); } });
}
const takenEmail = e => PATIENTS.some(p => (p.email || '').toLowerCase() === e.toLowerCase()) || !!accounts()[e.toLowerCase()];
const patientStats = () => ({ n: PATIENTS.length, active: PATIENTS.filter(p => p.state === 'active').length, today: PATIENTS.filter(p => p.state === 'active' && p.daysSince === 0 && p.today != null).length, attn: PATIENTS.filter(p => p.status === 'attention').length, fav: PATIENTS.filter(p => p.fav).length, invited: PATIENTS.filter(p => p.state === 'invited').length, none: PATIENTS.filter(p => p.state === 'none').length });

/* ----- invites: a link by email; the patient sets their own password ----- */
function inviteEmailDialog(p, resend) {
  const first = p.name.split(' ')[0];
  openDialog(`<div class="row between" style="margin-bottom:var(--s3)"><h2>${resend ? 'Invite sent again' : 'Invite sent'}</h2><button class="btn icon sm" data-close aria-label="Close">${ic('x')}</button></div>
    <div class="notice">${ic('circle-check')}<span>${esc(p.name)} will get this email at ${esc(p.email)}.</span></div>
    <div class="email" role="group" aria-label="Preview of the invite email"><div class="eh"><span class="muted">To</span><span>${esc(p.email)}</span></div><div class="eh"><span class="muted">Subject</span><b>${esc(provName())} invited you to Lifestyle Tracker</b></div>
      <div class="eb"><p>Hi ${esc(first)},</p><p>${esc(provName())} set up a space for you to track small daily habits between visits. A check-in takes about a minute, and you choose how much to answer.</p>
      <p><a class="btn primary" href="#/invite/${p.id}" data-close>Set up my account</a></p>
      <p class="muted" style="font-size:var(--t-sm)">This link works once and expires in 7 days. Your answers stay on a private server and are never shared with other companies.</p></div></div>
    <p class="ink2" style="margin:var(--s4) 0;font-size:var(--t-sm)">This is a preview. In the full app the email is sent automatically.</p>
    <div class="row end wrap"><a class="btn" href="#/invite/${p.id}" data-close>${ic('smile')}<span>Open it as the patient</span></a><button class="btn primary" data-close>Done</button></div>`, { label: 'Invite email preview', wide: true });
}
function sendInvite(p, done) { const re = p.state === 'invited'; setEnroll(p, 'invited', fmtD(TODAY)); done && done(); inviteEmailDialog(p, re); }
function bulkInviteDialog(done) {
  const list = PATIENTS.filter(p => p.state === 'none').sort((a, b) => a.name.localeCompare(b.name));
  openDialog(`<div class="row between" style="margin-bottom:var(--s2)"><h2>Send invites</h2><button class="btn icon sm" data-close aria-label="Close">${ic('x')}</button></div>
    <p class="ink2" style="margin-bottom:var(--s4)">Choose who gets an email with a link to set up their account. Only invite the patients you want on the app.</p>
    ${list.length ? `<label class="chkrow selall"><input type="checkbox" id="selall"><span><b>Select all ${list.length}</b></span></label><div class="chklist" id="chklist">${list.map(p => `<label class="chkrow"><input type="checkbox" data-sel="${p.id}"><span><b>${esc(p.name)}</b><small>${esc(p.email)}</small></span></label>`).join('')}</div>
      <div class="row end" style="margin-top:var(--s4)"><button class="btn" data-close>Cancel</button><button class="btn primary" id="sendsel" disabled>Send invites</button></div>` : `<div class="notice">${ic('circle-check')}<span>Everyone on your list has been invited.</span></div><div class="row end" style="margin-top:var(--s4)"><button class="btn primary" data-close>Done</button></div>`}`,
  { label: 'Send invites', wide: true, onMount(dlg, close) {
    const boxes = () => $$('[data-sel]', dlg), upd = () => { const n = boxes().filter(b => b.checked).length; const s = $('#sendsel', dlg); if (s) { s.disabled = !n; s.textContent = n ? `Send ${n} invite${n === 1 ? '' : 's'}` : 'Send invites'; } };
    on(dlg, 'change', '#selall', (e, c) => { boxes().forEach(b => { b.checked = c.checked; }); upd(); });
    on(dlg, 'change', '[data-sel]', () => { $('#selall', dlg).checked = boxes().every(b => b.checked); upd(); });
    on(dlg, 'click', '#sendsel', () => { const ids = boxes().filter(b => b.checked).map(b => b.dataset.sel); ids.forEach(id => setEnroll(PAT[id], 'invited', fmtD(TODAY))); close(); done && done(); toast(`${ids.length} invite${ids.length === 1 ? '' : 's'} sent`); });
  } });
}
function parseRoster(text) {
  const ok = [], bad = [], seen = new Set();
  text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach((l, i) => {
    const parts = l.split(/[,\t;]/).map(x => x.trim().replace(/^"|"$/g, '')); const email = parts.find(x => EMAIL_RE.test(x)), name = parts.find(x => x && x !== email && !EMAIL_RE.test(x));
    if (i === 0 && !email && /email/i.test(l)) return;
    if (!name || !email) { bad.push(`${l.slice(0, 40)} (needs a name and an email)`); return; }
    if (takenEmail(email) || seen.has(email.toLowerCase())) { bad.push(`${email} (already on your list)`); return; }
    seen.add(email.toLowerCase()); ok.push({ name, email });
  });
  return { ok, bad };
}

function providerShell(inner, { fit = false } = {}) {
  return `<div class="pshell"><header class="ptop">
      <a class="brandmark" href="#/provider" aria-label="Lifestyle Tracker, patient list">${LOGO}<span>Lifestyle Tracker</span></a>
      <span class="pill info">${ic('user')} Provider view</span><div class="grow"></div>
      <div class="who"><span class="avatar" data-tone="3" aria-hidden="true">${esc(initials(provName()))}</span><div><b>${esc(provName())}</b><small>${esc(HK.config.providerEmail)}</small></div></div>
      <button class="btn sm" type="button" data-signout>${ic('log-out')}<span>Sign out</span></button>
    </header><main class="pmain ${fit ? 'fit' : ''}">${inner}</main></div>`;
}
function noPatientView(id) {
  if (id !== 'none') { go('/provider'); return null; }
  return { html: providerShell(`<div class="card" style="max-width:560px"><h2>No patient selected</h2><p class="ink2" style="margin:8px 0 16px">There are no patients yet. Add one from the patient list, then open this screen again.</p><a class="btn primary" href="#/provider/add">Add a patient</a> <a class="btn" href="#/provider">Patient list</a></div>`), mount(root) { mountShell(root); } };
}
function mountShell(root) { on(root, 'click', '[data-signout]', () => { session.role = null; go('/login'); }); }

function spark(vals, w = 92, h = 28) {
  const v = vals.filter(x => x != null); if (v.length < 2) return '';
  const mn = Math.min(...v), mx = Math.max(...v), rg = Math.max(8, mx - mn);
  const pts = v.map((y, i) => [(i / (v.length - 1)) * (w - 8) + 4, h - 4 - ((y - mn) / rg) * (h - 8)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  const e = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--chart)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${e[0].toFixed(1)}" cy="${e[1].toFixed(1)}" r="3.5" fill="var(--chart)" stroke="var(--surface)" stroke-width="2"/></svg>`;
}
function deltaHTML(d, unit = '') {
  if (d == null) return '';
  const r = Math.round(d), cls = r > 1 ? 'up' : r < -1 ? 'down' : 'flat';
  const icon = cls === 'up' ? 'trending-up' : cls === 'down' ? 'trending-down' : 'minus';
  const word = cls === 'up' ? 'up' : cls === 'down' ? 'down' : 'steady';
  return `<span class="delta ${cls}" title="Change over the past week">${ic(icon, 'sm')}<span>${cls === 'flat' ? 'Steady' : Math.abs(r) + unit}</span><span class="sr"> ${word} this week</span></span>`;
}
function hl(name, q) {
  if (!q) return esc(name);
  const i = name.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 ? esc(name) : esc(name.slice(0, i)) + '<mark>' + esc(name.slice(i, i + q.length)) + '</mark>' + esc(name.slice(i + q.length));
}
const RANK = { attention: 0, watch: 1, new: 2, good: 3, invited: 4, none: 5 };

route(/^\/provider$/, () => {
  const st = { q: '', filter: 'all', sort: store.get('sort', 'attn') };
  const s = patientStats();
  const FILTERS = [['all', 'All', 'n'], ['fav', 'Favorites', 'fav'], ['attn', 'Needs attention', 'attn'], ['active', 'On the app', 'active'], ['invited', 'Invite sent', 'invited'], ['none', 'Not invited', 'none']];
  const html = providerShell(`
    <div class="phead-row"><div><h1 style="font-size:var(--t-2xl)">Patients</h1><p class="num" id="sub">${s.n} patients, ${s.active} on the app</p></div>
      <div class="right"><div class="kpis"><div class="kpi"><b class="num" id="k1">${s.today}</b><span>checked in today</span></div><div class="kpi"><b class="num" id="k2">${s.attn}</b><span>need attention</span></div><div class="kpi"><b class="num" id="k3">${s.none}</b><span>not invited yet</span></div></div>
      <div class="row wrap" style="gap:var(--s2)"><button type="button" class="btn" id="bulk">${ic('mail')}<span>Send invites</span></button><a class="btn primary" href="#/provider/add">${ic('user-plus')}<span>Add patients</span></a></div></div></div>
    <section class="plist" aria-label="Patient list">
      <div class="psearch prow-grid"><span class="gut">${ic('search')}</span>
        <div class="qwrap"><input class="line" id="q" type="search" placeholder="Search patients by name" aria-label="Search patients by name" autocomplete="off" spellcheck="false">
        <button type="button" class="clear hide" id="qclear" aria-label="Clear search">${ic('x', 'sm')}</button></div></div>
      <div class="pfilters" role="group" aria-label="Filter patients">
        ${FILTERS.map(([k, l, c], i) => `<button type="button" class="chip sm" data-f="${k}" aria-pressed="${i === 0}">${l} <span class="num" data-c="${c}">${s[c]}</span></button>`).join('')}
        <label class="sortwrap"><span>Sort by</span><select class="select sm" id="sort" aria-label="Sort patients"><option value="attn">Needs attention first</option><option value="name">Name, A to Z</option><option value="last">Latest check-in</option><option value="score">Score, low to high</option><option value="scoreHi">Score, high to low</option></select></label></div>
      <div class="pscroll" id="pscroll" tabindex="0" aria-label="Patients, scrollable list">
        <div class="phead prow-grid" aria-hidden="true"><span></span><span>Name</span><span>Status</span><span>Score today</span><span class="c-spark">Last 2 weeks</span><span>Last check-in</span><span></span></div>
        <ul class="plist-ul" id="rows"></ul></div>
      <div class="pfoot" id="pfoot" aria-live="polite"></div>
      <button type="button" class="lgrip" id="lgrip" aria-label="Make the list taller or shorter. Drag, or use the up and down arrow keys." title="Drag to make the list taller or shorter. Double-click to reset."><span></span></button>
    </section>`);
  let offWin = null;
  return {
    cleanup() { offWin && offWin(); },
    html, mount(root) {
      mountShell(root);
      const rows = $('#rows', root), q = $('#q', root);
      $('#sort', root).value = st.sort;
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
      const rowHTML = p => {
        const [lab, cls, icon] = STATUS_LABEL[p.status];
        const pill = `<span class="pill ${cls}">${ic(icon)}${lab}</span>`;
        const sc = p.today == null ? '<span class="muted">No score</span>' : `<b class="num">${Math.round(p.today)}</b>${deltaHTML(p.delta7)}`;
        const last = p.state === 'active' ? esc(p.lastActive) : `<button type="button" class="btn sm invbtn" data-inv="${p.id}">${p.state === 'none' ? 'Send invite' : 'Resend'}</button>`;
        return `<li class="prow prow-grid" data-id="${p.id}">
          <button type="button" class="star" data-star="${p.id}" aria-pressed="${p.fav}" aria-label="Favorite ${esc(p.name)}" title="${p.fav ? 'Remove from favorites' : 'Add to favorites'}">${ic('star')}</button>
          <div class="who"><span class="avatar" data-tone="${hashStr(p.id) % 4}" aria-hidden="true">${initials(p.name)}</span>
            <div class="nm"><a class="rowlink" href="#/provider/patient/${p.id}"><b>${hl(p.name, st.q)}</b></a><small>${p.state === 'active' ? `<span class="ondays num" title="On the app since ${fmtDY(p.series[0].d)}">${dayDiff(TODAY, p.series[0].d) + 1} days</span><span class="bar" aria-hidden="true">|</span>` : ''}${esc(p.reason)}</small>
              <div class="only-sm">${pill}<span class="c-score">${sc}</span></div></div></div>
          <div class="c-status">${pill}</div>
          <div class="c-score">${sc}</div>
          <div class="c-spark">${spark(p.series.slice(-14).map(x => x.score))}</div>
          <div class="c-last">${last}</div>
          <span class="chev" aria-hidden="true">${ic('chevron-right')}</span></li>`;
      };
      const view = () => {
        const q0 = st.q.trim().toLowerCase();
        const pass = p => st.filter === 'all' || (st.filter === 'fav' && p.fav) || (st.filter === 'attn' && p.status === 'attention') || (st.filter === 'active' && p.state === 'active') || (st.filter === 'invited' && p.state === 'invited') || (st.filter === 'none' && p.state === 'none');
        let list = PATIENTS.filter(p => pass(p) && (!q0 || p.name.toLowerCase().includes(q0)));
        const rel = p => { const n = p.name.toLowerCase(); return n.startsWith(q0) ? 0 : n.split(' ').some(w => w.startsWith(q0)) ? 1 : 2; };
        const byName = (a, b) => a.name.localeCompare(b.name);
        if (q0) list.sort((a, b) => rel(a) - rel(b) || byName(a, b));
        else if (st.sort === 'name') list.sort(byName);
        else if (st.sort === 'last') list.sort((a, b) => (a.state === 'active' ? a.daysSince : 999) - (b.state === 'active' ? b.daysSince : 999) || byName(a, b));
        else if (st.sort === 'score') list.sort((a, b) => (a.today ?? 999) - (b.today ?? 999));
        else if (st.sort === 'scoreHi') list.sort((a, b) => (b.today ?? -1) - (a.today ?? -1) || byName(a, b));
        else list.sort((a, b) => RANK[a.status] - RANK[b.status] || (b.fav - a.fav) || byName(a, b));
        if (!list.length) {
          rows.innerHTML = `<li class="empty">${ic('search', 'lg')}<b>${st.q.trim() ? `No patients match “${esc(st.q.trim())}”` : 'No patients here yet'}</b><span>${st.q.trim() ? (st.filter === 'all' ? 'Check the spelling or clear the search.' : 'Try the All filter or clear the search.') : 'Try another filter.'}</span>${st.q.trim() ? '<button type="button" class="btn sm" id="clr2">Clear search</button>' : ''}</li>`;
        } else rows.innerHTML = list.map(rowHTML).join('');
        $('#pfoot', root).textContent = `Showing ${list.length} of ${PATIENTS.length} patients`;
        $('#qclear', root).classList.toggle('hide', !st.q);
        const t = patientStats(); $$('[data-c]', root).forEach(e => { e.textContent = t[e.dataset.c]; });
        $('#sub', root).textContent = `${t.n} patients, ${t.active} on the app`; $('#k1', root).textContent = t.today; $('#k2', root).textContent = t.attn; $('#k3', root).textContent = t.none;
      };
      view(); if (lh == null) applyH();
      q.addEventListener('input', () => { st.q = q.value; $('#pscroll', root).scrollTop = 0; view(); });
      const clear = () => { st.q = ''; q.value = ''; view(); q.focus(); };
      on(root, 'click', '#qclear', clear); on(root, 'click', '#clr2', clear);
      on(root, 'click', '[data-f]', (e, b) => { st.filter = b.dataset.f; $$('[data-f]', root).forEach(x => x.setAttribute('aria-pressed', String(x === b))); $('#pscroll', root).scrollTop = 0; view(); });
      $('#sort', root).addEventListener('change', e => { st.sort = e.target.value; store.set('sort', st.sort); view(); });
      on(root, 'click', '[data-star]', (e, b) => { const p = PAT[b.dataset.star]; p.fav = !p.fav; view(); toast(p.fav ? `${p.name} added to favorites` : `${p.name} removed from favorites`); const nb = $(`[data-star="${p.id}"]`, root); nb && nb.focus(); });
      on(root, 'click', '[data-inv]', (e, b) => { sendInvite(PAT[b.dataset.inv], view); });
      on(root, 'click', '#bulk', () => bulkInviteDialog(view));
      q.addEventListener('keydown', e => { if (e.key === 'Escape' && st.q) clear(); if (e.key === 'Enter') { const a = $('.rowlink', rows); a && go(a.getAttribute('href').slice(1)); } });
    }
  };
}, 'providers');

/* ----- add one patient or import a list (no passwords: patients set their own through the invite) ----- */
route(/^\/provider\/add$/, () => {
  const html = providerShell(`<div><a class="link" href="#/provider">${ic('arrow-left', 'sm')} Back to patients</a></div>
    <div><h1 style="font-size:var(--t-2xl)">Add patients</h1><p class="ink2" style="margin-top:6px;max-width:64ch">Load in everyone you work with, then invite only the people you want on the app. Nobody gets an email until you send an invite.</p></div>
    <div class="add-grid">
      <div class="card"><h2 class="sh">Add one patient</h2>
        <form id="addform" novalidate class="col" style="gap:var(--s4)">
          ${fieldHTML('aname', 'Full name', { ph: 'Jamie Rivera', ac: 'off' })}
          ${fieldHTML('aemail', 'Email', { type: 'email', ph: 'jamie@example.com', ac: 'off' })}
          <div class="field"><span class="label" id="lenlbl">Starting check-in length</span><div class="len-pick"><div class="seg fill" role="group" aria-labelledby="lenlbl" id="alen">
            <button type="button" data-v="quick" aria-pressed="false">Quick<small>1 min</small></button><button type="button" data-v="standard" aria-pressed="true">Standard<small>3 min</small></button><button type="button" data-v="extended" aria-pressed="false">Extended<small>5 min</small></button></div></div>
            <small class="muted">The patient can change this any time.</small></div>
          <button class="btn primary lg block" type="submit">Add patient</button></form>
        <div class="success-card hide" id="asuccess" aria-live="polite"></div></div>
      <div class="card"><h2 class="sh">Import a list</h2><p class="ink2" style="font-size:var(--t-sm);margin-bottom:var(--s3)">Paste one patient per line as name, email. A spreadsheet saved as CSV works too.</p>
        <div class="field"><label class="sr" for="itext">Patient list</label><textarea class="textarea" id="itext" style="min-height:150px" placeholder="Jamie Rivera, jamie@example.com&#10;Sam Ortiz, sam@example.com"></textarea></div>
        <div class="row wrap" style="margin-top:var(--s3);gap:var(--s2)"><label class="btn sm" for="ifile">${ic('file-text', 'sm')}<span>Choose a CSV file</span></label><input type="file" id="ifile" accept=".csv,.txt,text/csv,text/plain" class="sr"><button type="button" class="btn sm" id="isample">Use a sample list</button></div>
        <div id="iprev" class="muted" style="margin-top:var(--s3);font-size:var(--t-sm)" aria-live="polite">Nothing to import yet.</div>
        <button type="button" class="btn primary lg block" id="iadd" style="margin-top:var(--s4)" disabled>Import patients</button></div></div>`);
  return {
    html, mount(root) {
      mountShell(root);
      const val = { aname: v => v.trim() ? '' : 'Enter the patient’s full name.', aemail: v => !v.trim() ? 'Enter an email address.' : !EMAIL_RE.test(v.trim()) ? 'Enter a valid email, like name@example.com.' : takenEmail(v.trim()) ? 'This email is already on your list.' : '' };
      ['aname', 'aemail'].forEach(id => { const el = $('#' + id, root); el.addEventListener('blur', () => setErr(root, id, val[id](el.value))); el.addEventListener('input', () => { if ($('#f-' + id, root).classList.contains('err') && !val[id](el.value)) setErr(root, id, ''); }); });
      on(root, 'click', '#alen button', (e, b) => $$('#alen button', root).forEach(x => x.setAttribute('aria-pressed', String(x === b))));
      $('#addform', root).addEventListener('submit', e => {
        e.preventDefault(); let bad = false; for (const id of ['aname', 'aemail']) { const m = val[id]($('#' + id, root).value); setErr(root, id, m); bad = bad || !!m; }
        if (bad) { $('.field.err input', root).focus(); return; }
        const p = createPatient({ name: $('#aname', root).value.trim(), email: $('#aemail', root).value.trim().toLowerCase(), length: $('#alen [aria-pressed="true"]', root).dataset.v });
        $('#addform', root).classList.add('hide'); const sx = $('#asuccess', root); sx.classList.remove('hide');
        sx.innerHTML = `<div class="notice">${ic('circle-check')}<span>${esc(p.name)} was added. No email has been sent yet.</span></div>
          <button type="button" class="btn primary lg block" id="sendnow">${ic('mail')}<span>Send invite now</span></button>
          <a class="btn block" href="#/provider/patient/${p.id}/cards">Choose their cards first</a><button type="button" class="btn block" id="another">Add another patient</button><a class="link" style="align-self:center" href="#/provider">Back to patient list</a>`;
        on(sx, 'click', '#sendnow', () => sendInvite(p, () => { $('#sendnow', sx).disabled = true; }));
        on(sx, 'click', '#another', () => { sx.classList.add('hide'); $('#addform', root).classList.remove('hide'); $('#addform', root).reset(); $('#aname', root).focus(); });
        toast('Patient added');
      });
      let parsed = { ok: [], bad: [] };
      const prev = () => {
        parsed = parseRoster($('#itext', root).value); const t = $('#iprev', root);
        t.innerHTML = parsed.ok.length || parsed.bad.length ? `<b style="color:var(--ink)">${parsed.ok.length} ready to import</b>${parsed.bad.length ? `<div style="color:var(--bad);margin-top:6px">${ic('triangle-alert', 'sm')} ${parsed.bad.length} skipped: ${esc(parsed.bad.slice(0, 3).join('; '))}${parsed.bad.length > 3 ? '...' : ''}</div>` : ''}` : 'Nothing to import yet.';
        const b = $('#iadd', root); b.disabled = !parsed.ok.length; b.textContent = parsed.ok.length ? `Import ${parsed.ok.length} patient${parsed.ok.length === 1 ? '' : 's'}` : 'Import patients';
      };
      $('#itext', root).addEventListener('input', prev);
      $('#isample', root).addEventListener('click', () => { $('#itext', root).value = 'Name, Email\nJamie Rivera, jamie.rivera@example.com\nSam Ortiz, sam.ortiz@example.com\nPriyanka Das, priyanka.das@example.com\nLeo Hartmann, leo.hartmann@example.com\nMaya Brooks, maya.brooks@example.com'; prev(); });
      $('#ifile', root).addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { $('#itext', root).value = String(r.result).slice(0, 200000); prev(); }; r.readAsText(f); });
      $('#iadd', root).addEventListener('click', () => { const n = parsed.ok.length; parsed.ok.forEach(x => createPatient({ ...x, length: 'standard' })); toast(`${n} patients added. Invite them from the list when you are ready.`); go('/provider'); });
    }
  };
}, 'providers');
