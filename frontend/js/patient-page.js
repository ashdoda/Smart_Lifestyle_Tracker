/* ===== Provider: patient detail page ===== */
function streakOf(p) {
  let i = p.series.length - 1; if (p.series[i].score == null) i--; let n = 0;
  while (i >= 0 && p.series[i].score != null) { n++; i--; } return n;
}
function domainWeek(p, endOffset) {
  const out = {}; p.unlocked.forEach(k => { out[k] = []; });
  for (let i = 0; i < 7; i++) {
    const idx = p.series.length - 1 - endOffset - i; if (idx < 0) continue; const s = p.series[idx];
    if (s.score == null) continue; const ds = domainScores(p, s.d, s.score); p.unlocked.forEach(k => out[k].push(ds[k]));
  }
  const m = {}; Object.keys(out).forEach(k => { m[k] = mean(out[k]); }); return m;
}
function recentAnswers(p) { return HK.provider.recentAnswers(p).map(a => ({ ...a, dom: DOM[a.dom] })).filter(a => a.dom).slice(0, 4); }

route(/^\/provider\/patient\/([^/?#]+)$/, id => {
  const p = PAT[id];
  if (!p) return noPatientView(id);
  const [lab, cls, icon] = STATUS_LABEL[p.status], week = domainWeek(p, 0), prev = domainWeek(p, 7);
  const first = p.series[0].d;
  const flagged = p.status === 'attention' || p.status === 'watch';
  const bars = DOMAINS.map(d => {
    if (!p.unlocked.includes(d.id)) return `<div class="brow locked"><span class="dic">${ic('lock')}</span><div><div class="bn"><span>${d.name}</span></div><div class="muted" style="font-size:var(--t-sm)">Locked${d.providerTailored ? ', tailored by the provider' : ''}</div></div><div class="bv"><a class="link" href="#/provider/patient/${p.id}/cards">Unlock</a></div></div>`;
    const v = week[d.id], pv = prev[d.id];
    return `<div class="brow"><span class="dic">${ic(d.icon)}</span><div><div class="bn"><span>${d.name}</span></div><div class="track" role="img" aria-label="${d.name}: ${v == null ? 'no data' : Math.round(v) + ' out of 100'}"><i style="width:${v == null ? 0 : v}%"></i></div></div><div class="bv num">${v == null ? '--' : Math.round(v)}${v != null && pv != null ? deltaHTML(v - pv) : ''}</div></div>`;
  }).join('');
  const ans = recentAnswers(p).map(a => `<li><div class="h"><span>${fmtDow(a.d)}, ${a.when.toLowerCase()}</span><span class="pill info">${ic(a.dom.icon)}${a.dom.name}</span>${a.barrier ? `<span class="pill warn">${ic('flag')}${a.barrier}</span>` : ''}</div><q>“${esc(a.txt)}”</q></li>`).join('') || '<li class="muted">No check-ins yet. Answers will appear here.</li>';
  const note = HK.provider.providerNote(p) || '';
  const html = providerShell(`
    <div><a class="link" href="#/provider">${ic('arrow-left', 'sm')} Back to patients</a></div>
    <header class="pp-head">
      <span class="avatar lg" data-tone="${hashStr(p.id) % 4}" aria-hidden="true">${initials(p.name)}</span>
      <div class="grow"><h1>${esc(p.name)}</h1>
        <div class="pp-meta"><span class="pill ${cls}">${ic(icon)}${lab}</span>${p.age ? `<span>${p.age} years old</span>` : ''}${p.pronouns ? `<span>${esc(p.pronouns)}</span>` : ''}${p.state === 'active' ? `<span>Joined ${fmtDY(first)}</span>` : '<span>Not on the app yet</span>'}<span>Last check-in: ${esc(p.lastActive)}</span></div></div>
      <button type="button" class="btn" id="favBtn" aria-pressed="${p.fav}" aria-label="${p.fav ? 'Remove from favorites' : 'Add to favorites'}">${ic('star')}<span>${p.fav ? 'Favorite' : 'Add to favorites'}</span></button>
      <a class="btn" href="#/provider/patient/${p.id}/report" aria-label="Weekly report">${ic('file-text')}<span>Weekly report</span></a>
      <a class="btn primary" href="#/provider/patient/${p.id}/cards" aria-label="Card settings">${ic('sliders-horizontal')}<span>Card settings</span></a>
    </header>
    ${flagged ? `<div class="notice ${p.status === 'attention' ? 'warn' : 'info'}">${ic('triangle-alert')}<span>${esc(p.reason)}. <a href="#/provider/patient/${p.id}/report">Open the weekly report</a></span></div>` : ''}
    ${p.state !== 'active' ? `<div class="notice info">${ic('mail')}<span>${p.state === 'none' ? 'Not on the app yet. Nobody gets an email until you send an invite.' : `Invite sent ${esc(p.invitedOn || '')}. They have not set up their account yet.`}</span><button type="button" class="btn sm" id="invBtn">${p.state === 'none' ? 'Send invite' : 'Resend invite'}</button></div>` : ''}
    <div class="pp-grid"><div id="chartHost"></div>
      <aside class="pp-side">
        <div class="card"><h2 class="sh">Snapshot</h2><dl class="dl">
          <dt>Current goal</dt><dd>${esc(p.goal)}</dd>
          <dt>Check-in length</dt><dd>${LENGTH[p.lengthChosen].name} chosen${p.lengthNow !== p.lengthChosen ? `<small>Shortened to ${LENGTH[p.lengthNow].name} for now after skipped questions</small>` : '<small>Adjusts automatically if questions are skipped</small>'}</dd>
          <dt>Cards unlocked</dt><dd>${p.unlocked.length} of 6</dd>
          <dt>Check-in streak</dt><dd>${streakOf(p)} day${streakOf(p) === 1 ? '' : 's'}</dd></dl></div>
        <div class="card"><h2 class="sh">Notes for the next visit</h2><div class="field"><label class="sr" for="pnote">Private note</label><textarea class="textarea" id="pnote" placeholder="Write a private note about this patient. Only you can see it.">${esc(note)}</textarea></div>
          <div class="row end" style="margin-top:var(--s3)"><button type="button" class="btn sm" id="noteSave">${ic('save', 'sm')}<span>Save note</span></button></div></div>
        ${privSharedHTML(p.id)}
      </aside></div>
    <div class="pp-lower">
      <div class="card"><div class="row between wrap" style="margin-bottom:var(--s2)"><h2 class="sh">This week by card</h2><span class="muted" style="font-size:var(--t-sm)">Average score, past 7 days</span></div>${bars}</div>
      <div class="card"><h2 class="sh" style="margin-bottom:var(--s3)">Recent check-ins</h3><ul class="ci">${ans}</ul></div>
    </div>`);
  let chart;
  return {
    html, mount(root) {
      mountShell(root); chart = mountScoreChart($('#chartHost', root), p);
      on(root, 'click', '#favBtn', (e, b) => { p.fav = !p.fav; b.setAttribute('aria-pressed', String(p.fav)); $('span', b).textContent = p.fav ? 'Favorite' : 'Add to favorites'; b.setAttribute('aria-label', p.fav ? 'Remove from favorites' : 'Add to favorites'); toast(p.fav ? 'Added to favorites' : 'Removed from favorites'); });
      on(root, 'click', '#invBtn', () => sendInvite(p, () => render()));
      on(root, 'click', '#noteSave', () => toast('Note saved (prototype only)'));
    }, cleanup() { chart && chart.destroy(); }
  };
}, 'patient-page');
