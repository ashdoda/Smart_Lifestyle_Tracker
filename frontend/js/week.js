/* ===== Weekly summaries: one data set, two versions (patient-friendly, provider-detailed) ===== */
function weekData(p) {
  const days = []; for (let i = 6; i >= 0; i--) { const d = addDays(TODAY, -i); days.push({ d, score: scoreOn(p, d) }); }
  const prev = []; for (let i = 13; i >= 7; i--) prev.push({ d: addDays(TODAY, -i), score: scoreOn(p, addDays(TODAY, -i)) });
  const have = days.filter(x => x.score != null);
  const avg = mean(days.map(x => x.score)), pavg = mean(prev.map(x => x.score));
  const doms = p.unlocked.map(k => {
    const vals = days.map(x => x.score == null ? null : domainScores(p, x.d, x.score)[k]);
    const pv = prev.map(x => x.score == null ? null : domainScores(p, x.d, x.score)[k]);
    return { id: k, vals, met: vals.filter(v => v != null && v >= 62).length, avg: mean(vals), pavg: mean(pv) };
  });
  const barriers = HK.provider.weekBarriers(p) || [];
  const { conf, pconf } = HK.provider.weekConfidence(p, { avg, pavg });
  return { days, prev, have, avg, pavg, delta: avg != null && pavg != null ? avg - pavg : null, doms, barriers, conf, pconf, range: `${fmtD(days[0].d)} to ${fmtD(days[6].d)}` };
}
function miniLineInner(days, w = 330, h = 150, gentle = false) {
  const vals = days.map(d => d.score), have = vals.filter(v => v != null); if (have.length < 1) return `<p class="muted">No check-ins this week yet.</p>`;
  let lo = Math.min(...have), hi = Math.max(...have); const pad = Math.max(5, (hi - lo) * .3); lo = Math.max(0, lo - pad); hi = Math.min(100, hi + pad); if (hi - lo < 14) { lo = Math.max(0, lo - 7); hi = Math.min(100, hi + 7); }
  const M = { l: 6, r: 6, t: 14, b: 22 }, iw = w - M.l - M.r, ih = h - M.t - M.b;
  const X = i => M.l + (i / 6) * iw, Y = v => M.t + (1 - (v - lo) / (hi - lo)) * ih;
  let d = '', ar = '', run = [];
  const flush = () => { if (run.length > 2) ar += `M${run[0][0]} ${M.t + ih}` + run.map(a => `L${a[0]} ${a[1]}`).join('') + `L${run[run.length - 1][0]} ${M.t + ih}Z`; run = []; };
  let dash = '', last = null;
  vals.forEach((v, i) => { if (v == null) { flush(); return; } const x = X(i).toFixed(1), y = Y(v).toFixed(1); d += (vals[i - 1] == null ? 'M' : 'L') + x + ' ' + y; if (last && vals[i - 1] == null) dash += `M${last[0]} ${last[1]}L${x} ${y}`; last = [x, y]; run.push([x, y]); }); flush();
  const missed = days.map((x, i) => vals[i] == null ? DOW[x.d.getDay()].slice(0, 3) : null).filter(Boolean);
  return `<svg class="mini" viewBox="0 0 ${w} ${h}" role="img" aria-label="Daily rating this week: ${vals.map((v, i) => `${DOW[days[i].d.getDay()]} ${v == null ? 'no check-in' : Math.round(v)}`).join(', ')}">
    <line class="gl" x1="${M.l}" x2="${w - M.r}" y1="${M.t + ih}" y2="${M.t + ih}"/><path class="ar" d="${ar}"/><path class="bridge" d="${dash}"/>${vals.map((v, i) => v == null ? `<line class="miss" x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="${M.t + ih - 10}" y2="${M.t + ih}"/>` : '').join('')}<path class="ln" d="${d}"/>
    ${vals.map((v, i) => v == null ? '' : `<circle class="pt" cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="${i === 6 ? 5 : 4}"/><text class="tx ${i === 6 ? 'now' : ''}" x="${X(i).toFixed(1)}" y="${(Y(v) - 10).toFixed(1)}" text-anchor="middle">${Math.round(v)}</text>`).join('')}
    ${days.map((x, i) => `<text class="tx ${i === 6 ? 'now' : ''}" x="${X(i).toFixed(1)}" y="${h - 4}" text-anchor="middle">${DOW[x.d.getDay()].slice(0, 2)}</text>`).join('')}</svg>${missed.length ? `<p class="mkey"><span class="tickkey" aria-hidden="true"></span><span>No check-in ${missed.join(', ')}${gentle ? '. That is okay.' : ''}</span></p>` : ''}`;
}
/* wraps the chart so a finger (or mouse) can press, slide and release across it to measure the change */
function miniLine(days, w = 330, h = 150, gentle = false, pt = null) {
  const inner = miniLineInner(days, w, h, gentle);
  const have = days.filter(d => d.score != null); if (have.length < 2) return inner;
  const M = { l: 6, r: 6, t: 14, b: 22 }, ih = h - M.t - M.b;
  const data = { w, t: M.t, ih, xs: days.map((d, i) => +(M.l + (i / 6) * (w - M.l - M.r)).toFixed(1)), vs: days.map(d => d.score == null ? null : Math.round(d.score)), ds: days.map(d => DOW[d.d.getDay()]), dm: pt ? days.map(d => d.score == null ? null : domainScores(pt, d.d, d.score)) : null, dn: pt ? Object.fromEntries(pt.unlocked.map(k => [k, DOM[k].name])) : null };
  const svg = inner.replace('</svg>', '<rect class="selb hide" x="0" y="' + M.t + '" width="0" height="' + ih + '" rx="4"/></svg>');
  return `<div class="minibox" data-mini="${esc(JSON.stringify(data))}">${svg}<div class="mread" aria-live="polite"><span class="hint">Touch and drag across the chart to measure a change</span></div></div>`;
}
(function wireMini() {
  if (window.__miniWired) return; window.__miniWired = true;
  let md = null;
  const nearest = (d, x) => { let b = null, bd = 1e9; d.vs.forEach((v, i) => { if (v == null) return; const k = Math.abs(d.xs[i] - x); if (k < bd) { bd = k; b = i; } }); return b; };
  const clearMini = box => { const br = box.querySelector('.selb'); br && br.classList.add('hide'); box.classList.remove('sel'); box.querySelector('.mread').innerHTML = '<span class="hint">Touch and drag across the chart to measure a change</span>'; };
  function showMini(box, d, a, b) {
    const lo = Math.min(a, b), hi = Math.max(a, b), A = d.vs[lo], B = d.vs[hi], diff = B - A, pct = A ? diff / A * 100 : 0, cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    const br = box.querySelector('.selb'); br.classList.remove('hide'); br.setAttribute('x', d.xs[lo]); br.setAttribute('width', Math.max(3, d.xs[hi] - d.xs[lo]));
    const head = diff === 0 ? 'No change' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} points (${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%)`;
    box.classList.add('sel');
    let why = '';
    if (d.dm && d.dm[lo] && d.dm[hi]) {
      const ks = Object.keys(d.dm[lo]).filter(k => d.dm[lo][k] != null && d.dm[hi][k] != null), raw = ks.map(k => d.dm[hi][k] - d.dm[lo][k]), shift = diff - raw.reduce((x, y) => x + y, 0) / (raw.length || 1);
      const rows = ks.map((k, i) => ({ n: d.dn[k], v: Math.round(raw[i] + shift) })).sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
      why = `<div class="mwhy"><div class="wtitle">What changed</div>${rows.map(r => `<div class="wr ${r.v > 0 ? 'up' : r.v < 0 ? 'down' : 'flat'}"><span>${esc(r.n)}</span><b>${r.v > 0 ? '+' : r.v < 0 ? '\u2212' : ''}${Math.abs(r.v)} pts</b></div>`).join('')}<div class="wr total ${diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'}"><span>Overall (average of the ${rows.length} cards)</span><b>${diff > 0 ? '+' : diff < 0 ? '\u2212' : ''}${Math.abs(Math.round(diff))} pts</b></div></div>`;
    }
    box.querySelector('.mread').innerHTML = `<div class="rd"><span class="delta ${cls}">${ic(cls === 'up' ? 'trending-up' : cls === 'down' ? 'trending-down' : 'minus', 'sm')}<span>${head}</span></span><button type="button" class="btn sm" data-mclear>Clear</button></div><div class="muted rs">${A} to ${B}, ${d.ds[lo]} to ${d.ds[hi]}</div>${why}`;
  }
  document.addEventListener('pointerdown', e => {
    const svg = e.target.closest && e.target.closest('svg.mini');
    document.querySelectorAll('.minibox.sel').forEach(b => { if (!svg || !b.contains(svg)) clearMini(b); });
    if (!svg) return; const box = svg.closest('.minibox'); if (!box) return;
    const d = JSON.parse(box.dataset.mini), r = svg.getBoundingClientRect(), k = d.w / r.width;
    md = { box, svg, d, r, k, x0: e.clientX, a: nearest(d, (e.clientX - r.left) * k), moved: false };
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  document.addEventListener('pointermove', e => {
    if (!md) return; if (!md.moved && Math.abs(e.clientX - md.x0) < 6) return; md.moved = true;
    const b = nearest(md.d, (e.clientX - md.r.left) * md.k);
    if (md.a != null && b != null) { if (md.a === b) { md.box.querySelector('.selb').classList.add('hide'); } else showMini(md.box, md.d, md.a, b); }
  });
  const end = () => { if (!md) return; const m = md; md = null; if (!m.moved) clearMini(m.box); else if (!m.box.classList.contains('sel')) clearMini(m.box); };
  document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
  document.addEventListener('click', e => { const c = e.target.closest && e.target.closest('[data-mclear]'); if (c) clearMini(c.closest('.minibox')); });
})();
/* private goal titles: show the caret only when the name is cut off; the caret opens/closes the full wrapped text */
(function wirePrivTitles() {
  if (window.__ptWired) return; window.__ptWired = true;
  const fit = () => document.querySelectorAll('.ptitle').forEach(t => { const pt = t.querySelector('.pt'), c = t.querySelector('.pcaret'); if (!pt || !c || t.classList.contains('open')) return; c.classList.toggle('hide', pt.scrollWidth <= pt.clientWidth + 1); });
  let q = 0; const soon = () => { cancelAnimationFrame(q); q = requestAnimationFrame(fit); };
  new MutationObserver(soon).observe(document.body, { childList: true, subtree: true }); window.addEventListener('resize', soon); soon();
  document.addEventListener('click', e => { const c = e.target.closest && e.target.closest('.pcaret'); if (!c) return; const t = c.closest('.ptitle'), open = t.classList.toggle('open'); c.setAttribute('aria-expanded', String(open)); c.setAttribute('aria-label', (open ? 'Hide the full goal: ' : 'Show the full goal: ') + t.querySelector('.pt').textContent); if (!open) soon(); });
})();
const pips = vals => `<div class="pips" role="img" aria-label="${vals.filter(v => v != null && v >= 62).length} of ${vals.filter(v => v != null).length} days">${vals.map(v => `<i class="${v == null ? 'none' : v >= 62 ? 'on' : ''}"></i>`).join('')}</div>`;

/* ----- patient version (phone) ----- */
route(/^\/patient\/week$/, () => {
  const pid = phonePid(), p = PAT[pid]; if (!p) return phoneEmpty();
  const W = weekData(p), first = p.name.split(' ')[0];
  const best = [...W.doms].sort((a, b) => b.met - a.met)[0], low = [...W.doms].sort((a, b) => a.met - b.met)[0];
  const checked = W.have.length, top = W.barriers[0];
  const up = W.delta != null && W.delta >= 2;
  const notes = `<div class="card"><h2>About this screen</h2><ul><li>A plain-language weekly summary the patient sees. It focuses on progress and never on blame.</li><li>Missed days show as empty circles, not red marks. Barriers are framed as patterns to adjust.</li><li>The practitioner gets a different, more detailed version with trends and suggested actions. Open Weekly report in the Provider group to see it.</li></ul></div>`;
  const inner = `<div class="ph-head center"><div class="hd"><h1>Your week</h1><p class="num">${W.range}</p></div></div>
    <div class="pad stack weekpage">
      <section class="pcard"><h2>${checked} of 7 days checked in</h2><p class="ink2" style="font-size:var(--t-sm)">${checked >= 5 ? 'That is a strong week. Showing up is the hardest part.' : checked >= 3 ? 'A solid start. Every check-in helps you see your own patterns.' : 'Every check-in counts. Small is fine.'}</p>
        <div class="daydots">${W.days.map((x, i) => `<div><i class="${x.score != null ? 'on' : ''} ${i === 6 ? 'today' : ''}">${x.score != null ? ic('check') : ''}</i>${DOW[x.d.getDay()].slice(0, 1)}</div>`).join('')}</div></section>
      <section class="pcard"><h2>Your daily rating</h2><p class="ink2" style="font-size:var(--t-sm);margin-bottom:var(--s3)">${up ? `Up ${Math.round(W.delta)} points from last week.` : W.delta != null && W.delta <= -2 ? `Down ${Math.round(-W.delta)} points from last week. Some weeks are harder.` : 'About the same as last week.'}</p>${miniLine(W.days, 330, 150, true, p)}</section>
      <section class="pcard"><h2>What went well</h2>
        ${best ? `<div class="hl"><span class="ii">${ic(DOM[best.id].icon)}</span><span><b>${DOM[best.id].name}</b>You met your goal ${best.met} of ${W.have.length} days.</span></div>` : ''}
        <div class="hl"><span class="ii">${ic('sparkles')}</span><span><b>You kept going</b>${checked} check-ins, even on the harder days.</span></div>
        ${up ? `<div class="hl"><span class="ii">${ic('trending-up')}</span><span><b>Your rating is climbing</b>It is up ${Math.round(W.delta)} points from last week.</span></div>` : ''}</section>
      <section class="pcard"><h2>Goals by card</h2>${W.doms.map(d => `<div class="goalrow"><div class="t"><span>${ic(DOM[d.id].icon)}${DOM[d.id].name}</span><span class="muted num">${d.met} of ${W.have.length}</span></div>${pips(d.vals)}</div>`).join('')}
        <p class="muted" style="font-size:var(--t-xs);margin-top:var(--s2)">Filled circle means you met the goal. Empty means not that day.</p></section>
      ${privWeekHTML(pid)}
      <section class="pcard"><h2>What got in the way</h2><p class="ink2" style="font-size:var(--t-sm);margin-bottom:var(--s3)">These are patterns, not failures. Knowing them helps you plan.</p>
        <div class="bars7">${W.barriers.map(([b, n]) => `<span class="pill">${esc(b)}, ${n} ${n === 1 ? 'day' : 'days'}</span>`).join('')}</div></section>
      <section class="pcard" id="wr" aria-label="Weekly reflection"><h2 class="sh">Weekly reflection</h2><p class="ink2" style="font-size:var(--t-sm);margin-bottom:var(--s3)">One question whenever you have a minute.</p>
        <div class="row wrap" id="wrd" style="gap:var(--s2)" role="group" aria-label="Choose a card">${W.doms.map((d, i) => `<button type="button" class="chip sm" data-wd="${i}" aria-pressed="${i === 0}">${DOM[d.id].short}</button>`).join('')}</div>
        <p id="wrq" style="margin:var(--s3) 0;font-family:var(--font-display);font-weight:700;font-size:1.0625rem;line-height:1.3">${esc(DOM[W.doms[0].id].wk[0])}</p>
        <div class="field"><label class="sr" for="wrt">Your reflection</label><textarea class="textarea" id="wrt" placeholder="Write a sentence or two"></textarea></div>
        <div class="row" style="margin-top:var(--s3);gap:var(--s2)"><button type="button" class="btn sm" id="wrnext">Another question</button><button type="button" class="btn primary sm grow" id="wrsave">${ic('check', 'sm')}<span>Save</span></button></div></section>
      <section class="pcard" style="background:var(--accent-soft);border-color:transparent"><h2>One small thing for next week</h2>
        <p style="font-size:var(--t-sm)">${top && top[1] >= 3 ? `${esc(top[0])} came up ${top[1]} days. Try a 5-minute version of your ${low ? DOM[low.id].name.toLowerCase() : 'main'} goal on those mornings.` : `Try one small step on ${low ? DOM[low.id].name : 'your goals'}: ${esc((low ? DOM[low.id] : DOMAINS[0]).ideas[0].toLowerCase())}.`}</p>
        <button type="button" class="btn primary lg block ck-go" style="margin-top:var(--s3)" id="useplan"><span class="lbl">${ic('sparkles')}<span>Use this for next week</span><span class="go-arrow">${ic('arrow-right')}</span></span></button></section>
      <div class="weekfoot"><div class="sharedline">${ic('lock', 'sm')}<span>${esc(provName())} sees a detailed version of this summary.</span></div><a class="btn signout" href="#/login" aria-label="Sign out">${ic('log-out', 'sm')}<span>Sign out</span></a></div>
    </div>`;
  return { html: phoneStage(pid, 'week', inner, notes), mount(root) {
    on(root, 'click', '#useplan', (e, b) => satisfy(b, () => toast('Added to next week’s plan')));
    let di = 0, qi = 0;
    const showQ = () => { const d = DOM[W.doms[di].id]; $('#wrq', root).textContent = d.wk[qi % d.wk.length]; $('#wrt', root).value = ''; };
    on(root, 'click', '[data-wd]', (e, b) => { di = +b.dataset.wd; qi = 0; $$('[data-wd]', root).forEach(x => x.setAttribute('aria-pressed', String(x === b))); showQ(); });
    on(root, 'click', '#wrnext', () => { qi++; showQ(); });
    on(root, 'click', '#wrsave', () => { const has = $('#wrt', root).value.trim(); toast(has ? 'Reflection saved' : 'Write something first, or tap Another question'); if (has) { qi++; showQ(); } });
  } };
}, 'p-week');

/* ----- provider version (report) ----- */
route(/^\/provider\/patient\/([^/?#]+)\/report$/, id => {
  const p = PAT[id]; if (!p) return noPatientView(id);
  const W = weekData(p), C = cfg(id), first = p.name.split(' ')[0];
  const lowD = [...W.doms].sort((a, b) => a.met - b.met)[0], topB = W.barriers[0];
  const pats = [];
  if (topB && topB[1] >= 3) pats.push(['repeat', `${topB[0]} came up ${topB[1]} days`, `The same barrier keeps returning. Suggested: shrink the goal to a 5-minute version, or move it to a better time of day.`, 'Adjust cards', `/provider/patient/${id}/cards`]);
  if (lowD) pats.push(['target', `${DOM[lowD.id].name} was met ${lowD.met} of ${W.have.length} days`, `This is ${first}’s lowest card this week. Suggested: offer the shortest practice option and ask what makes it hard.`, 'Add a question', `/provider/patient/${id}/cards`]);
  if (p.lengthNow !== p.lengthChosen) pats.push(['timer', `Check-in shortened to ${LENGTH[p.lengthNow].name}`, `${first} chose ${LENGTH[p.lengthChosen].name}, then skipped follow-ups on several evenings. The app will offer the longer version again after a week of steady check-ins.`, 'Review length', `/provider/patient/${id}/cards`]);
  if (W.conf != null && W.conf < 5.5) pats.push(['battery-low', `Average confidence ${W.conf.toFixed(1)} out of 10`, 'Low confidence triggers the smaller-goal prompt. Consider making this week’s goal easier.', 'Adjust cards', `/provider/patient/${id}/cards`]);
  if (!pats.length) pats.push(['sparkles', 'Nothing flagged this week', `${first} met most goals and checked in steadily. Consider raising a goal slightly.`, 'Open card settings', `/provider/patient/${id}/cards`]);
  const answers = recentAnswers(p).slice(0, 3);
  const custom = (C.custom || []).slice(0, 3).map(q => [q, HK.provider.customResult(p, q, W)]);
  const dl = d => deltaHTML(d == null ? null : d);
  const html = providerShell(`
    <div><a class="link" href="#/provider/patient/${id}">${ic('arrow-left', 'sm')} Back to ${esc(p.name)}</a></div>
    <header class="cs-head"><div><h1 style="font-size:var(--t-2xl)">Weekly report for ${esc(p.name)}</h1><p class="num">${W.range}. This is the provider version. ${esc(first)} sees a simpler summary.</p></div>
      <div class="row wrap"><button type="button" class="btn" id="exp">${ic('file-text')}<span>Save as PDF</span></button><a class="btn" href="#/patient/week${pq(id)}">${ic('smile')}<span>See patient version</span></a></div></header>
    <div class="rep-top">
      <div class="stat"><span class="l">Check-ins completed</span><span class="v num">${HK.provider.weekCheckins(p, W)}<small>of 14</small></span><span class="muted" style="font-size:var(--t-xs)">Morning and evening</span></div>
      <div class="stat"><span class="l">Average Overall Score</span><span class="v num">${W.avg == null ? '--' : Math.round(W.avg)}</span>${W.delta == null ? '' : `<span>${deltaHTML(W.delta)} <span class="muted" style="font-size:var(--t-xs)">vs. last week</span></span>`}</div>
      <div class="stat"><span class="l">Average confidence</span><span class="v num">${W.conf == null ? '--' : W.conf.toFixed(1)}<small>of 10</small></span>${W.conf != null && W.pconf != null ? `<span>${deltaHTML((W.conf - W.pconf) * 5)} <span class="muted" style="font-size:var(--t-xs)">vs. last week</span></span>` : ''}</div>
      <div class="stat"><span class="l">Check-in length</span><span class="v">${LENGTH[p.lengthNow].name}</span><span class="muted" style="font-size:var(--t-xs)">${p.lengthNow !== p.lengthChosen ? `Chosen: ${LENGTH[p.lengthChosen].name}, shortened automatically` : 'As chosen by the patient'}</span></div></div>
    <div class="rep-grid">
      <div class="col" style="gap:var(--s6)">
        <div class="card"><h2 class="sh">Daily Overall Score</h2>${miniLine(W.days, 560, 190, false, p)}</div>
        <div class="card"><h2 class="sh">Goals by card</h2>${W.doms.map(d => `<div class="dgrow"><span class="dic">${ic(DOM[d.id].icon)}</span><div class="nm"><b>${DOM[d.id].name}</b><small>Average ${d.avg == null ? '--' : Math.round(d.avg)} out of 100</small></div>${pips(d.vals)}<div class="row" style="justify-content:flex-end;gap:6px"><b class="num">${d.met} of ${W.have.length}</b>${dl(d.avg != null && d.pavg != null ? d.avg - d.pavg : null)}</div></div>`).join('')}</div>
        <div class="card"><h2 class="sh">Barriers reported</h2><div class="bars7">${W.barriers.map(([b, n]) => `<span class="pill ${n >= 3 ? 'warn' : ''}">${n >= 3 ? ic('repeat', 'sm') : ''}${esc(b)}, ${n} ${n === 1 ? 'day' : 'days'}</span>`).join('')}</div></div>
      </div>
      <div class="col" style="gap:var(--s6)">
        <div class="card"><h2 class="sh">Patterns to look at</h2>${pats.map(([i, t, d, a, href]) => `<div class="pat"><span class="ii">${ic(i)}</span><div class="tx"><b>${esc(t)}</b><span class="ink2">${esc(d)}</span><div><a class="btn sm" href="#${href}">${esc(a)}</a></div></div></div>`).join('')}</div>
        <div class="card"><h2 class="sh">In ${esc(first)}’s words</h2><ul class="ci">${answers.map(a => `<li><div class="h"><span>${fmtDow(a.d)}, ${a.when.toLowerCase()}</span><span class="pill info">${ic(a.dom.icon, 'sm')}${a.dom.name}</span></div><q>“${esc(a.txt)}”</q></li>`).join('') || '<li class="muted">No answers yet.</li>'}</ul></div>
        ${custom.length ? `<div class="card"><h2 class="sh">Your added questions</h2><ul class="cq-list">${custom.map(([q, r]) => `<li><div class="tx"><b>${esc(q.text)}</b><span class="muted">${r ? esc(r) + ' this week' : 'No answers yet'}</span></div></li>`).join('')}</ul></div>` : ''}
      </div></div>`);
  return { html, mount(root) { mountShell(root); on(root, 'click', '#exp', () => toast('PDF export is part of the full app')); } };
}, 'report');
