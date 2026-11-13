// WHAT THIS FILE DOES
// Draws the big lifestyle score chart (the line graph with a score for each day). It builds the chart from the numbers the
// server gives us, lets you switch the time range (1 day, 7 days, 1 month and so on), zoom, hover over points, see a
// table version, and click a point to see what changed. The practitioner pages use it for each patient.
/* ===== Lifestyle score chart: hand-built SVG, stock-market style, resizable, zoomable, with custom date range ===== */
// Smallest and default chart size, and the list of time ranges you can pick
const CHART_MIN = { w: 380, h: 360 }, CHART_DEF = { w: 640, h: 500 };
const RANGES = ['1D', '7D', '1M', '6M', '1Y'], RANGE_FIX = { '5D': '7D', 'Y': '1Y', '5Y': '1Y' };
// Small helpers for dates and times
const dateAt = (d, h) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(h), Math.round((h % 1) * 60));
const fmtTime = h => { const hh = Math.floor(h), mm = Math.round((h % 1) * 60); return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`; };
// Picks tidy numbers to label the side of the chart (like 0, 20, 40, 60, 80, 100)
function niceTicks(lo, hi, n) {
  const step0 = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(step0))), norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag, out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}
// The lowest and highest score the chart can show
const GRAPH_LO = () => (HK.config.graphMin ?? 0), GRAPH_HI = () => (HK.config.graphMax ?? 100), GREEN_AT = () => (HK.config.greenGraph ?? 70);
/* a lifestyle score (0 to 100) shown as a whole number */
const fmtG = v => v == null ? '--' : String(Math.round(v));
/* a change in score points, always with its sign: +4, 0, −2.5 */
const fmtGd = v => { if (v == null) return '--'; const r = Math.round(v * 10) / 10; return (r > 0 ? '+' : r < 0 ? '−' : '') + String(Math.abs(r)); };
/* what to say about a day's check-ins, from the periods the server lists as submitted */
/* what is still missing today, in a few words (roster, patient header). Today is judged only by the periods the server lists as submitted */
// Short text for what a patient still has to check in today
function todayWait(s) { return window.todayWaitText((s && s.ci) || []); }
// Short text for what happened with the check-ins on one day
function dayNote(s) {
  const ci = s.ci || [], am = ci.includes('morning'), pm = ci.includes('evening');
  if (s.prov) return am && pm ? 'Both check-ins are in. The day is not finished' : todayWait(s);
  return am && pm ? '' : am ? 'Evening check-in not submitted' : pm ? 'Morning check-in not submitted' : 'No check-in submitted';
}
// Looks up the score (or lifestyle score) for one day
function scoreOn(p, d) { const s = p.series.find(x => sameDay(x.d, d)); return s ? s.score : null; }
function graphOn(p, d) { const s = p.series.find(x => sameDay(x.d, d)); return s ? s.g : null; }
// Looks up the most recent earlier day that has a score
function lastBefore(p, d) { for (let i = p.series.length - 1; i >= 0; i--) if (p.series[i].d < d && p.series[i].score != null) return p.series[i].score; return null; }
function lastDayBefore(p, d) { for (let i = p.series.length - 1; i >= 0; i--) if (p.series[i].d < d && p.series[i].score != null) return p.series[i]; return null; }

/* what a patient did on one day, in order. The 1D chart and the "last check-in" shown in lists both come from here, so they always agree */
// Gets what the patient did on one day, in order
function dayEvents(p, date) { return HK.provider.dayEvents(p, date); }
// Works out when the patient last checked in, for the lists
function syncLastActiveOne(p) {
  if (!p.lastDate || p.daysSince > 1 || !p.unlocked) return;
  const real = dayEvents(p, p.lastDate).ev.filter(e => e[2] !== null || e[1] !== 'Woke up'); if (!real.length) return;
  p.lastActive = (p.daysSince === 0 ? 'Today, ' : 'Yesterday, ') + fmtTime(Math.max(...real.map(e => e[0])));
}
const syncLastActive = () => PATIENTS.forEach(syncLastActiveOne);

/* 1D: the running score through one day (starts at the previous day's close, like a stock chart) */
// Builds the points for the 1 day view
function intradayView(p, date, label) {
  const final = scoreOn(p, date);
  const first = p.series[0].d;
  const base = { mode: 'event', x0: dateAt(date, 6), x1: dateAt(date, 22), label, intraday: true, tickHours: [6, 9, 12, 15, 18, 21] };
  if (final == null || date < first) return { ...base, pts: [], baseline: null, empty: date < first ? 'This day is before the patient joined.' : 'No check-ins on this day.' };
  const prev = lastBefore(p, date) ?? final;
  const { ev, r } = dayEvents(p, date);
  const m = ev.length;
  const pts = ev.map((e, i) => {
    const prog = m === 1 ? 1 : Math.pow(i / (m - 1), .85);
    let v = i === m - 1 ? final : prev + (final - prev) * prog + (i === 0 ? 0 : randn(r) * 2.4);
    v = clamp(Math.round(v * 10) / 10, 0, 100);
    return { t: dateAt(date, e[0]), v, label: e[1], sub: fmtTime(e[0]), dom: e[2] };
  });
  return { ...base, pts, baseline: prev };
}
/* 7D and short custom windows: a morning and an evening point for every day (mental health tracking has no days off) */
// Builds the points for the 7 day view (a morning and evening point each day)
function viewCheck(p, from, to, label) {
  const pts = [];
  for (let d = day0(from); d <= to; d = addDays(d, 1)) {
    const s = scoreOn(p, d), isT = sameDay(d, TODAY);
    if (s == null || d < p.series[0].d) { pts.push({ t: dateAt(d, 8.5), v: null, label: fmtDow(d), time: fmtTime(8.5), sub: 'No check-in', day: d }, { t: dateAt(d, 19.5), v: null, label: fmtDow(d), time: fmtTime(19.5), sub: 'No check-in', day: d }); continue; }
    const prev = lastBefore(p, d), rr = rng(hashStr(p.id + 'am' + iso(d)));
    const am = prev == null ? s - 20 : prev + (s - prev) * .4 + randn(rr) * 1.6;
    pts.push({ t: dateAt(d, 8.5), v: clamp(Math.round(am * 10) / 10, 0, 100), label: fmtDow(d), time: fmtTime(8.5), sub: 'After the morning check-in', day: d, part: 'am' });
    pts.push({ t: dateAt(d, 19.5), v: s, label: fmtDow(d), time: fmtTime(19.5), sub: isT ? 'Score so far today' : 'End of day score', day: d, part: 'pm' });
  }
  return { mode: 'check', pts, label, x0: dateAt(day0(from), 0), x1: dateAt(to, 24), baseline: null };
}
// Builds the points for longer ranges, one per day
function dailyView(p, from, to, label) {
  return { mode: 'day', label, x0: from, x1: to, baseline: null, pts: p.series.filter(s => s.d >= from && s.d <= to).map(s => ({ t: s.d, v: s.g, rv: s.rg, label: fmtDow(s.d), sub: s.score == null && !s.prov ? 'No graded questions on this day' : dayNote(s), day: s.d, prov: !!s.prov })) };
}
// Builds the points for long ranges by grouping days into weeks or months
function bucketView(p, from, to, mode, label) {
  const pts = [];
  const mk = (a, b, name) => {
    const days = p.series.filter(s => s.d >= a && s.d <= b), vals = days.map(x => x.g).filter(x => x != null), rvals = days.map(x => x.rg).filter(x => x != null);
    if (!days.length) return;
    pts.push({ t: addDays(a, Math.floor(dayDiff(b, a) / 2)), v: vals.length ? mean(vals) : null, rv: rvals.length ? mean(rvals) : null, label: name, sub: vals.length ? `Average of ${vals.length} day${vals.length === 1 ? '' : 's'}` : 'No scores', avg: true, a, b });
  };
  if (mode === 'week') { let end = to; while (end >= from) { const s0 = addDays(end, -6); const a = s0 < from ? from : s0; mk(a, end, `Week of ${fmtD(a)}`); end = addDays(end, -7); } pts.reverse(); }
  else {
    let y = from.getFullYear(), m = from.getMonth();
    while (y < to.getFullYear() || (y === to.getFullYear() && m <= to.getMonth())) {
      const ms = new Date(y, m, 1, 12), me = new Date(y, m + 1, 0, 12);
      mk(ms < from ? from : ms, me > to ? to : me, `${MONTHS[m]} ${y}${(y === TODAY.getFullYear() && m === TODAY.getMonth()) ? ' so far' : ''}`);
      m++; if (m > 11) { m = 0; y++; }
    }
  }
  return { mode, pts, label, x0: from, x1: to, baseline: null };
}
/* one rule for any window of days, used by Custom and by zoom */
// Picks the right view for any set of days
function windowView(p, a, b) {
  const span = dayDiff(b, a) + 1, lab = span <= 1 ? fmtDY(a) : `${fmtD(a)} to ${fmtDY(b)}`;
  const v = span <= 14 ? dailyView(p, a, b, lab) : span <= 100 ? dailyView(p, a, b, lab) : span <= 420 ? bucketView(p, a, b, 'week', lab) : bucketView(p, a, b, 'month', lab);
  v.x0 = a; v.x1 = b; return v;
}
// Builds the chart points for the range that is selected
function buildView(p, range, custom) {
  const first = p.series[0].d; let v;
  if (range === '1D') v = { mode: 'event', x0: dateAt(TODAY, 6), x1: dateAt(TODAY, 22), label: 'Today so far', intraday: true, tickHours: [6, 9, 12, 15, 18, 21], pts: [], baseline: null, empty: 'Hourly scores are not available. The server keeps one score per day.' };
  else if (range === '7D') v = dailyView(p, addDays(TODAY, -6), TODAY, 'Past 7 days');
  else if (range === 'custom' && custom) v = windowView(p, custom.a, custom.b);
  else {
    const days = { '1M': 30, '6M': 182, '1Y': 365 }[range] || 30, from = addDays(TODAY, -(days - 1));
    const label = { '1M': 'Past month', '6M': 'Past 6 months', '1Y': 'Past year' }[range] || 'Past month';
    v = range === '1Y' ? bucketView(p, from, TODAY, 'week', label) : dailyView(p, from, TODAY, label);
    if (from < first) { v.label = `Since ${fmtDY(first)}`; v.x0 = first; }
  }
  if (v.baseline == null) { const f = v.pts.find(q => q.v != null); v.baseline = f ? f.v : null; v.baselineLabel = f ? f.label : null; }
  return v;
}

/* ---- why a section changed: per-card steps for any two points (or the logged events inside a 1D window) ---- */
// Works out how much each area moved between two points
function domVec(p, q, mode) {
  const vecOf = (d, s) => s == null ? null : domainScores(p, d, s);
  if (mode === 'day') return vecOf(q.day, q.v);
  if (mode === 'check') {
    const d = q.day, cur = vecOf(d, scoreOn(p, d)); if (!cur) return null; if (q.part === 'pm') return cur;
    const pd = lastDayBefore(p, d), pv = pd ? vecOf(pd.d, pd.score) : null, out = {};
    p.unlocked.forEach(k => { out[k] = pv ? pv[k] + (cur[k] - pv[k]) * .4 : cur[k] - 20; }); return out;
  }
  const days = p.series.filter(s => s.d >= q.a && s.d <= q.b && s.score != null); if (!days.length) return null;
  const out = {}; p.unlocked.forEach(k => { out[k] = mean(days.map(s => domainScores(p, s.d, s.score)[k])); }); return out;
}
// Makes the list of areas that moved the score the most
function whyRows(p, view, A, B, lo, hi) {
  if (view.mode === 'event') {
    return view.pts.slice(lo + 1, hi + 1).map((q, i) => { const pv = view.pts[lo + i]; return { name: q.label, sub: q.sub, pts: q.v - pv.v, pct: pv.v ? (q.v - pv.v) / pv.v * 100 : 0 }; }).filter(r => Math.abs(r.pts) >= .05).sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts)).slice(0, 6);
  }
  const a = domVec(p, A, view.mode), b = domVec(p, B, view.mode); if (!a || !b) return [];
  const ks = p.unlocked.filter(k => a[k] != null && b[k] != null); if (!ks.length) return [];
  const all = B.v - A.v, raw = ks.map(k => b[k] - a[k]), shift = all - mean(raw);   /* overall = average of the cards, so the steps are shifted to add up to it */
  return ks.map((k, i) => { const d = raw[i] + shift; return { name: DOM[k].name, short: DOM[k].short, pts: d, pct: a[k] ? d / a[k] * 100 : 0 }; }).sort((x, y) => Math.abs(y.pts) - Math.abs(x.pts));
}
// Small helpers that build the text for the "what moved the score" box
const sgn = v => (v > 0 ? '+' : v < 0 ? '\u2212' : '') + Math.abs(v);
const totalHTML = (view, A, B) => { const d = B.v - A.v, pct = A.v ? d / A.v * 100 : 0, c = Math.round(d) > 0 ? 'up' : Math.round(d) < 0 ? 'down' : 'flat'; return `<div class="wr total ${c}"><b>${sgn(Math.round(pct))}%</b><span>${view.mode === 'event' ? 'Total change' : 'Overall (average of the cards)'}</span><em>${sgn(Math.round(d))} pts</em></div>`; };
const whyHTML = (rows, short) => rows.map(r => { const up = Math.round(r.pts) > 0, dn = Math.round(r.pts) < 0, s = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
  return `<div class="wr ${up ? 'up' : dn ? 'down' : 'flat'}"><b>${s(Math.round(r.pct))}%</b><span>${esc(short && r.short ? r.short : r.name)}</span><em>${s(Math.round(r.pts))} pts</em></div>`; }).join('');

/* One day, point by point: GET /patients/{id}/scores/{day} gives the points earned on every question. */
// Pop-up with one day's score broken down question by question (loaded from the server)
function dayDialog(p, q) {
  if (!q || !q.day) return;
  const H = window.HKL, key = iso(q.day), byId = Object.fromEntries((HK.data.questions || []).map(x => [x.id, x]));
  const domName = d => d === 'general' ? 'General' : (DOM[H.DOMAIN_TO_CARD[d]] || { name: d }).name;
  openDialog(`<div class="qlist-dlg"><div class="row between"><h2>${esc(fmtDow(q.day))}</h2><button class="btn icon sm" data-close aria-label="Close">${ic('x')}</button></div>
    <div id="ddbody"><p class="muted">Loading…</p></div>
    <div class="row end" style="margin-top:var(--s4)"><button class="btn primary" data-close>Done</button></div></div>`,
  { label: 'Score detail for ' + key, wide: true, onMount(dlg) {
    H.dayScore(p.backend.patientId, key).then(r => {
      const rows = r.items.map(it => { const qq = byId[it.question_id] || {}; const ans = it.answer == null || it.answer === '' ? 'No answer' : Array.isArray(it.answer) ? it.answer.join(', ') : String(it.answer);
        return `<tr><td>${esc(qq.text || it.question_id)}<br><small class="muted">${esc(domName(it.domain))}</small></td><td>${esc(ans)}</td><td class="num">${(+it.points > 0 ? '+' : '') + ((+it.points).toFixed(2).replace(/\.?0+$/, '') || '0')}</td></tr>`; }).join('');
      $('#ddbody', dlg).innerHTML = `<p class="ink2" style="margin:var(--s2) 0 var(--s3)">Lifestyle score <b class="num">${r.graph_value == null ? '--' : fmtG(r.graph_value)}</b> on a scale of 0 to 100. ${(() => { const q = { ci: r.checkins_done || [], prov: !!r.in_progress }; return dayNote(q); })()}${r.in_progress ? '. Questions not answered yet count as zero for now.' : ''}</p>
        ${rows ? `<table class="daytbl"><thead><tr><th>Question</th><th>Answer</th><th>Points (−1 to +1)</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">No graded questions on this day.</p>'}`;
    }).catch(e => { $('#ddbody', dlg).innerHTML = `<p class="muted">${esc(e.message || 'Could not load this day.')}</p>`; });
  } });
}

/* A 7-day average point: its date, value and window. It is not a one-day breakdown. */
// Pop-up for a 7 day average point
function rollDialog(p, q) {
  const n = HK.config.rollingDays ?? 7, enrolled = parseISO(p.enrolledOn); let a = addDays(q.day, -(n - 1)); if (a < enrolled) a = enrolled;
  openDialog(`<div class="qlist-dlg"><div class="row between"><h2>7-day average</h2><button class="btn icon sm" data-close aria-label="Close">${ic('x')}</button></div>
    <p class="ink2" style="margin:var(--s2) 0">${esc(fmtDow(q.day))}: <b class="num">${fmtG(q.rv)}</b> on a scale of 0 to 100.</p>
    <p class="ink2" style="margin:0 0 var(--s3)">The average of the scored days from ${fmtD(a)} to ${fmtD(q.day)}${q.prov ? ', including today so far' : ''}. It is not one day’s breakdown. Select the daily point to see that day’s questions.</p>
    <div class="row end"><button class="btn primary" data-close>Done</button></div></div>`, { label: '7-day average for ' + iso(q.day) });
}

/* opts.fixed = { a, b }: show only those dates (the weekly report). The date range and zoom controls are hidden and the grip resizes width only, within opts.maxW(). */
/* every mark the report chart draws, drawn with the chart's own classes so the key always matches */
// Pop-up that explains each mark on the chart (the key)
function graphKeyDialog() {
  const sw = inner => `<svg class="gk-sw" viewBox="0 0 40 18" aria-hidden="true" focusable="false">${inner}</svg>`;
  const rows = [
    [sw('<path d="M3 13 L20 6 L37 9" class="cline"/><circle cx="20" cy="6" r="3.5" class="cpt"/>'), 'Daily score', 'One score per day, 0 to 100'],
    [sw('<path d="M3 10 H37" class="croll"/><circle cx="20" cy="10" r="3.5" class="crpt"/>'), '7-day average', 'Average of the 7 days ending on each date'],
    [sw('<rect x="3" y="3" width="34" height="9" class="cgz"/><path d="M3 12 H37" class="cgzl"/>'), 'Green zone', `${fmtG(GREEN_AT())} to 100. The dashed line marks where it starts`],
    [sw('<path d="M3 9 H37" class="cbase"/>'), 'First day’s score', 'The change above the chart is measured from this line'],
    [sw('<path d="M6 13 L32 6" class="cdash"/><circle cx="32" cy="6" r="3.5" class="cprov"/>'), 'Today, not final', 'Can change until the day ends'],
    [sw('<circle cx="20" cy="9" r="5" class="cend"/>'), 'Latest finished day', 'The most recent full day'],
    [sw('<path d="M3 15 H37" class="cax"/><path d="M20 7 V15" class="cmiss"/>'), 'No score that day', 'Short mark on the bottom axis'],
    [sw('<rect x="8" y="2" width="24" height="14" rx="3" class="gk-sel"/>'), 'Measured section', 'Drag across the chart, then Clear'],
  ];
  openDialog(`<div class="gk"><div class="row between"><h2>Graph key</h2><button type="button" class="btn icon sm" data-close aria-label="Close">${ic('x')}</button></div>
    <ul class="gk-list">${rows.map(([s2, t, d]) => `<li>${s2}<span><b>${t}</b><small>${d}</small></span></li>`).join('')}</ul>
    <div class="row end"><button type="button" class="btn primary" data-close>Done</button></div></div>`, { label: 'Graph key' });
}

// Puts the whole chart on the page. Everything below belongs to this one chart
function mountScoreChart(host, p, opts = {}) {
  const FIX = opts.fixed || null;
  const saved = FIX ? { w: opts.w || CHART_DEF.w, h: opts.h || 440 } : store.get('chartSize', CHART_DEF);
  const r0 = store.get('chartRange', '1M'); let range = RANGE_FIX[r0] || r0; if (!RANGES.includes(range) || range === '1D') range = '1M';
  let custom = null, view = null, tableMode = false, hover = -1, sel = null, drag = null, whyPos = null, wmove = null, whyClosed = false, size = { w: saved.w, h: saved.h };
  const FIRST = day0(p.series[0].d);
  host.innerHTML = `<section class="chartcard${FIX ? ' fixed' : ''}" aria-label="Lifestyle score chart">
    <header class="ch-head"><div class="ch-title"><h2>Lifestyle score</h2><button type="button" class="btn icon sm" data-info aria-label="How is the lifestyle score calculated?">${ic('info')}</button><button type="button" class="btn sm" id="chKeyBtn" aria-haspopup="dialog">Graph key</button><button type="button" class="btn sm" id="chTblBtn">${ic('table-2', 'sm')}<span>Table view</span></button></div>
      <div class="ch-right"><div class="seg sm" id="ranges" role="group" aria-label="Date range">${RANGES.map(r => `<button type="button" data-r="${r}" aria-pressed="false"${r === '1D' ? ' disabled style="opacity:.45;cursor:not-allowed" title="Not available: there is one score per day"' : ''}>${r}</button>`).join('')}<button type="button" data-r="custom" aria-pressed="false">Custom</button></div>
        <div class="zoomctl" role="group" aria-label="Zoom the chart"><button type="button" class="btn icon sm" id="zOut" aria-label="Zoom out" title="Zoom out (Ctrl + scroll down)">${ic('minus', 'sm')}</button><button type="button" class="btn icon sm" id="zIn" aria-label="Zoom in" title="Zoom in (Ctrl + scroll up)">${ic('plus', 'sm')}</button></div></div></header>
    <div class="ch-read" aria-live="polite"><div class="big"><span id="chVal" class="num">--</span><span class="outof" id="chOut">Lifestyle score, 0 to 100</span></div><div class="meta"><span id="chDelta"></span><span id="chWhen" class="muted"></span></div><div class="selacts hide" id="selActs"><button type="button" class="btn sm" id="selZoom">Zoom to this range</button><button type="button" class="btn sm" id="selClear">Clear</button></div></div>
    <div class="ch-body"><div class="ch-plot" id="chPlot" tabindex="0" role="application" aria-label="Lifestyle score chart. Left and right arrows move between days, up and down arrows switch between daily score and 7-day average, Enter opens details."><div class="ch-svg"></div><div class="selband hide" id="selBand"></div><div class="selwhy hide" id="selWhy"></div><div class="tip hide" id="chTip"></div><div class="ch-empty hide" id="chEmpty"></div></div><div class="ch-table hide" id="chTable"></div></div>
    <footer class="ch-foot"><span class="key" id="chKey"><span class="kitem hint">Click a day to see what counted. Drag across the chart to measure a section</span></span></footer>
    <button type="button" class="grip" id="grip" aria-label="Resize chart: drag, or use the arrow keys" title="Drag to resize. Double-click to reset.">
      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M17 5 5 17M17 11 11 17M17 16.5 16.5 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></section>`;
  const card = $('.chartcard', host), plot = $('#chPlot', host), svgBox = $('.ch-svg', host), tip = $('#chTip', host), emptyEl = $('#chEmpty', host), table = $('#chTable', host);
  /* report: the grip sets the wanted size; the page width only limits what is shown, so a narrow window never shrinks it for good */
  const want = { w: size.w, h: size.h };
  const applySize = () => { if (FIX) { if (card.classList.contains('resizing')) { want.w = size.w; want.h = size.h; } else { size.w = want.w; size.h = want.h; } } const mw = FIX && opts.maxW ? opts.maxW() : ((host.closest('.pp-grid') || host.parentElement) || {}).clientWidth || 1200; size.w = clamp(size.w, Math.min(CHART_MIN.w, mw), mw); size.h = clamp(size.h, CHART_MIN.h, 940); card.style.width = size.w + 'px'; if (FIX) { card.style.height = 'auto'; card.style.minHeight = size.h + 'px'; } else card.style.height = size.h + 'px';   /* report: the card grows if the plot would drop below its minimum */  if (opts.onSize) opts.onSize(size.w); };
  applySize();

  /* ---- readout (big number + change, like a stock header) ---- */
  // The big number and change shown above the chart
  const ptLab = q => view.mode === 'event' ? q.sub : view.mode === 'check' ? `${q.label}, ${q.time}` : q.label;
  const zoomable = () => ['day', 'week', 'month', 'check'].includes(view.mode);
  function renderSel() {
    const lo = Math.min(sel.a, sel.b), hi = Math.max(sel.a, sel.b), A = view.pts[lo], B = view.pts[hi];
    const d = B.v - A.v, rd = Math.round(d * 10) / 10, cls = rd > 0 ? 'up' : rd < 0 ? 'down' : 'flat';
    $('#chVal', host).textContent = fmtGd(d); $('#chOut', host).textContent = 'points';
    const dEl = $('#chDelta', host); dEl.className = 'delta ' + cls;
    dEl.innerHTML = `${ic(cls === 'up' ? 'trending-up' : cls === 'down' ? 'trending-down' : 'minus', 'sm')}<span>from ${fmtG(A.v)} to ${fmtG(B.v)}</span>`;
    const days = view.mode === 'event' ? 0 : Math.max(1, Math.round((B.t - A.t) / DAY));
    $('#chWhen', host).textContent = `Selected: ${ptLab(A)} to ${ptLab(B)}${days ? `, ${days} day${days === 1 ? '' : 's'}` : ''}`;
    $('#selActs', host).classList.remove('hide'); $('#selZoom', host).classList.toggle('hide', !(zoomable() && days >= 1 && (view.mode !== 'check' || dayDiff(day0(B.t), day0(A.t)) >= 1)));
  }
  const topEdge = () => { const pb = document.getElementById('proto'); return pb ? pb.getBoundingClientRect().bottom + 2 : 0; };   /* never slides under the top bar */
  // Puts the "what moved the score" box in the right spot
  function positionBand() {
    const bd = $('#selBand', host), wy = $('#selWhy', host);
    if (!sel || !plot._m) { bd.classList.add('hide'); wy.classList.add('hide'); return; }
    const lo = Math.min(sel.a, sel.b), hi = Math.max(sel.a, sel.b), A = view.pts[lo], B = view.pts[hi]; if (!A || !B || A.x == null) { bd.classList.add('hide'); wy.classList.add('hide'); return; }
    const M = plot._m.M, bw = Math.max(2, B.x - A.x); bd.classList.remove('hide'); bd.style.left = A.x + 'px'; bd.style.width = bw + 'px'; bd.style.top = M.t + 'px'; bd.style.height = plot._m.ih + 'px';
    const rows = [];
    if (!rows.length || whyClosed) { wy.classList.add('hide'); return; }
    /* the box is one floating card: it starts inside the highlighted area and can be dragged anywhere on the screen */
    wy.innerHTML = `<div class="wtitle"><span>What moved the score</span><span class="wdrag" aria-hidden="true">Drag to move</span><button type="button" class="wclose" aria-label="Close this box" title="Close">\u00d7</button></div>${whyHTML(rows, false)}${totalHTML(view, A, B)}`;
    wy.classList.remove('hide'); wy.style.width = '300px';
    const pr = plot.getBoundingClientRect(), w = wy.offsetWidth, h = wy.offsetHeight;
    let x, y;
    if (whyPos) { x = whyPos.x; y = whyPos.y; }
    else { x = pr.left + A.x + 8; y = pr.top + M.t + plot._m.ih - h - 8; if (y < pr.top + M.t) y = pr.top + M.t + 4; }
    wy.style.left = clamp(x, 0, Math.max(0, innerWidth - w)) + 'px'; wy.style.top = clamp(y, topEdge(), Math.max(topEdge(), innerHeight - h)) + 'px';
  }
  function clearSel() { if (!sel) return; sel = null; whyPos = null; whyClosed = false; positionBand(); $('#selActs', host).classList.add('hide'); setRead(null); }
  const setRead = q => {
    if (!q && sel) { renderSel(); return; }
    $('#chOut', host).textContent = 'Lifestyle score, 0 to 100'; $('#selActs', host).classList.add('hide');
    const have = view.pts.filter(x => x.v != null), cur = q || [...have].reverse().find(x => !x.prov) || have[have.length - 1];
    $('#chVal', host).textContent = cur ? fmtG(cur.v) : '--';
    const dEl = $('#chDelta', host);
    if (cur && view.baseline != null) {
      const d = cur.v - view.baseline, cls = d > .05 ? 'up' : d < -.05 ? 'down' : 'flat';
      dEl.className = 'delta ' + cls;
      const rd = Math.round(d * 10) / 10; dEl.innerHTML = `${ic(cls === 'up' ? 'trending-up' : cls === 'down' ? 'trending-down' : 'minus', 'sm')}<span>${rd === 0 ? 'No change' : `${fmtG(d)} points`} since ${esc(view.baselineLabel || 'the start')}</span>`;
    } else { dEl.className = 'delta flat'; dEl.textContent = ''; }
    $('#chWhen', host).textContent = q ? (view.mode === 'event' ? `${q.label}, ${q.sub}` : view.mode === 'check' ? `${q.label}, ${q.time}` : q.label) : view.label + (view.intraday ? '' : ', compared with the first scored day in this range');
  };

  /* ---- the x axis: a small tick for every data point (every hour on 1D, every day boundary on 7D), labels on some, chosen to fit ---- */
  // Works out the labels along the bottom of the chart
  function axisFor(view, X, iw, W) {
    const minor = [], labels = [], px = t => +X(+t);
    if (view.intraday) {
      for (let h = 6; h <= 22; h++) minor.push({ x: px(dateAt(view.x0, h)), major: view.tickHours.includes(h) });
      view.tickHours.forEach(h => labels.push({ x: px(dateAt(view.x0, h)), text: h === 12 ? '12 PM' : h < 12 ? h + ' AM' : (h - 12) + ' PM' }));
    } else if (view.mode === 'check') {
      const a = day0(new Date(+view.x0)), n = dayDiff(day0(new Date(+view.x1 - 1)), a) + 1, k = Math.max(1, Math.ceil(58 / (iw / n)));
      for (let i = 0; i <= n; i++) minor.push({ x: px(dateAt(addDays(a, i), 0)), major: false });
      for (let i = 0; i < n; i++) if ((n - 1 - i) % k === 0) { const d = addDays(a, i); labels.push({ x: px(dateAt(d, 12)), text: `${DOW[d.getDay()]} ${d.getDate()}` }); }
    } else {
      const n = view.pts.length; if (!n) return { minor, labels };
      const gap = view.mode === 'day' ? 62 : 78, step = n > 1 ? iw / (n - 1) : iw, k = Math.max(1, Math.ceil(gap / step)); let lastYear = null;
      view.pts.forEach((q, i) => {
        const on = (n - 1 - i) % k === 0; minor.push({ x: q.x, major: on }); if (!on) return;
        let text;
        if (view.mode === 'day') text = n <= 14 ? `${DOW[q.t.getDay()]} ${q.t.getDate()}` : fmtD(q.t);
        else if (view.mode === 'week') { const d = q.a, yr = d.getFullYear(); text = `${MON[d.getMonth()]} ${d.getDate()}${yr !== lastYear && lastYear !== null ? ' ’' + String(yr).slice(2) : ''}`; lastYear = yr; }
        else text = `${MON[q.t.getMonth()]} ${q.t.getFullYear()}`;
        labels.push({ x: q.x, text });
      });
    }
    return { minor, labels };
  }

  /* ---- draw ---- */
  // Draws the chart: lines, dots, labels and the green zone
  function draw() {
    view = FIX ? buildView(p, 'custom', FIX) : buildView(p, range, custom);
    if (sel && (!view.pts[sel.a] || !view.pts[sel.b] || view.pts[sel.a].v == null || view.pts[sel.b].v == null)) sel = null;
    $$('#ranges button', host).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.r === range)));
    const win = curWindow(); $('#zIn', host).disabled = dayDiff(win.b, win.a) + 1 <= 1; $('#zOut', host).disabled = win.a <= FIRST && win.b >= TODAY;
    const pts = view.pts, have = pts.filter(q => q.v != null);
    const W = plot.clientWidth, H = plot.clientHeight;
    emptyEl.classList.toggle('hide', !!have.length);
    if (!have.length) { emptyEl.innerHTML = `<b>No data to show</b><span>${esc(view.empty || 'No check-ins in this range. Try a longer range.')}</span>`; }
    setRead(null);
    $('#chPlot', host).setAttribute('aria-label', have.length ? `Lifestyle score from 0 to 100, ${view.label}. Starts at ${fmtG(view.baseline)}, ends at ${fmtG(have[have.length - 1].v)}, high ${fmtG(Math.max(...have.map(q => q.v)))}, low ${fmtG(Math.min(...have.map(q => q.v)))}. Use the table view for every value.` : 'No data in this range');
    buildTable();
    if (W < 60 || H < 60) return;
    const M = { l: 40, r: 18, t: 12, b: 30 }, iw = W - M.l - M.r, ih = H - M.t - M.b;
    const t0 = +view.x0, t1 = +view.x1, X = t => M.l + 6 + (t1 === t0 ? (iw - 12) / 2 : (t - t0) / (t1 - t0) * (iw - 12));
    const lo = GRAPH_LO(), hi = GRAPH_HI();
    const Y = v => M.t + (1 - (v - lo) / (hi - lo)) * ih, yb = M.t + ih;
    pts.forEach(q => { q.x = X(+q.t); q.y = q.v == null ? null : Y(q.v); });
    const ticks = [0, 20, 40, 60, 80, 100].filter(v => v >= lo && v <= hi), gz = GREEN_AT(), gzTop = Y(hi), gzBot = Y(gz);
    let rline = ''; pts.forEach((q, i) => { if (q.rv == null) return; rline += (pts[i - 1] && pts[i - 1].rv != null ? 'L' : 'M') + q.x.toFixed(1) + ' ' + Y(q.rv).toFixed(1); });
    let line = '', area = '', dash = '', segPts = [];
    const closeSeg = () => { if (segPts.length > 2) area += `M${segPts[0][0].toFixed(1)} ${yb}` + segPts.map(a => `L${a[0].toFixed(1)} ${a[1].toFixed(1)}`).join('') + `L${segPts[segPts.length - 1][0].toFixed(1)} ${yb}Z`; segPts = []; };
    let lastValid = null;
    pts.forEach((q, i) => {
      if (q.v == null) { if (pts[i - 1] && pts[i - 1].v != null) closeSeg(); return; }
      if (q.prov) { closeSeg(); if (lastValid) dash += `M${lastValid.x.toFixed(1)} ${lastValid.y.toFixed(1)}L${q.x.toFixed(1)} ${q.y.toFixed(1)}`; return; }
      const first = !pts[i - 1] || pts[i - 1].v == null;
      if (first) { line += `M${q.x.toFixed(1)} ${q.y.toFixed(1)}`; if (lastValid) dash += `M${lastValid.x.toFixed(1)} ${lastValid.y.toFixed(1)}L${q.x.toFixed(1)} ${q.y.toFixed(1)}`; }
      else line += `L${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
      segPts.push([q.x, q.y]); lastValid = q;
    });
    closeSeg();
    const ax = axisFor(view, X, iw, W);
    /* missed check-ins: a short mark on the baseline (one per missed day, even when a day has a morning and an evening slot) */
    const missX = []; pts.forEach((q, i) => { if (q.v != null) return; if (view.mode === 'check') { if (!q.part && pts[i - 1] && pts[i - 1].day && sameDay(pts[i - 1].day, q.day) && pts[i - 1].v == null) return; missX.push(X(+dateAt(q.day, 12))); } else missX.push(q.x); });
    const last = [...have].reverse().find(q => !q.prov), dots = view.mode === 'check' || view.mode === 'event' || have.length <= 40;
    const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">
      <rect x="${M.l}" y="${gzTop.toFixed(1)}" width="${W - M.l - M.r}" height="${(gzBot - gzTop).toFixed(1)}" class="cgz"/>
      <line x1="${M.l}" x2="${W - M.r}" y1="${gzBot.toFixed(1)}" y2="${gzBot.toFixed(1)}" class="cgzl"/>
      <text x="${W - M.r - 6}" y="${(gzTop + 14).toFixed(1)}" text-anchor="end" class="ct gzl">Green zone (${fmtG(gz)} to 100)</text>
      ${ticks.map(v => `<line x1="${M.l}" x2="${W - M.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="cg"/><text x="${M.l - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" class="ct">${v}</text>`).join('')}
      ${lo < 0 && hi > 0 ? `<line x1="${M.l}" x2="${W - M.r}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" class="cax"/>` : ''}
      <line x1="${M.l}" x2="${W - M.r}" y1="${yb}" y2="${yb}" class="cax"/>
      ${ax.minor.map(m => `<line x1="${m.x.toFixed(1)}" x2="${m.x.toFixed(1)}" y1="${yb - 3}" y2="${yb + (m.major ? 6 : 4)}" class="ctk${m.major ? ' maj' : ''}"/>`).join('')}
      ${ax.labels.map((l, i) => { const w = l.text.length * 6.4, a = l.x - w / 2 < 2 ? 'start' : l.x + w / 2 > W - 2 ? 'end' : 'middle'; return `<text x="${(a === 'start' ? Math.max(2, l.x - 2) : a === 'end' ? Math.min(W - 2, l.x + 2) : l.x).toFixed(1)}" y="${H - 6}" text-anchor="${a}" class="ct">${l.text}</text>`; }).join('')}
      ${view.baseline != null && have.length ? `<line x1="${M.l}" x2="${W - M.r}" y1="${Y(view.baseline).toFixed(1)}" y2="${Y(view.baseline).toFixed(1)}" class="cbase"/>` : ''}
      ${missX.map(x => `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${yb - 10}" y2="${yb}" class="cmiss"/>`).join('')}
      <path d="${area}" class="carea"/>
      <path d="${dash}" class="cdash"/>
      <path d="${rline}" class="croll"/>
      <path d="${line}" class="cline"/>
      ${dots && view.mode === 'day' ? pts.filter(q => q.rv != null).map(q => `<circle cx="${q.x.toFixed(1)}" cy="${Y(q.rv).toFixed(1)}" r="4" class="crpt${q.prov ? ' open' : ''}"/>`).join('') : ''}
      ${dots ? have.map(q => `<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${view.mode === 'event' ? 4.5 : 4.5}" class="${q.prov ? 'cprov' : 'cpt'}"/>`).join('') : ''}
      ${last ? `<circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="5" class="cend"/>` : ''}
      <g id="hv" class="hide"><line id="hvl" y1="${M.t}" y2="${yb}" class="chl"/><circle id="hvc" r="7" class="chc"/></g></svg>`;
    svgBox.innerHTML = svg;
    plot._m = { M, iw, ih, W, H, Y };
    positionBand();
    if (hover >= 0 && pts[hover]) showHover(hover); else hideHover();
  }

  /* ---- hover / keyboard: every point, including missed days, can be hovered ---- */
  const hoverable = () => view.pts.map((q, i) => [q, i]);
  // Shows details when you hover over or tab to a point
  function showHover(i) {
    const q = view.pts[i]; if (!q) return; hover = i;
    const hv = $('#hv', host); if (!hv) return; hv.classList.remove('hide');
    const l = $('#hvl', host), c = $('#hvc', host); l.setAttribute('x1', q.x); l.setAttribute('x2', q.x);
    if (q.v != null) { const onRoll = kser === 'r' && q.rv != null && plot._m.Y; c.setAttribute('cx', q.x); c.setAttribute('cy', onRoll ? plot._m.Y(q.rv) : q.y); c.classList.remove('hide'); } else c.classList.add('hide');
    tip.classList.remove('hide'); tip.replaceChildren();
    const mk = (cls, txt) => { const d = document.createElement('div'); d.className = cls; d.textContent = txt; tip.appendChild(d); };
    mk('tdate', view.mode === 'event' ? q.sub : view.mode === 'check' ? `${q.label} · ${q.time}` : q.label);
    if (q.v != null) { mk('tval', fmtG(q.v)); mk('tsub', view.mode === 'event' ? q.label : (q.sub || 'Daily score')); if (q.rv != null) mk('tsub', `7-day average ${fmtG(q.rv)}`); if (view.mode === 'day') mk('thint', kser === 'r' ? 'Selected: 7-day average. Enter for details, up or down arrow to switch.' : 'Selected: daily score. Enter for details, up or down arrow to switch.'); }
    else { mk('tval', '--'); mk('tsub', q.sub || 'No score'); }
    const W = plot._m.W, tw = tip.offsetWidth || 150, left = q.x > W * .58 ? q.x - tw - 14 : q.x + 14;
    tip.style.left = clamp(left, 4, W - tw - 4) + 'px'; tip.style.top = '8px';
    if (!sel) { if (q.v != null) setRead(q); else setRead(null); }
  }
  function hideHover() { hover = -1; const hv = $('#hv', host); hv && hv.classList.add('hide'); tip.classList.add('hide'); setRead(null); }
  const nearestValid = x => { let best = null, bd = 1e9; view.pts.forEach((q, i) => { if (q.v == null) return; const d = Math.abs(q.x - x); if (d < bd) { bd = d; best = i; } }); return best; };
  /* a press lands on the 7-day average marker when it is closer to it than to the daily point */
  const nearerRolling = (i, y) => { const q = view.pts[i], Yf = plot._m && plot._m.Y; if (!q || q.rv == null || !Yf) return false; return Math.abs(y - Yf(q.rv)) < Math.abs(y - q.y) && Math.abs(y - Yf(q.rv)) <= 18; };
  // Clicking a point opens its details
  const openPoint = (i, kind) => { const q = view.pts[i]; if (!q || q.v == null) return; if (kind === 'r' && q.rv != null) rollDialog(p, q); else dayDialog(p, q); };
  plot.addEventListener('pointerdown', e => {
    if (!plot._m || tableMode || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const r = plot.getBoundingClientRect(); drag = { x0: e.clientX - r.left, y0: e.clientY - r.top, a: nearestValid(e.clientX - r.left), moved: false };
    try { plot.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  const endDrag2 = () => {
    if (!drag) return; const was = drag; drag = null; card.classList.remove('selecting');
    if (!was.moved) { if (sel) clearSel(); else if (was.a != null && view.mode === 'day') openPoint(was.a, nearerRolling(was.a, was.y0) ? 'r' : 'd'); }
    else if (sel && sel.a === sel.b) clearSel();
  };
  plot.addEventListener('pointerup', endDrag2); plot.addEventListener('pointercancel', endDrag2);
  plot.addEventListener('pointermove', e => {
    if (!plot._m || tableMode) return;
    if (drag) {
      const r = plot.getBoundingClientRect(), x = e.clientX - r.left;
      if (!drag.moved && Math.abs(x - drag.x0) < 7) return;
      if (!drag.moved) { drag.moved = true; whyPos = null; whyClosed = false; card.classList.add('selecting'); tip.classList.add('hide'); const hv = $('#hv', host); hv && hv.classList.add('hide'); hover = -1; }
      const b2 = nearestValid(x); if (drag.a != null && b2 != null) { sel = { a: drag.a, b: b2 }; if (sel.a !== sel.b) { renderSel(); positionBand(); } else { $('#selBand', host).classList.add('hide'); $('#selWhy', host).classList.add('hide'); } }
      return;
    }
    const r = plot.getBoundingClientRect(), x = e.clientX - r.left; let best = null, bd = 1e9;
    for (const [q, i] of hoverable()) { const d = Math.abs(q.x - x); if (d < bd) { bd = d; best = i; } }
    if (best != null) showHover(best);
  });
  plot.addEventListener('pointerleave', () => { if (!drag && document.activeElement !== plot) hideHover(); });
  plot.addEventListener('blur', hideHover);
  let anchor = null, kser = 'd';   /* kser: which series the keyboard is on (d = daily score, r = 7-day average) */
  plot.addEventListener('keydown', e => {
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(.7, .5); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(1.4, .5); return; }
    const h = hoverable().filter(([q]) => q.v != null); if (!h.length) return;
    const cur = h.findIndex(([, i]) => i === hover);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault(); const ni = e.key === 'ArrowRight' ? Math.min(h.length - 1, cur < 0 ? h.length - 1 : cur + 1) : Math.max(0, cur < 0 ? h.length - 1 : cur - 1);
      if (e.shiftKey) { if (anchor == null) anchor = hover >= 0 ? hover : h[h.length - 1][1]; sel = { a: anchor, b: h[ni][1] }; if (sel.a !== sel.b) { renderSel(); positionBand(); } }
      else { anchor = null; }
      showHover(h[ni][1]); if (sel && sel.a !== sel.b) renderSel();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {      /* switch between the daily score and the 7-day average */
      e.preventDefault(); kser = kser === 'd' ? 'r' : 'd'; if (hover >= 0) showHover(hover);
    } else if ((e.key === 'Enter' || e.key === ' ') && view.mode === 'day' && hover >= 0) { e.preventDefault(); openPoint(hover, kser); }
    else if (e.key === 'Escape') { anchor = null; if (sel) clearSel(); else hideHover(); }
  });
  /* the "What moved the score" box: drag it anywhere on the screen, or close it with the x */
  const wyEl = $('#selWhy', host);
  wyEl.addEventListener('pointerdown', e => {
    if (e.target.closest('.wclose') || (e.pointerType === 'mouse' && e.button !== 0)) { e.stopPropagation(); return; }
    e.stopPropagation(); e.preventDefault();
    const r = wyEl.getBoundingClientRect(); wmove = { dx: e.clientX - r.left, dy: e.clientY - r.top }; wyEl.classList.add('moving');
    try { wyEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  wyEl.addEventListener('pointermove', e => {
    if (!wmove) return; e.stopPropagation();
    whyPos = { x: clamp(e.clientX - wmove.dx, 0, innerWidth - wyEl.offsetWidth), y: clamp(e.clientY - wmove.dy, topEdge(), innerHeight - wyEl.offsetHeight) };
    wyEl.style.left = whyPos.x + 'px'; wyEl.style.top = whyPos.y + 'px';
  });
  const endMove = e => { if (!wmove) return; e.stopPropagation(); wmove = null; wyEl.classList.remove('moving'); };
  wyEl.addEventListener('pointerup', endMove); wyEl.addEventListener('pointercancel', endMove);
  wyEl.addEventListener('click', e => { if (e.target.closest('.wclose')) { whyClosed = true; wyEl.classList.add('hide'); } });
  /* while the box has not been moved it follows the highlighted area when the page scrolls or resizes */
  const follow = () => { if (sel && !whyPos && !whyClosed) positionBand(); };
  document.addEventListener('scroll', follow, true); window.addEventListener('resize', follow);
  on(host, 'click', '#selClear', () => { clearSel(); });
  on(host, 'click', '#selZoom', () => {
    if (!sel) return;
    const A = view.pts[Math.min(sel.a, sel.b)], B = view.pts[Math.max(sel.a, sel.b)]; const a = day0(A.t), b = day0(B.t);
    sel = null; custom = { a, b }; range = 'custom'; hover = -1; draw(); toast('Zoomed to ' + view.label);
  });

  /* ---- zoom: Ctrl + scroll over the chart (or the + and - buttons). Works on whole days: the window slides, clamps to the patient's data, and the axes relabel themselves ---- */
  card._win = () => curWindow();                         /* lets automated checks read the visible window */
  // Zoom in and out of the chart
  function curWindow() { return { a: day0(new Date(+view.x0)), b: day0(new Date(+view.x1 - 1)) }; }
  function zoomBy(f, frac) {
    if (FIX) return;
    const w = curWindow(), S = dayDiff(w.b, w.a) + 1, full = dayDiff(TODAY, FIRST) + 1;
    let S2 = Math.round(S * f); if (S2 === S) S2 = S + (f < 1 ? -1 : 1);
    S2 = clamp(S2, 1, full); if (S2 === S) return;
    const focus = S * frac - .5;                              /* the day under the cursor stays put */
    let a = Math.round(dayDiff(w.a, FIRST) + focus - (S2 * frac - .5)); a = clamp(a, 0, full - S2);
    sel = null; custom = { a: addDays(FIRST, a), b: addDays(FIRST, a + S2 - 1) }; range = 'custom'; hover = -1; draw();
  }
  plot.addEventListener('wheel', e => {
    if (FIX || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();                                       /* keeps the browser from zooming the whole page */
    if (!plot._m || tableMode) return;
    const r = plot.getBoundingClientRect(), M = plot._m.M, frac = clamp((e.clientX - r.left - M.l) / plot._m.iw, 0, 1);
    zoomBy(clamp(Math.exp(e.deltaY * .0035), .6, 1.6), frac);
  }, { passive: false });
  on(host, 'click', '#zIn', () => zoomBy(.7, .5));
  on(host, 'click', '#zOut', () => zoomBy(1.4, .5));

  /* ---- table view (every value reachable without hovering) ---- */
  // Table version of the chart for people who prefer numbers
  function buildTable() {
    const rows = view.pts.map(q => `<tr><th scope="row">${esc(view.mode === 'event' ? q.sub + ', ' + q.label : view.mode === 'check' ? q.label + ', ' + q.time : q.label)}</th><td class="num">${q.v == null ? 'No score' : fmtG(q.v)}</td><td class="num">${q.rv == null ? '--' : fmtG(q.rv)}</td><td class="muted">${esc(view.mode === 'event' ? '' : q.sub || '')}</td></tr>`).join('');
    table.innerHTML = `<table><caption class="sr">Lifestyle score values, from 0 to 100, for ${esc(view.label)}</caption><thead><tr><th>When</th><th>Lifestyle score</th><th>7-day average</th><th>Check-ins</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No data in this range.</td></tr>'}</tbody></table>`;
  }
  $('#chTblBtn', host).addEventListener('click', () => {
    tableMode = !tableMode; plot.classList.toggle('hide', tableMode); table.classList.toggle('hide', !tableMode);
    $('#chTblBtn span', host).textContent = tableMode ? 'Chart view' : 'Table view'; if (!tableMode) draw();
  });

  /* ---- ranges ---- */
  on(host, 'click', '#ranges button', (e, b) => {
    const r = b.dataset.r;
    if (r === 'custom') { openCustomRange(p, custom || curWindow(), c => { custom = c; range = 'custom'; hover = -1; sel = null; draw(); toast('Showing ' + view.label); }); return; }
    range = r; store.set('chartRange', r); hover = -1; sel = null; draw();
  });
  on(host, 'click', '#chKeyBtn', () => graphKeyDialog());
  on(host, 'click', '[data-info]', () => openDialog(`<div class="row between" style="margin-bottom:var(--s3)"><h2>How the lifestyle score works</h2><button class="btn icon sm" data-close aria-label="Close">${ic('x')}</button></div>
    <p class="ink2">Each finished day is scored from 0 to 100, based on how many of that day’s graded questions earned points. Skipped or unanswered graded questions count against the day. The green zone starts at 70. This measures how many lifestyle questions earned points. It is not a measure of mood or clinical health.</p><p class="ink2" style="margin-top:var(--s2)">The solid line is the daily score. The dashed line, with diamond markers, is the 7-day average: the average of the last 7 days ending on each date. It can include today. Today is not final until the day ends: it is drawn dotted with an open circle.</p><p class="ink2" style="margin-top:var(--s2)"><b>Tip:</b> drag across the chart to measure how much the score changed between two points. Hold Ctrl and scroll over the chart, or use the + and - buttons, to zoom. <b>7D</b>, <b>1M</b> and <b>6M</b> show one point per day. <b>1Y</b> shows weekly averages.</p><div class="row end" style="margin-top:var(--s5)"><button class="btn primary" data-close>Got it</button></div>`, { label: 'How the lifestyle score works' }));

  /* ---- resize grip: anchored top-left, grows down and right; size is remembered for every patient ---- */
  const grip = $('#grip', host); let st = null;
  const persist = () => { if (!FIX) store.set('chartSize', { w: Math.round(size.w), h: Math.round(size.h) }); };
  grip.addEventListener('pointerdown', e => { e.preventDefault(); grip.setPointerCapture(e.pointerId); const r = card.getBoundingClientRect(); st = { x: e.clientX, y: e.clientY, w: r.width, h: r.height }; card.classList.add('resizing'); });
  grip.addEventListener('pointermove', e => { if (!st) return; size.w = st.w + e.clientX - st.x; size.h = st.h + e.clientY - st.y; applySize(); });
  const endDrag = () => { if (st) { st = null; card.classList.remove('resizing'); persist(); } };
  grip.addEventListener('pointerup', endDrag); grip.addEventListener('pointercancel', endDrag);
  grip.addEventListener('dblclick', () => { size = FIX ? { w: saved.w, h: saved.h } : { ...CHART_DEF }; if (FIX) { want.w = size.w; want.h = size.h; } applySize(); persist(); toast('Chart size reset'); });
  grip.addEventListener('keydown', e => { const k = { ArrowRight: [32, 0], ArrowLeft: [-32, 0], ArrowDown: [0, 32], ArrowUp: [0, -32] }[e.key]; if (!k) return; e.preventDefault(); if (FIX) { want.w = clamp(size.w + k[0], CHART_MIN.w, opts.maxW ? opts.maxW() : 1200); want.h = clamp(size.h + k[1], CHART_MIN.h, 940); } size.w += k[0]; size.h += k[1]; applySize(); persist(); });
  const ro = new ResizeObserver(() => { draw(); }); ro.observe(plot);
  const onWin = () => applySize(); window.addEventListener('resize', onWin);
  draw();
  return { destroy() { ro.disconnect(); window.removeEventListener('resize', onWin); window.removeEventListener('resize', follow); document.removeEventListener('scroll', follow, true); } };
}

/* ===== Custom range: two boxes (year, month dropdowns) -> day calendar; stays open until Apply or Cancel ===== */
// Pop-up for choosing your own start and end dates
function openCustomRange(p, cur, apply) {
  const minY = p.series[0].d.getFullYear(), maxY = TODAY.getFullYear(), first = p.series[0].d;
  const mk = d => d ? { y: String(d.getFullYear()), m: String(d.getMonth()), d: d.getDate() } : { y: '', m: '', d: null };
  const S = { a: mk(cur && cur.a), b: mk(cur && cur.b) };
  const toDate = o => o.d ? new Date(+o.y, +o.m, o.d, 12) : null;
  let body, close, focusKey = null;
  const dim = (y, m) => new Date(y, m + 1, 0).getDate();
  const box = (k, label) => {
    const o = S[k], d = toDate(o), years = []; for (let y = maxY; y >= minY; y--) years.push(y);
    const mOpts = MONTHS.map((n, i) => { const dis = (o.y !== '' && ((+o.y === maxY && i > TODAY.getMonth()) || (+o.y === first.getFullYear() && i < first.getMonth()))) ? 'disabled' : ''; return `<option value="${i}" ${dis} ${o.m === String(i) ? 'selected' : ''}>${n}</option>`; }).join('');
    let cal = '';
    if (o.y !== '' && o.m !== '') {
      const y = +o.y, m = +o.m, lead = new Date(y, m, 1).getDay(), n = dim(y, m);
      let cells = '';
      for (let i = 0; i < lead; i++) cells += '<span></span>';
      for (let day = 1; day <= n; day++) {
        const dt = new Date(y, m, day, 12), off = dt > TODAY || dt < first, sel = o.d === day, isT = sameDay(dt, TODAY);
        cells += `<button type="button" class="cd${isT ? ' today' : ''}" data-k="${k}" data-day="${day}" aria-pressed="${sel}" ${off ? 'disabled' : ''} aria-label="${fmtDow(dt)}${off ? ', no data' : ''}">${day}</button>`;
      }
      cal = `<div class="cal" role="group" aria-label="Pick the ${label.toLowerCase()} day"><div class="cal-title">${MONTHS[m]} ${y}</div><div class="cal-dow" aria-hidden="true">${['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(x => `<span>${x}</span>`).join('')}</div><div class="cal-grid">${cells}</div></div>`;
    }
    return `<div class="datebox" data-k="${k}"><div class="dlabel">${label}</div><div class="dval ${d ? '' : 'empty'}">${d ? fmtDow(d) + ', ' + d.getFullYear() : 'Pick a year and month, then a day'}</div>
      <div class="row"><select class="select sm" data-k="${k}" data-f="y" aria-label="${label} year"><option value="">Year</option>${years.map(y => `<option value="${y}" ${o.y === String(y) ? 'selected' : ''}>${y}</option>`).join('')}</select>
      <select class="select sm" data-k="${k}" data-f="m" aria-label="${label} month"><option value="">Month</option>${mOpts}</select></div>${cal}</div>`;
  };
  const canApply = () => { const a = toDate(S.a), b = toDate(S.b); return !!(a && b && b >= a); };
  const paint = (err) => {
    if (!err) { const a = toDate(S.a), b = toDate(S.b); if (a && b && b < a) err = 'The end date must be on or after the start date.'; }
    body.innerHTML = `<div class="row between" style="margin-bottom:var(--s2)"><h2>Custom date range</h2><button class="btn icon sm" data-close aria-label="Close">${ic('x')}</button></div>
      <p class="ink2" style="margin-bottom:var(--s4)">Choose a year and month for each date, then pick the day. You can change either date as often as you like. The chart only updates when you press Apply.</p>
      <div class="range-grid">${box('a', 'Start date')}<span class="rarrow" aria-hidden="true">${ic('arrow-right')}</span>${box('b', 'End date')}</div>
      <div class="form-error ${err ? 'show' : ''}" id="cerr" role="alert" style="margin-top:var(--s3)">${ic('triangle-alert', 'sm')}<span>${esc(err || '')}</span></div>
      <div class="row end" style="margin-top:var(--s4);gap:var(--s3)"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="crapply" ${canApply() ? '' : 'disabled'}>Apply</button></div>`;
    if (focusKey) { const el = body.querySelector(focusKey); el && el.focus(); focusKey = null; }
  };
  openDialog('<div id="crbody"></div>', {
    wide: true, label: 'Custom date range', onMount(dlg, c) {
      close = c; body = $('#crbody', dlg); paint();
      on(dlg, 'change', 'select', (e, s) => {
        const o = S[s.dataset.k]; o[s.dataset.f] = s.value; if (s.dataset.f === 'y' || s.dataset.f === 'm') o.d = (o.y !== '' && o.m !== '' && o.d && o.d <= dim(+o.y, +o.m)) ? o.d : null;
        focusKey = `select[data-k="${s.dataset.k}"][data-f="${s.dataset.f}"]`; paint();
      });
      on(dlg, 'click', '.cd', (e, b) => { S[b.dataset.k].d = +b.dataset.day; focusKey = `.cd[data-k="${b.dataset.k}"][data-day="${b.dataset.day}"]`; paint(); });
      on(dlg, 'click', '#crapply', () => { const a = toDate(S.a), b = toDate(S.b); if (!a || !b) return; if (b < a) { paint('The end date must be on or after the start date.'); return; } close(); apply({ a, b }); });
    }
  });
}
