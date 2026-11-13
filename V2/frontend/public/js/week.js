// WHAT THIS FILE DOES
// The weekly summary screens. There are two versions built from the same numbers: a simple one for the patient's phone
// and a detailed report for the practitioner. It also draws the small weekly chart and the pop-up that shows what was
// answered on one day.
// Green zone starting points (for an area, and for the lifestyle score)
const GZ = () => (HK.config.greenZone ?? 70);          /* green zone for a domain, in percent */
const GG = () => (HK.config.greenGraph ?? 70);         /* green zone for the lifestyle score, on the 0 to 100 scale */
// Margins around the small weekly charts
const WM = { l: 30, r: 8, t: 14, b: 22 };              /* margins of the small weekly charts */
// The week is the 7 days ending today, compared with the 7 days before. Today is not finished, so it is left out of averages
/* ===== Weekly summaries: one data set, two versions (patient-friendly, practitioner-detailed) =====
   One window: the 7 calendar days ending today. Its comparison window is the 7 days before it.
   Today is not finished, so it is left out of every average and count of scores. Scores are the server's lifestyle scores (0 to 100). */
// Collects everything the weekly screens need for one patient: the days, averages, change and each area's numbers
function weekData(p) {
  const mkDay = d => {
    const e = p.series.find(s => sameDay(s.d, d));
    return { d, exists: !!e, score: e ? e.score : null, g: e && e.g != null ? e.g : null, rg: e && e.rg != null ? e.rg : null, prov: !!(e && e.prov), ci: e ? e.ci || [] : [], done: !!(e && (e.ci || []).length) };
  };
  const days = [], prev = [];
  for (let i = 6; i >= 0; i--) days.push(mkDay(addDays(TODAY, -i)));
  for (let i = 13; i >= 7; i--) prev.push(mkDay(addDays(TODAY, -i)));
  const fin = days.filter(x => x.exists && !x.prov && x.g != null), pfin = prev.filter(x => x.exists && x.g != null);
  const avg = mean(fin.map(x => x.g)), pavg = mean(pfin.map(x => x.g));
  /* a card's value on a day is the server's percent for that card, present only when that card was on and graded that day */
  const dv = (x, k) => (x.exists && !x.prov && x.score != null) ? (HK.provider.domainScores(p, x.d, x.score) || {})[k] ?? null : null;
  const doms = p.unlocked.map(k => {
    const vals = days.map(x => dv(x, k)), pv = prev.map(x => dv(x, k)), got = vals.filter(v => v != null), pgot = pv.filter(v => v != null);
    const eligibleDays = days.filter(x => x.exists && !x.prov).length;
    return { id: k, vals, n: got.length, met: got.filter(v => v >= GZ()).length, avg: mean(got), pavg: mean(pgot), pn: pgot.length, notScored: eligibleDays - got.length };
  });
  return { days, prev, fin, pfin, avg, pavg, delta: avg != null && pavg != null ? avg - pavg : null, doms,
    range: `${fmtD(days[0].d)} to ${fmtD(days[6].d)}`, prange: `${fmtD(prev[0].d)} to ${fmtD(prev[6].d)}`,
    checkedDays: days.filter(x => x.done).length, sessions: days.reduce((n, x) => n + x.ci.length, 0) };
}
// Turns one saved answer into text to show
const answerText = (q, a) => Array.isArray(a) ? a.join(', ') : q && q.type === 'scale_0_10' ? `${a} out of 10` : q && q.type === 'minutes' ? `${a} min` : String(a);
// Words that describe which check-ins were done on a day
const dayStatusWord = x => !x.exists ? 'before enrollment' : x.done ? (x.ci.length === 2 ? 'morning and evening submitted' : x.ci[0] === 'morning' ? 'morning submitted' : 'evening submitted') : x.prov ? 'no check-in yet' : 'no check-in submitted';

// The small weekly chart for the patient: only the 7-day average, as one solid line, with the date under each day and no numbers on the side
/* ----- small weekly chart: the 7-day average (solid line) on the 0 to 100 scale, green zone shaded from 70 to 100. Drag across it to measure. ----- */
// Draws the small chart: green zone band, grid, line, markers and value labels
function miniLineInner(days, w = 330, h = 150, gentle = false) {
  const vals = days.map(d => d.rg), have = vals.filter(v => v != null); if (have.length < 1) return `<p class="muted">No scores this week yet.</p>`;
  const lo = HK.config.graphMin ?? 0, hi = HK.config.graphMax ?? 1000, gz = HK.config.greenGraph ?? 70;
  const M = WM, iw = w - M.l - M.r, ih = h - M.t - M.b;
  const pad = gentle ? 20 : 0;   /* patient view: room above the top and below the bottom so value labels never cover the line */
  const X = i => M.l + (i / 6) * iw, Y = v => M.t + pad + (1 - (v - lo) / (hi - lo)) * (ih - 2 * pad);
  let d = '', dash = '', rl = '';
  days.forEach((x, i) => { if (x.rg == null) return; const px = X(i), py = Y(x.rg);
    if (days[i - 1] && days[i - 1].rg != null) { const qx = X(i - 1), qy = Y(days[i - 1].rg), mx = (qx + px) / 2; rl += `C${mx.toFixed(1)} ${qy.toFixed(1)} ${mx.toFixed(1)} ${py.toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)}`; }   /* smooth curve, no overshoot */
    else rl += 'M' + px.toFixed(1) + ' ' + py.toFixed(1); });
  const nochk = days.filter(x => x.exists && !x.prov && !x.done).map(x => DOW[x.d.getDay()].slice(0, 3));
  const missed = days.filter((x, i) => x.exists && vals[i] == null && !x.prov).map(x => DOW[x.d.getDay()].slice(0, 3));
  const gy = Y(gz).toFixed(1), zy = Y(0).toFixed(1), tk = v => String(Math.round(v));
  const dayName = x => `${DOW[x.d.getDay()]}, ${fmtD(x.d)}`;
  const lastI = vals.reduce((k, v, i) => v == null ? k : i, -1);
  /* value labels sit on the outside of the bend (above a peak, below a dip) so they never sit on the line */
  const side = i => { const v = vals[i], p = vals[i - 1], n = vals[i + 1];
    if (p != null && n != null && ((p > v && v > n) || (p < v && v < n))) return p > v ? { dx: 9, dy: -8, a: 'start' } : { dx: -9, dy: -8, a: 'end' };   /* on a slope: the empty corner above it */
    const nb = [p, n].filter(x => x != null); const up = !nb.length || v >= nb.reduce((t, x) => t + x, 0) / nb.length;
    return up ? { dx: 0, dy: -10, a: 'middle' } : { dx: 0, dy: 18, a: 'middle' }; };
  const labels = vals.map((v, i) => { if (v == null) return ''; const o = side(i), an = i === 0 && o.a === 'middle' ? 'start' : i === 6 && o.a === 'middle' ? 'end' : o.a; return `<text class="tx vl ${i === lastI ? 'now' : ''}" x="${(X(i) + o.dx + (an === 'start' && o.a === 'middle' ? 4 : an === 'end' && o.a === 'middle' ? 4 : 0)).toFixed(1)}" y="${(Y(v) + o.dy).toFixed(1)}" text-anchor="${an}" pointer-events="none">${fmtG(v)}</text>`; }).join('');
  return `<svg class="mini${gentle ? ' gentle' : ''}" viewBox="0 0 ${w} ${h}" role="group" aria-label="7-day average lifestyle score this week, scale ${lo} to ${hi}, green zone from ${gz}">
    <rect class="gzb" x="${M.l}" y="${Y(hi).toFixed(1)}" width="${iw}" height="${(Y(gz) - Y(hi)).toFixed(1)}"/>
    <line class="gl ax" x1="${M.l}" x2="${w - M.r}" y1="${Y(lo).toFixed(1)}" y2="${Y(lo).toFixed(1)}"/><line class="gzl" x1="${M.l}" x2="${w - M.r}" y1="${gy}" y2="${gy}"/>
    <path class="bridge" d="${dash}"/>${gentle ? '' : vals.map((v, i) => v == null && days[i].exists && !days[i].prov ? `<line class="miss" x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="${(Y(lo) - 10).toFixed(1)}" y2="${Y(lo).toFixed(1)}"/>` : '').join('')}<path class="rl" d="${rl}"/>
    ${days.map((x, i) => `<text class="tx ${i === 6 ? 'now' : ''}" x="${X(i).toFixed(1)}" y="${h - 4}" text-anchor="middle">${DOW[x.d.getDay()].slice(0, 2)}</text>`).join('')}</svg>
    ${gentle ? '' : `<p class="mkey"><span class="lk"><i class="lkl"></i>Daily score</span><span class="lk"><i class="lkl dsh"></i>7-day average</span><span class="lk"><span class="${gentle ? 'gzsw' : 'gzkey2'}" aria-hidden="true"></span>Green zone${gentle ? ` (${tk(gz)} and up)` : ''}</span></p>
    ${nochk.length ? `<p class="mkey"><span class="tickkey" aria-hidden="true"></span><span>No check-in submitted: ${nochk.join(', ')}.</span></p>` : ''}
    ${missed.length ? `<p class="mkey"><span class="tickkey" aria-hidden="true"></span><span>No score: ${missed.join(', ')}.</span></p>` : ''}
    ${days[6] && days[6].prov ? `<p class="mkey"><span>Today is provisional.</span></p>` : ''}`}`;
}
// Wraps the chart so a finger or mouse can drag across it to measure the change between two days
/* wraps the chart so a finger (or mouse) can press, slide and release across it to measure the change */
// Builds the chart together with the area that shows the reading
function miniLine(days, w = 330, h = 150, gentle = false, pt = null) {
  // The screen: days checked in, the chart, what went well and the areas this week
  const inner = miniLineInner(days, w, h, gentle);
  const have = days.filter(d => d.rg != null); if (have.length < 2) return inner;
  const M = WM, ih = h - M.t - M.b;
  const roll = HK.config.rollingDays ?? 7, enrolled = pt && pt.enrolledOn ? parseISO(pt.enrolledOn) : null;
  const win = x => { let a = addDays(x.d, -(roll - 1)); if (enrolled && a < enrolled) a = enrolled; return `${fmtD(a)} to ${fmtD(x.d)}`; };
  const data = { w, t: M.t, ih, pid: pt ? pt.id : null, xs: days.map((d, i) => +(M.l + (i / 6) * (w - M.l - M.r)).toFixed(1)), vs: days.map(d => d.rg == null ? null : Math.round(d.rg * 10) / 10), ds: days.map(d => DOW[d.d.getDay()] + ', ' + fmtD(d.d)), ks: days.map(d => iso(d.d)), rg: days.map(d => d.rg == null ? null : Math.round(d.rg * 10) / 10), win: days.map(win), prov: days.map(d => !!d.prov) };
  const svg = inner.replace('</svg>', '<rect class="selb hide" x="0" y="' + M.t + '" width="0" height="' + ih + '" rx="4"/></svg>');
  return `<div class="minibox" data-mini="${esc(JSON.stringify(data))}">${svg}<div class="mread" aria-live="polite"><span class="hint">Drag across the chart to measure.</span></div></div>`;
}
// Turns on touching, dragging and keyboard use for every small chart on the page
(function wireMini() {
  if (window.__miniWired) return; window.__miniWired = true;
  let md = null;
  const nearest = (d, x) => { let b = null, bd = 1e9; d.vs.forEach((v, i) => { if (v == null) return; const k = Math.abs(d.xs[i] - x); if (k < bd) { bd = k; b = i; } }); return b; };
  const clearMini = box => { const br = box.querySelector('.selb'); br && br.classList.add('hide'); box.classList.remove('sel'); box.querySelectorAll('.mk.on').forEach(x => x.classList.remove('on')); box.querySelector('.mread').innerHTML = '<span class="hint">Drag across the chart to measure.</span>'; };
  function showMini(box, d, a, b) {
    const lo = Math.min(a, b), hi = Math.max(a, b), A = d.vs[lo], B = d.vs[hi], diff = Math.round((B - A) * 10) / 10, cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    const br = box.querySelector('.selb'); br.classList.remove('hide'); br.setAttribute('x', d.xs[lo]); br.setAttribute('width', Math.max(3, d.xs[hi] - d.xs[lo]));
    const head = diff === 0 ? 'No change' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} points`;
    box.classList.add('sel');
    box.querySelector('.mread').innerHTML = `<div class="rd"><span class="delta ${cls}">${ic(cls === 'up' ? 'trending-up' : cls === 'down' ? 'trending-down' : 'minus', 'sm')}<span>${head}</span></span><button type="button" class="btn sm" data-mclear>Clear</button></div><div class="muted rs">${d.ds[lo]} (${fmtG(A)}) to ${d.ds[hi]} (${fmtG(B)})</div>`;
  }
  let dragged = false;
  // Choosing a point: a daily point opens that day's details, an average point explains itself
  /* selecting a marker: a daily point opens that day's saved details; a 7-day average point explains its own value and window */
  function pickMk(g) {
    const box = g.closest('.minibox'), d = JSON.parse(box.dataset.mini), i = +g.dataset.i;
    if (g.dataset.k === 'd') { const pat = PAT[d.pid]; if (pat) dayDetails(pat, d.ks[i]); return; }
    clearMini(box); box.querySelectorAll('.mk.on').forEach(x => x.classList.remove('on')); g.classList.add('on');
    box.classList.add('sel');
    box.querySelector('.mread').innerHTML = `<div class="rd"><span><b class="num">${fmtG(d.rg[i])}</b> 7-day average</span><button type="button" class="btn sm" data-mclear>Clear</button></div><div class="muted rs">${d.ds[i]}. Average of the days scored from ${d.win[i]}${d.prov[i] ? ', including today so far' : ''}.</div>`;
  }
  document.addEventListener('keydown', e => {
    const g = e.target.closest && e.target.closest('.minibox .mk'); if (!g) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickMk(g); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {   /* move along the same series */
      const all = [...g.closest('svg').querySelectorAll(`.mk[data-k="${g.dataset.k}"]`)], n = all[all.indexOf(g) + (e.key === 'ArrowRight' ? 1 : -1)]; if (n) { e.preventDefault(); n.focus(); }
    }
  });
  document.addEventListener('pointerdown', e => {
    dragged = false;
    const svg = e.target.closest && e.target.closest('svg.mini');
    document.querySelectorAll('.minibox.sel').forEach(b => { if (!svg || !b.contains(svg)) clearMini(b); });
    if (!svg) return; const box = svg.closest('.minibox'); if (!box) return;
    const d = JSON.parse(box.dataset.mini), r = svg.getBoundingClientRect(), k = d.w / r.width;
    md = { box, svg, d, r, k, mk: e.target.closest('.mk'), x0: e.clientX, a: nearest(d, (e.clientX - r.left) * k), moved: false };
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  document.addEventListener('pointermove', e => {
    if (!md) return; if (!md.moved && Math.abs(e.clientX - md.x0) < 6) return; md.moved = true; dragged = true;
    const b = nearest(md.d, (e.clientX - md.r.left) * md.k);
    if (md.a != null && b != null) { if (md.a === b) { md.box.querySelector('.selb').classList.add('hide'); } else showMini(md.box, md.d, md.a, b); }
  });
  const end = () => { if (!md) return; const m = md; md = null; if (!m.moved) { clearMini(m.box); if (m.mk) pickMk(m.mk); } else if (!m.box.classList.contains('sel')) clearMini(m.box); };
  document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
  document.addEventListener('click', e => { const c = e.target.closest && e.target.closest('[data-mclear]'); if (c) clearMini(c.closest('.minibox')); });
})();
// Pop-up with one day's details: which check-ins were sent, the day's score and the saved answers
/* read-only look at one day: which check-ins were submitted, the day's lifestyle score and the saved answers. It never edits anything. */
// Builds that pop-up and loads the day from the server
function dayDetails(p, key) {
  const H = window.HKL, byId = Object.fromEntries((HK.data.questions || []).map(x => [x.id, x])), day = parseISO(key);
  const shell = `<div class="qlist-dlg"><div class="row between"><h2 style="margin:0">${esc(fmtDow(day))}</h2><button type="button" class="btn icon sm" data-close data-sheetclose aria-label="Close">${ic('x')}</button></div>
    <div id="ddbody"><p class="muted">Loading…</p></div>
    <div class="row end" style="margin-top:var(--s4)"><button type="button" class="btn primary" data-close data-sheetclose>Done</button></div></div>`;
  const load = box => Promise.all([H.dayScore(p.backend.patientId, key), H.dayAnswers(p.backend.patientId, key)]).then(([sc, an]) => {
    const done = an.checkins_done || [], answers = an.answers || {};
    const group = per => Object.entries(answers).map(([id, a]) => [byId[id], a]).filter(([q, a]) => q && q.period === per && a != null && a !== '')
      .map(([q, a]) => `<li><small class="muted">${esc(q.text)}</small><b>${esc(answerText(q, a))}</b></li>`).join('');
    const sect = (per, name) => `<h3 class="dd-h">${name} check-in: ${done.includes(per) ? 'submitted' : (sc.in_progress ? 'not submitted yet' : 'not submitted')}</h3>${group(per) ? `<ul class="dd-list">${group(per)}</ul>` : '<p class="muted">No saved answers.</p>'}`;
    $('#ddbody', box).innerHTML = `<p class="ink2" style="margin:var(--s2) 0 var(--s3)">${sc.percent == null ? 'No graded questions on this day, so there is no lifestyle score.' : `Lifestyle score <b class="num">${fmtG(sc.graph_value)}</b> on a scale of 0 to 100${sc.in_progress ? ' (provisional)' : ''}. ${Math.round(sc.percent)}% of available points earned.`}</p>${sect('morning', 'Morning')}${sect('evening', 'Evening')}`;
  }).catch(e => { $('#ddbody', box).innerHTML = `<p class="muted">${esc(e.message || 'Could not load this day.')}</p>`; });
  if ($('#phone')) return phoneSheet(document, shell, el => load(el));
  openDialog(shell, { label: 'Details for ' + key, onMount: dlg => load(dlg) });
}

// The patient's weekly screen (phone)
/* ----- patient version (phone) ----- */
// Builds and shows it
route(/^\/patient\/week$/, () => {
  const pid = phonePid(), p = PAT[pid]; if (!p) return phoneEmpty();
  const W = weekData(p);
  const checked = W.checkedDays, todayProv = !!(W.days[6] && W.days[6].prov);
  const fdays = W.fin.length, fr = fdays ? `${fmtD(W.fin[0].d)} to ${fmtD(W.fin[fdays - 1].d)}` : null;
  const cmp = window.weekCompareText(W.delta);
  // Notes shown beside the phone
  const notes = `<div class="card"><h2>About this screen</h2><ul><li>The week is the 7 days up to today (${W.range}). It is compared with the 7 days before it (${W.prange}).</li><li>A day counts as checked in when at least one check-in, morning or evening, was submitted. Tap a day to see its saved details. This does not edit anything.</li><li>The lifestyle score runs from 0 to 100. It counts how many of the day’s lifestyle questions earned points. It is not a mood score.</li><li>Today is provisional, so it is left out of the weekly average and the card counts.</li></ul></div>`;
  const inner = `<div class="ph-head center"><div class="hd"><h1>Your week</h1><p class="num">${W.range}</p></div></div>
    <div class="pad stack weekpage">
      <section class="pcard"><div class="row between"><h2>Checked in ${checked} of 7 days</h2>${infoBtn('Check-in days', [`Each circle is one day, ${W.range}. Left half: morning check-in submitted. Right half: evening submitted. Both halves: both submitted. Empty: none.`, 'The circles show check-ins only, not scores. The underlined letter is today. Tapping a day opens its saved details and does not change anything.'])}</div>
        <div class="daydots">${W.days.map((x, i) => { const st = x.exists ? window.dayIndicator(x.ci) : 'none'; return `<div><button type="button" class="dd" data-day="${iso(x.d)}" data-s="${st}" aria-label="${esc(fmtDow(x.d))}${i === 6 ? ' (today)' : ''}: ${x.exists ? window.dayIndicatorText(x.ci) : 'before enrollment'}. Open details"><svg class="sc" viewBox="0 0 28 28" aria-hidden="true" focusable="false"><path class="h am" d="M14 2A12 12 0 0 0 14 26Z"/><path class="h pm" d="M14 2A12 12 0 0 1 14 26Z"/><circle class="rim" cx="14" cy="14" r="12"/></svg></button><span class="dl${i === 6 ? ' today' : ''}">${DOW[x.d.getDay()].slice(0, 1)}${i === 6 ? '<span class="sr"> (today)</span>' : ''}</span></div>`; }).join('')}</div>
        <p class="muted" style="font-size:var(--t-xs);margin-top:var(--s2)">Tap a day to view.</p></section>
      <section class="pcard"><div class="row between"><h2>Your lifestyle score</h2>${infoBtn('How the graph works', [
        'The weekly comparison uses finished days, compared with the previous seven-day period.',
        'The rolling line averages the seven-day window ending on each date and can include today.',
        'Today’s score can change.'], [['line', '7-day average'], ['band', `Green zone, ${Math.round(GG())} to 100`], ['open', 'Today, not final']])}</div>
        <p class="ink2 cmp" style="font-size:var(--t-sm);margin:var(--s2) 0 var(--s3)">${cmp}</p>${miniLine(W.days, 300, 230, true, p)}</section>
      ${checked > 0 ? `<section class="pcard compact"><h2>What went well</h2>
        <div class="hl"><span class="ii">${ic('sparkles')}</span><span><b>You kept going</b>Checked in on ${checked} of 7 days.</span></div></section>` : ''}
      <section class="pcard"><div class="row between"><h2>Cards this week</h2>${infoBtn('Cards this week', [`A card counts as a green-zone day when its score is ${fmtG(GG())} or higher.`, `Dates: finished days from ${W.range}. Today is not included.`, 'A day is left out of a card’s count when that card had no scored questions that day. “No scored days” means there was nothing to count, which is different from 0 green-zone days.'])}</div>
        ${W.doms.map(d => `<div class="cardrow"><span class="ci">${ic(DOM[d.id].icon)}</span><div><b>${DOM[d.id].name}</b><span class="muted">${window.greenDaysText(d.met, d.n)}</span></div></div>`).join('') || '<p class="muted">No cards are on.</p>'}</section>
      <div class="weekfoot"><div class="sharedline">${ic('lock', 'sm')}<span>Your practitioner can view this summary.</span></div><a class="btn signout" href="#/login" aria-label="Sign out">${ic('log-out', 'sm')}<span>Sign out</span></a></div>
    </div>`;
  return { html: phoneStage(pid, 'week', inner, notes), mount(root) {
    bindInfo(root);
    on(root, 'click', '.dd', (e, b) => dayDetails(p, b.dataset.day));
  } };
}, 'p-week');

// The practitioner's weekly report
/* ----- practitioner version (report): scores from the scores route; confidence and written answers from the days route ----- */
// Builds the list of written answers
const wordsHTML = (list, n) => list.slice(0, n).map(w => `<li><div class="h"><span>${fmtDow(parseISO(w.date))} · ${w.period === 'morning' ? 'Morning' : 'Evening'}</span>${w.card ? `<span class="pill info">${ic(DOM[w.card].icon, 'sm')}${DOM[w.card].name}</span>` : ''}</div><small class="muted">${esc(w.question)}</small><q>${esc(w.text)}</q></li>`).join('') || '<li class="muted">No written responses in these dates.</li>';
// Builds and shows the report
route(/^\/provider\/patient\/([^/?#]+)\/report$/, id => {
  const p = PAT[id]; if (!p) return noPatientView(id);
  const W = weekData(p), bk = p.backend || {};
  // Counts of green-zone days and check-ins this week
  const inZone = W.fin.filter(x => x.g >= GG()).length;
  const slots = W.days.filter(x => x.exists).length * 2;
  const alertAfter = HK.config.alertAfter ?? 3, lf = bk.lastFull;
  const fr = W.fin.length ? `${fmtD(W.fin[0].d)} to ${fmtD(W.fin[W.fin.length - 1].d)}` : null;
  /* every domain with a scored finished day in these dates, on now or not; same counting rules as weekData */
  const dvAt = (x, k) => (x.exists && !x.prov && x.score != null) ? (HK.provider.domainScores(p, x.d, x.score) || {})[k] ?? null : null;
  // The numbers for each area in the report
  const repDoms = DOMAINS.map(dd => { const got = W.days.map(x => dvAt(x, dd.id)).filter(v => v != null), pgot = W.prev.map(x => dvAt(x, dd.id)).filter(v => v != null); return { id: dd.id, n: got.length, met: got.filter(v => v >= GZ()).length, avg: mean(got), pavg: mean(pgot) }; }).filter(d => d.n > 0);
  const dl = (d, when) => d == null ? '' : deltaHTML(d, ' pts', `Change in points, ${when}`, when);
  // The Attention box: whether the patient needs attention and since when
  /* attention: the backend flag and streak, as of the latest finished day (which can reach back before this report's dates) */
  const began = lf && bk.streak > 0 ? addDays(parseISO(lf.date), -(bk.streak - 1)) : null;
  const status = !lf ? `<div class="attn ok">${ic('circle-check')}<div><b>No current alert</b><span class="muted">No finished day to score yet.</span></div></div>`
    : bk.needsAttention ? `<div class="attn bad">${ic('triangle-alert')}<div><b>Needs attention</b><span>${window.belowText(bk.streak)}</span></div></div>`
    : `<div class="attn ok">${ic('circle-check')}<div><b>No current alert</b>${bk.streak > 0 ? `<span class="muted">${window.belowText(bk.streak)} An alert starts at ${alertAfter}.</span>` : '<span class="muted">The latest finished day was in the green zone.</span>'}</div></div>`;
  const asOf = lf ? `<p class="muted" style="font-size:var(--t-xs);margin-top:var(--s2)">Current status as of ${fmtD(parseISO(lf.date))}${began && began < W.days[0].d ? `. The streak began ${fmtD(began)}, before this report’s dates` : ''}.</p>` : '';
  // The report page: stat boxes, chart, areas, attention and written answers
  const html = providerShell(`
    <div><a class="link" href="#/provider/patient/${id}">${ic('arrow-left', 'sm')} Back to ${esc(p.name)}</a></div>
    <header class="cs-head"><div><h1 style="font-size:var(--t-2xl)">Weekly report for ${esc(p.name)}</h1><p class="num">${W.range}</p></div>
      <div class="row wrap"><a class="btn" href="#/patient/week${pq(id)}">${ic('smile')}<span>See patient version</span></a></div></header>
    <p class="muted rep-cmp">Compared with ${W.prange}</p>
    <div class="rep-top">
      <div class="stat"><span class="l">Check-ins ${infoBtn('Check-ins', [`Submitted morning and evening check-ins out of the ${slots} possible in ${W.range}. At least one was submitted on ${W.checkedDays} of 7 days.`])}</span><span class="v num">${W.sessions}<small>/ ${slots}</small></span></div>
      <div class="stat"><span class="l">Average lifestyle score ${infoBtn('Average lifestyle score', [`Average of the ${W.fin.length} finished day${W.fin.length === 1 ? '' : 's'}${fr ? ` (${fr})` : ''}, on the 0 to 100 scale. Today is not finished, so it is left out.`, `Compared with ${W.prange}${W.pfin.length ? `, ${W.pfin.length} scored day${W.pfin.length === 1 ? '' : 's'}` : ', which has no scored days'}. This is not the 7-day average line on the graph.`])}</span><span class="v num">${W.avg == null ? '--' : fmtG(W.avg)}</span><span class="chg">${W.delta == null ? '<span class="muted">No earlier week</span>' : `${dl(W.delta, 'compared with the previous 7 days')}<span class="muted">vs previous week</span>`}</span></div>
      <div class="stat"><span class="l">Green-zone days ${infoBtn('Green-zone days', [`Finished days with a score of ${fmtG(GG())} or higher, out of the ${W.fin.length} finished day${W.fin.length === 1 ? '' : 's'}${fr ? ` (${fr})` : ''}. Today is not included.`])}</span><span class="v num">${inZone}<small>/ ${W.fin.length}</small></span></div>
      <div class="stat" id="repConf"><span class="l">Morning confidence</span><span class="v num">--<small>/ 10</small></span></div></div>
    <div class="rep-row" id="repRow" data-mode="side">
      <div class="rep-chart" id="repChart"></div>
      <div class="card rep-doms"><div class="row between"><h2 class="sh">Domains this week</h2>${infoBtn('Domains this week', [`Average lifestyle score for each domain on the 0 to 100 scale, from the finished days in ${W.range}. The change is in points, compared with ${W.prange}.`, `A green-zone day is a finished day when the domain scored ${fmtG(GG())} or higher. A day is left out when the domain had no scored questions that day. Today is not included.`, 'Only domains with scored days in these dates are listed, including any that were on during the week and are off now.'])}</div>
      <p class="muted rd-sub">Weekly average and change compared with ${W.prange}</p>
      <div class="rdlist">${repDoms.map(d => `<div class="rdrow"><span class="dic">${ic(DOM[d.id].icon)}</span><b class="nm">${DOM[d.id].name}</b><div class="track" style="--gz:${GZ()}%" role="img" aria-label="${DOM[d.id].name}: weekly average ${fmtG(pctToG(d.avg))} on a scale of 0 to 100"><i style="width:${Math.max(0, Math.min(100, d.avg))}%"></i></div><span class="avg num">${fmtG(pctToG(d.avg))}</span><span class="chg">${d.pavg != null ? dl(pctDiffToG(d.avg - d.pavg), 'compared with ' + W.prange) : '<span class="muted">No earlier data</span>'}</span><span class="gzd">Green-zone days: <b class="num">${d.met} / ${d.n}</b></span></div>`).join('') || '<p class="muted">No domain had scored days in these dates.</p>'}</div></div>
      <div class="rep-side">
        <div class="card"><h2 class="sh" style="margin-bottom:var(--s3)">Attention</h2>${status}${asOf}</div>
        <div class="card rep-words"><div class="row between" style="margin-bottom:var(--s3)"><h2 class="sh">Written responses</h2><span class="muted num" id="repWN"></span></div><ul class="ci wscroll" id="repWords" tabindex="0" aria-label="Written responses, newest first"><li class="muted">Loading…</li></ul></div>
      </div></div>
`);
  return { html, mount(root) {
    mountShell(root); bindInfo(root);
    // Puts the chart beside the Attention column when both fit, and under it on a narrow screen
    /* chart beside the Attention column while both fit; otherwise that column moves under the chart (Domains | Attention); one column on narrow screens */
    const row = $('#repRow', root), SIDE = 320, GAP = 24, NARROW = 760;
    const layout = w => { const W = row.clientWidth; row.style.setProperty('--chw', Math.round(w) + 'px'); row.dataset.mode = W < NARROW ? 'stack' : w + GAP + SIDE <= W ? 'side' : 'below'; };
    // Draws the weekly chart (the same chart code as on the patient page, in a fixed size)
    mountScoreChart($('#repChart', root), p, { fixed: { a: W.days[0].d, b: W.days[6].d }, w: 620, h: 520, maxW: () => row.clientWidth, onSize: layout });
    // Loads morning confidence and written answers, then fills them in
    window.HKL.insights(p, 14, 7).then(r => {
      const c = $('#repConf', root); if (!c) return;
      const cd = r.conf != null && r.pconf != null ? deltaHTML(r.conf - r.pconf, ' pts', 'Change in the average answer, in points out of 10', 'compared with the preceding 7 days') : '';
      c.innerHTML = `<span class="l">Morning confidence ${infoBtn('Morning confidence', [`Average of the ${r.confN} saved answer${r.confN === 1 ? '' : 's'} to “How confident am I that I can accomplish this goal today?” in ${W.range}, on its own 0 to 10 scale.`, r.pconfN ? `Compared with ${r.pconfN} answer${r.pconfN === 1 ? '' : 's'} in ${W.prange}.` : `No answers in ${W.prange} to compare with.`])}</span><span class="v num">${r.conf == null ? '--' : r.conf.toFixed(1)}<small>/ 10</small></span><span class="chg">${cd}${cd ? '<span class="muted">vs previous week</span>' : ''}</span>`;
      const ul = $('#repWords', root), lst = [...r.words].sort((x, y) => y.date.localeCompare(x.date) || (y.period === 'evening') - (x.period === 'evening'));   /* newest first */
      ul.innerHTML = wordsHTML(lst, lst.length); $('#repWN', root).textContent = lst.length ? String(lst.length) : '';
    }).catch(() => { const c = $('#repConf', root); if (c) c.insertAdjacentHTML('beforeend', '<span class="muted">Could not load.</span>'); const w = $('#repWords', root); if (w) w.innerHTML = '<li class="muted">Could not load responses.</li>'; });
  } };
}, 'report');
