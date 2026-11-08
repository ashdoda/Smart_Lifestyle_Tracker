// WHAT THIS FILE DOES
// The practitioner's page for one patient: name and status at the top, the score chart, a snapshot box, the list of
// areas (with on/off switches) and recent written answers. The chart itself is drawn by chart.js.
/* ===== Provider: patient detail page ===== */
// Number of days in a row with a check-in
/* days in a row with at least one submitted check-in (not the score, not the below-green streak) */
// Works out that streak for a patient
const streakOf = p => window.checkinStreak(p.series.map(x => ({ d: iso(x.d), ci: x.ci })), iso(TODAY));

// A chat box above the chart. It is not connected to anything yet, so nothing is sent or answered
/* Chat panel above the graph. Not connected: the server has no chat service, so nothing is sent, answered or saved. */
// Builds the chat box
function chatHTML() {
  return `<section class="card chatpanel" id="chatPanel" aria-label="Assistant chat" style="width:0;min-width:100%;padding:0;overflow:hidden;display:flex;flex-direction:column;height:${store.get('chatH', 200)}px;min-height:150px">
    <div class="row between" style="padding:var(--s4) var(--s5) 0"><h2 class="sh">Assistant chat</h2><span class="pill">${ic('info', 'sm')}Not connected</span></div>
    <div style="flex:1;overflow:auto;padding:var(--s3) var(--s5)"><p class="muted" style="font-size:var(--t-sm)">Chat is not connected. Nothing typed here is sent or saved.</p></div>
    <div class="row" style="gap:var(--s2);padding:0 var(--s5) var(--s3)"><label class="sr" for="chatIn">Message</label><input class="input" id="chatIn" disabled placeholder="Chat is not available yet" style="flex:1;min-width:0"><button type="button" class="btn primary" disabled>Send</button></div>
    <button type="button" class="lgrip" id="cgrip" aria-label="Make the chat taller or shorter. Drag, or use the up and down arrow keys." title="Drag to make the chat taller or shorter. Double-click to reset."><span></span></button></section>`;
}
// Lets the chat box be made taller or shorter by dragging its handle or using the arrow keys
function mountChat(root) {
  const box = $('#chatPanel', root), grip = $('#cgrip', root); if (!box || !grip) return;
  const MIN = 150, MAX = 520; let h = store.get('chatH', 200), d = null;
  const apply = () => { h = clamp(Math.round(h), MIN, MAX); box.style.height = h + 'px'; };
  const end = () => { if (!d) return; d = null; box.classList.remove('resizing'); store.set('chatH', h); };
  grip.addEventListener('pointerdown', e => { e.preventDefault(); grip.setPointerCapture(e.pointerId); d = { y: e.clientY, h: box.getBoundingClientRect().height }; box.classList.add('resizing'); });
  grip.addEventListener('pointermove', e => { if (!d) return; h = d.h + e.clientY - d.y; apply(); });
  grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
  grip.addEventListener('dblclick', () => { h = 200; apply(); store.set('chatH', h); });
  grip.addEventListener('keydown', e => { const dy = { ArrowDown: 48, ArrowUp: -48 }[e.key]; if (!dy) return; e.preventDefault(); h = box.getBoundingClientRect().height + dy; apply(); store.set('chatH', h); });
}

// The small bar and number shown for an area that is switched on
/* one card's summary while it is on: average lifestyle score for the week, with its change on the same scale */
const cardSummary = (p, d) => {
  // Collect what the page needs: the week numbers, the patient's first day and the streak
  const W = weekData(p), wd = W.doms.find(x => x.id === d.id) || {}, v = wd.avg, pv = wd.pavg;
  return `<div class="dsum"><div class="track" style="--gz:${HK.config.greenZone ?? 70}%" role="img" aria-label="${d.name}: ${v == null ? 'no scored days' : fmtG(pctToG(v)) + ' on a scale of −10 to +10'}"><i style="width:${v == null ? 0 : Math.max(0, Math.min(100, v))}%"></i></div><span class="dval num">${v == null ? 'No scored days' : fmtG(pctToG(v))}${v != null && pv != null ? deltaHTML(pctDiffToG(v - pv), ' pts', 'Change in points compared with ' + W.prange, 'compared with ' + W.prange) : ''}</span></div>`;
};

// The patient page itself
route(/^\/provider\/patient\/([^/?#]+)$/, id => {
  const p = PAT[id];
  if (!p) return noPatientView(id);
  const W = weekData(p), first = p.series[0].d, sk = streakOf(p);
  // Build the rows for the list of areas
  const rows = DOMAINS.map(d => domainRowHTML(p, d, p.unlocked.includes(d.id), p.unlocked.includes(d.id) ? cardSummary(p, d) : '')).join('');
  // Build the whole page: header, notices, chart, snapshot, areas and recent answers
  const html = providerShell(`
    <div><a class="link" href="#/provider">${ic('arrow-left', 'sm')} Back to patients</a></div>
    <header class="pp-head">
      <span class="avatar lg" data-tone="${hashStr(p.id) % 4}" aria-hidden="true">${initials(p.name)}</span>
      <div class="grow"><h1>${esc(p.name)}</h1>
        <div class="pp-meta">${statusPill(p)}<span>Enrolled ${fmtDY(first)}</span><span>Last check-in: ${esc(p.lastCheckin)}</span></div></div>
      <a class="btn" href="#/provider/patient/${p.id}/report" aria-label="Weekly report">${ic('file-text')}<span>Weekly report</span></a>
    </header>
    ${p.status === 'attention' ? `<div class="notice warn">${ic('triangle-alert')}<span><b>Needs attention.</b> ${window.belowText(p.backend.streak)} <a href="#/provider/patient/${p.id}/report">Weekly report</a></span></div>` : ''}
    <div class="pp-grid"><div class="pp-main" style="flex:none;max-width:100%;min-width:0;display:flex;flex-direction:column;gap:var(--s4)">${chatHTML()}<div id="chartHost"></div></div></div>
    <div class="pp-lower">
      <div class="pp-side2" style="min-width:0;display:flex;flex-direction:column;gap:var(--s4)">
      <div class="card snap2"><div class="row between" style="margin-bottom:var(--s2)"><h2 class="sh">Snapshot</h2></div>
        <div class="stiles">
          <div class="st"><span class="sl">Domains on</span><b class="num" id="cardsOn">${p.unlocked.length} of 6</b></div>
          <div class="st"><span class="sl">Check-in streak${infoBtn('Check-in streak', ['Days in a row with at least one submitted check-in (morning or evening), counting back from today, or from yesterday if today has none yet.', 'It does not use the lifestyle score and is not the below-green-zone count.'])}</span><b class="num">${sk} day${sk === 1 ? '' : 's'}</b></div>
          <div class="st"><span class="sl">Latest full day</span><b class="num">${p.backend && p.backend.lastFull && p.backend.lastFull.graph_value != null ? fmtG(p.backend.lastFull.graph_value) : '—'}</b>${p.backend && p.backend.lastFull ? `<small>${fmtD(parseISO(p.backend.lastFull.date))}</small>` : ''}</div>
          <div class="st"><span class="sl" title="Consecutive finished days below the green zone">Below green zone</span><b class="num">${p.backend && p.backend.streak ? p.backend.streak + ' day' + (p.backend.streak === 1 ? '' : 's') : 'None'}</b></div>
        </div></div>
      <div class="card"><div class="row between" style="margin-bottom:var(--s2)"><h2 class="sh">Domains</h2>${infoBtn('Domains', [`Each bar is the domain’s average lifestyle score for ${W.range}, from −10 to +10. The green mark is where the green zone starts (${fmtG(HK.config.greenGraph ?? 4)}). Arrows compare with ${W.prange}.`, 'Switches save right away. A change starts today, and earlier days keep the domains they had. The General domain is always on.'])}</div>
        <div class="dlist" id="dlist">${rows}</div><span class="sr dlive" aria-live="polite"></span></div>
      </div>
      <div class="card"><div class="row between" style="margin-bottom:var(--s3)"><h2 class="sh">Recent responses</h2><a class="link" href="#/provider/patient/${p.id}/report">Weekly report</a></div><ul class="ci" id="recentCi"><li class="muted">Loading…</li></ul></div>
    </div>`);
  // Keep the chart so it can be redrawn or removed
  let chart, root0;
  // Draws (or redraws) the score chart
  const drawChart = () => { chart && chart.destroy(); chart = mountScoreChart($('#chartHost', root0), PAT[id]); };
  return {
    // "html" is the page; "mount" turns on the chart, chat, info buttons and area switches
    html, mount(root) {
      root0 = root; mountShell(root); mountChat(root); bindInfo(root); drawChart();
      // Turn on the area switches; when one is saved, update the count and redraw the chart
      mountDomainControls($('#dlist', root).parentElement, p, {
        summary: (q, d, isOn) => isOn ? cardSummary(q, d) : '',
        saved: () => { const q = PAT[id]; $('#cardsOn', root).textContent = `${q.unlocked.length} of 6`; drawChart(); },
      });
      // Load recent written answers and show them (or a short message if they cannot load)
      window.HKL.insights(p, 4).then(r => { const ul = $('#recentCi', root); if (ul) ul.innerHTML = wordsHTML(r.words, 4); })
        .catch(() => { const ul = $('#recentCi', root); if (ul) ul.innerHTML = '<li class="muted">Could not load responses.</li>'; });
    }, cleanup() { chart && chart.destroy(); }
  };
}, 'patient-page');
