/* ===== Private goals: the patient's own space. The provider sees a goal only if the patient chooses to share it ===== */
const PRIV_NOTICE = 'Private goals are yours. Privacy does not cover anything that could seriously harm you or someone else. If that is happening, please reach out to someone you trust or your provider. In the US, call or text 988 any time.';
const HARM_RE = /(kill myself|suicid|hurt myself|self.?harm|end my life|cut myself|hurting myself)/i;
const PRIV_TYPES = { yesno: 'Yes or no', count: 'Count', rating: '0 to 10 rating' };

function privGoals(pid) {
  const saved = store.get('priv.' + pid, null); if (saved) return saved;
  return JSON.parse(JSON.stringify(HK.provider.seedPrivateGoals(pid) || []));
}
const privSave = (pid, g) => store.set('priv.' + pid, g);
const todayKey = () => iso(TODAY);
function privMet(g, v) { return v == null ? null : g.type === 'count' ? v <= g.limit : g.type === 'yesno' ? v === 1 : v >= 6; }
function privWeek(g) {
  const vals = []; for (let i = 6; i >= 0; i--) vals.push(g.log[iso(addDays(TODAY, -i))] ?? null);
  const logged = vals.filter(v => v != null), met = logged.filter(v => privMet(g, v)).length;
  const text = !logged.length ? 'No days logged yet' : g.type === 'count' ? `${met} of ${logged.length} logged days within your limit of ${g.limit} ${g.unit}` : g.type === 'yesno' ? `${met} of ${logged.length} logged days done` : `Average ${(logged.reduce((a, b) => a + b, 0) / logged.length).toFixed(1)} out of 10 this week`;
  return { vals, met, logged: logged.length, text };
}
const unitOf = (g, v) => v === 1 ? String(g.unit).replace(/s$/, '') : g.unit;
const privToday = g => { const v = g.log[todayKey()]; return v == null ? 'Not logged today' : g.type === 'count' ? `Today: ${v} ${unitOf(g, v)}` : g.type === 'yesno' ? `Today: ${v ? 'yes' : 'no'}` : `Today: ${v} out of 10`; };
/* goal name on one line; a caret appears only when it does not fit and opens the full text, wrapped by words */
const privTitle = g => `<div class="ptitle"><b class="pt">${esc(g.title)}</b><button type="button" class="pcaret hide" aria-expanded="false" aria-label="Show the full goal: ${esc(g.title)}">${ic('chevron-down', 'sm')}</button></div>`;
const ppips = (g, vals) => `<span class="ppips" role="img" aria-label="Last 7 days">${vals.map(v => `<i class="${v == null ? 'none' : privMet(g, v) ? 'on' : ''}"></i>`).join('')}</span>`;

function privCardHTML(pid) {
  const goals = privGoals(pid);
  return `<section class="pcard" aria-label="Private goals"><div class="row between"><h2 style="margin:0">${ic('lock', 'sm')} Private goals</h2><button type="button" class="btn sm tight" data-privadd>${ic('plus', 'sm')}<span>Add</span></button></div>
    <p class="ink2" style="font-size:var(--t-sm);margin:6px 0 var(--s2)">Only you can see these. Share one with your provider whenever you feel ready.</p>
    ${goals.length ? goals.map(g => { const w = privWeek(g); return `<div class="privrow"><div class="t">${privTitle(g)}${ppips(g, w.vals)}<small class="muted">${privToday(g)}${g.shared ? ', shared' : ''}</small></div><button type="button" class="btn sm tight" data-privlog="${g.id}">Log</button></div>`; }).join('') : `<p class="muted" style="font-size:var(--t-sm);padding:var(--s2) 0">Track something just for you, like cutting back on a habit. Nobody else sees it.</p>`}</section>`;
}
function privWeekHTML(pid) {
  const goals = privGoals(pid); if (!goals.length) return '';
  return `<section class="pcard privweek" aria-label="Private goals"><div class="pgh"><span class="pill">${ic('lock', 'sm')}Only you</span><h2 class="sh">Private goals</h2></div>
    <ul class="pgl">${goals.map(g => { const w = privWeek(g), n = w.logged; return `<li>${privTitle(g)}<div class="pmeta">${ppips(g, w.vals)}<span class="sep" aria-hidden="true">|</span><span>${n ? `${n} day${n === 1 ? '' : 's'} logged` : 'No days logged yet'}</span>${g.shared ? `<span class="pill info sm">${ic('lock-open', 'sm')}Shared</span>` : ''}</div></li>`; }).join('')}</ul></section>`;
}
/* what the provider sees: only goals the patient chose to share */
function privSharedHTML(pid) {
  const shared = privGoals(pid).filter(g => g.shared); if (!shared.length) return '';
  const first = PAT[pid].name.split(' ')[0];
  return `<div class="card"><h2 class="sh">Goals ${esc(first)} chose to share</h2>${shared.map(g => `<div class="hl"><span class="ii">${ic('lock-open')}</span><span><b>${esc(g.title)}</b>${esc(privWeek(g).text)}</span></div>`).join('')}</div>`;
}

function privLogSheet(root, pid, id, redraw) {
  const goals = privGoals(pid), g = goals.find(x => x.id === id); if (!g) return;
  let val = g.log[todayKey()] ?? null;
  const ctl = () => g.type === 'yesno' ? `<div class="yn" role="group" aria-label="Did you do it today?">${['Yes', 'No'].map((o, i) => `<button type="button" class="opt-btn" data-pv="${i === 0 ? 1 : 0}" aria-pressed="${val === (i === 0 ? 1 : 0)}"><span class="rd">${ic('check')}</span><span>${o}</span></button>`).join('')}</div>`
    : g.type === 'count' ? `<div class="stepper"><button type="button" class="btn icon" data-step="-1" aria-label="One less">${ic('minus')}</button><div class="val num" id="pv" aria-live="polite">${val ?? 0}</div><button type="button" class="btn icon" data-step="1" aria-label="One more">${ic('plus')}</button></div><p class="ink2" style="text-align:center;font-size:var(--t-sm)">Goal: at most ${g.limit} ${esc(g.unit)} a day</p>`
      : `<div class="scalev"><div class="val num" id="pv">${val ?? 5}</div><input class="range" id="prange" type="range" min="0" max="10" value="${val ?? 5}" aria-label="Rate today" style="--fill:${(val ?? 5) * 10}%"><div class="ends"><span>Low</span><span>High</span></div></div>`;
  phoneSheet(root, `<span class="pill">${ic('lock', 'sm')}Only you</span><h2 style="margin-top:var(--s3)">${esc(g.title)}</h2><p class="ink2" style="font-size:var(--t-sm);margin-bottom:var(--s4)">${esc(privWeek(g).text)}</p>${ctl()}
    <h3>Sharing</h3><div class="opt-row"><span class="t"><b>Share with ${esc(provName())}</b><small>Off by default. You can stop sharing any time.</small></span><button type="button" class="switch" role="switch" id="privshare" aria-checked="${g.shared}" aria-label="Share this goal with your provider"></button></div>
    <div class="col" style="margin-top:var(--s5)"><button class="btn primary lg block" id="privsave" data-sheetclose>${ic('check')}<span>Save</span></button><button class="btn block" data-sheetclose>Cancel</button><button type="button" class="link" id="privdel" style="align-self:center">Delete this goal</button></div>`,
  (el, close) => {
    on(el, 'click', '[data-pv]', (e, b) => { val = +b.dataset.pv; $$('[data-pv]', el).forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
    on(el, 'click', '[data-step]', (e, b) => { val = Math.max(0, (val ?? 0) + +b.dataset.step); $('#pv', el).textContent = val; });
    el.addEventListener('input', e => { if (e.target.id === 'prange') { val = +e.target.value; $('#pv', el).textContent = val; e.target.style.setProperty('--fill', val * 10 + '%'); } });
    on(el, 'click', '#privshare', (e, b) => { g.shared = !g.shared; b.setAttribute('aria-checked', String(g.shared)); toast(g.shared ? 'Shared with ' + provName() : 'Back to private'); });
    on(el, 'click', '#privsave', () => { if (val != null) g.log[todayKey()] = val; privSave(pid, goals); toast('Saved. Only you can see this.'); setTimeout(redraw, 300); });
    on(el, 'click', '#privdel', () => { privSave(pid, goals.filter(x => x.id !== id)); close(); toast('Goal deleted'); setTimeout(redraw, 300); });
  });
}
function privAddSheet(root, pid, redraw) {
  const st = { type: 'yesno' };
  phoneSheet(root, `<h2>New private goal</h2><div class="notice warn" style="margin:var(--s3) 0">${ic('shield-check')}<span>${PRIV_NOTICE}</span></div>
    <div class="field" id="f-ptitle"><label for="ptitle">What do you want to track?</label><input class="input" id="ptitle" maxlength="60" placeholder="Cut down on drinking" autocomplete="off"><div class="msg" id="m-ptitle" role="alert">${ic('triangle-alert', 'sm')}<span>Give your goal a name.</span></div></div>
    <div class="notice warn hide" id="pharm">${ic('phone')}<span>If you are thinking about hurting yourself, please call or text 988 now. You do not have to go through it alone.</span></div>
    <h3>How do you want to track it?</h3><div class="chips" id="ptypes" role="group" aria-label="Tracking type">${Object.entries(PRIV_TYPES).map(([k, l]) => `<button type="button" class="chip" data-pt="${k}" aria-pressed="${k === 'yesno'}">${l}</button>`).join('')}</div>
    <div id="pcount" style="display:none;gap:var(--s3);margin-top:var(--s3)"><div class="field" style="flex:1"><label for="plimit">At most per day</label><input class="input" id="plimit" type="number" min="0" max="99" value="2" inputmode="numeric"></div><div class="field" style="flex:1"><label for="punit">What are you counting?</label><input class="input" id="punit" value="times" maxlength="16"></div></div>
    <div class="col" style="margin-top:var(--s5)"><button class="btn primary lg block" id="padd">${ic('lock', 'sm')}<span>Save private goal</span></button><button class="btn block" data-sheetclose>Cancel</button></div>`,
  (el, close) => {
    on(el, 'click', '[data-pt]', (e, b) => { st.type = b.dataset.pt; $$('[data-pt]', el).forEach(x => x.setAttribute('aria-pressed', String(x === b))); const c = $('#pcount', el); c.style.display = st.type === 'count' ? 'flex' : 'none'; });
    $('#ptitle', el).addEventListener('input', e => { $('#pharm', el).classList.toggle('hide', !HARM_RE.test(e.target.value)); $('#f-ptitle', el).classList.remove('err'); });
    on(el, 'click', '#padd', () => {
      const title = $('#ptitle', el).value.trim(); if (!title) { $('#f-ptitle', el).classList.add('err'); $('#ptitle', el).focus(); return; }
      const goals = privGoals(pid); goals.push({ id: 'g' + Date.now(), title, type: st.type, unit: ($('#punit', el).value.trim() || 'times'), limit: Math.max(0, +$('#plimit', el).value || 0), shared: false, log: {} });
      privSave(pid, goals); close(); toast('Private goal added. Only you can see it.'); setTimeout(redraw, 300);
    });
  });
}
function mountPrivate(root, pid, redraw) {
  on(root, 'click', '[data-privadd]', () => privAddSheet(root, pid, redraw));
  on(root, 'click', '[data-privlog]', (e, b) => privLogSheet(root, pid, b.dataset.privlog, redraw));
}
