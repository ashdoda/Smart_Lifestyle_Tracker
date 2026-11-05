/* ===== Provider: card unlock + custom questions. Settings are saved per patient and used by the phone app ===== */
const BLURB = {
  activity: 'Daily movement goals, a backup plan, and ideas that fit the patient’s energy.',
  diet: 'One small nutrition goal a day, food ideas by nutrient, and an optional meal log.',
  mind: 'Brief breathing, grounding or meditation, with options by length.',
  sleep: 'A wind-down plan, bedtime check-ins and routine suggestions.',
  social: 'One small connection a day, with low-effort ideas for low-energy days.',
  substance: 'Goals, triggers and coping plans written for this patient’s treatment plan.',
};
function cfg(pid) {
  const p = PAT[pid] || PAT[firstPid()];
  const d = store.get('cfg.' + p.id, null);
  if (d) return d;
  return { unlocked: [...p.unlocked], length: p.lengthChosen, autoShorten: true, offerLonger: true, remindAm: '08:00', remindPm: '20:00', skipIfDone: true,
    quick: Object.fromEntries(QUICKLOG.map(q => [q.id, q.on])), steps: '4,000', photoLog: false, foodIdeas: true, mindLen: '3 minutes', cbti: false, windDown: '21:30', socialIdeas: true,
    subGoal: 'Stay within my limit', subLimit: 'No more than 2 drinks, and none before 6 PM', craving: true, subNote: true, custom: JSON.parse(JSON.stringify(HK.provider.defaultCustomQuestions(p.id) || [])) };
}
function saveCfg(pid, c) { store.set('cfg.' + pid, c); const p = PAT[pid]; if (p) { p.unlocked = [...c.unlocked]; p.lengthChosen = c.length; } }
const qTypeName = { text: 'Short answer', yesno: 'Yes or no', scale: 'Scale 0 to 10', choice: 'Choices' };
const whenName = { am: 'Morning', pm: 'Evening', wk: 'Weekly' };

function previewFake(type, opts) {
  if (type === 'yesno') return `<div class="fake"><span>Yes</span><span>No</span></div>`;
  if (type === 'scale') return `<div class="fake"><span>0</span><span>5</span><span>10</span></div>`;
  if (type === 'choice') return `<div class="fake">${(opts.length ? opts : ['Option one', 'Option two']).slice(0, 4).map(o => `<span>${esc(o)}</span>`).join('')}</div>`;
  return `<div class="fake area"><span>Patient types here</span></div>`;
}

route(/^\/provider\/patient\/([^/?#]+)\/cards$/, id => {
  const p = PAT[id]; if (!p) return noPatientView(id);
  const C = cfg(id), first = p.name.split(' ')[0];
  const optHTML = d => {
    const sw = (key, t, sub) => `<div class="opt"><div class="t">${t}${sub ? `<small>${sub}</small>` : ''}</div><button type="button" class="switch" role="switch" data-opt="${key}" aria-checked="${!!C[key]}" aria-label="${esc(t)}"></button></div>`;
    if (d.id === 'activity') return `<div class="opt"><div class="t">Starting step target<small>The patient can change it</small></div><select class="select sm" data-optsel="steps" aria-label="Starting step target">${['2,000', '4,000', '6,000', '8,000'].map(v => `<option ${C.steps === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`;
    if (d.id === 'diet') return sw('photoLog', 'Allow an optional meal photo log', 'Awareness only, never calorie counting. Leave off if food tracking is not right for this patient.') + sw('foodIdeas', 'Show food ideas by nutrient', 'Affordable foods rich in fiber, protein or magnesium');
    if (d.id === 'mind') return `<div class="opt"><div class="t">Suggested practice length<small>Guided options appear at this length first</small></div><select class="select sm" data-optsel="mindLen" aria-label="Suggested practice length">${['1 minute', '3 minutes', '5 minutes', '10 minutes'].map(v => `<option ${C.mindLen === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`;
    if (d.id === 'sleep') return sw('cbti', 'Use insomnia (CBT-I) wording', 'Cognitive behavioral therapy for insomnia: individualized bedtime questions') + `<div class="opt"><div class="t">Wind-down reminder<small>Sent before the planned bedtime</small></div><input class="input sm" type="time" data-optsel="windDown" value="${C.windDown}" aria-label="Wind-down reminder time"></div>`;
    if (d.id === 'social') return sw('socialIdeas', 'Show low-effort connection ideas', 'For days with limited energy or motivation');
    return `<div class="tailor"><b>Tailor this card to ${esc(first)}’s treatment plan</b><span>Questions should match the plan and risk level, especially when reducing use could involve withdrawal concerns. Nothing is shown to the patient until you set this up.</span></div>
      <div class="opt"><div class="t">Daily goal</div><select class="select sm" data-optsel="subGoal" aria-label="Daily goal">${['Abstain today', 'Stay within my limit', 'Cut back from yesterday'].map(v => `<option ${C.subGoal === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="opt-col"><label class="label" for="subLimit">Specific limit or plan</label><input class="input sm" id="subLimit" data-optsel="subLimit" value="${esc(C.subLimit)}"></div>
      ${sw('craving', 'Show the craving toolkit', 'Distract, ground, contact a support person, change environment')}
      ${sw('subNote', 'Remind about withdrawal safety', 'Shows “talk to your provider before stopping suddenly” when the goal is to abstain')}`;
  };
  const dcard = d => {
    const on = C.unlocked.includes(d.id);
    return `<article class="dcard ${on ? 'on' : ''}" data-d="${d.id}">
      <header><span class="dic">${ic(on ? d.icon : 'lock')}</span>
        <div class="grow"><h3>${d.name}${d.providerTailored ? `<span class="pill warn">${ic('pencil', 'sm')}Tailored by provider</span>` : ''}</h3><p class="blurb">${BLURB[d.id]}</p>
          <div class="qc"><span class="pill">${d.am.length} morning</span><span class="pill">${d.pm.length} evening</span><span class="pill">${d.wk.length} weekly</span></div></div>
        <div class="state"><span data-state>${on ? 'Unlocked' : 'Locked'}</span><button type="button" class="switch" role="switch" data-unlock="${d.id}" aria-checked="${on}" aria-label="Unlock ${d.name} for ${esc(first)}"></button></div></header>
      <div class="acts"><button type="button" class="btn sm" data-qs="${d.id}">${ic('list', 'sm')}<span>View questions</span></button>
        <button type="button" class="btn sm" data-optbtn="${d.id}" aria-expanded="false" ${on ? '' : 'disabled'}>${ic('sliders-horizontal', 'sm')}<span>Options</span></button></div>
      <div class="dopts hide" data-opts="${d.id}">${optHTML(d)}</div></article>`;
  };
  const qlRows = QUICKLOG.map(q => `<div class="ql"><span class="qi">${ic(q.icon, 'sm')}</span><div class="nm">${q.label}${q.note ? `<small>${q.note}</small>` : ''}</div>${q.sensitive ? `<span class="pill warn">Provider only</span>` : ''}<button type="button" class="switch" role="switch" data-ql="${q.id}" aria-checked="${!!C.quick[q.id]}" aria-label="Show ${q.label} button to the patient"></button></div>`).join('');
  const html = providerShell(`
    <div><a class="link" href="#/provider/patient/${id}">${ic('arrow-left', 'sm')} Back to ${esc(p.name)}</a></div>
    <header class="cs-head"><div><h1 style="font-size:var(--t-2xl)">Card settings for ${esc(p.name)}</h1><p>Choose which lifestyle cards ${esc(first)} sees, adjust each one, and add your own questions. Changes save automatically and show up in the patient app.</p></div>
      <div class="row wrap"><span class="saved hide" id="saved">${ic('circle-check', 'sm')}Saved</span><a class="btn" href="#/patient/checkin?p=${id}">${ic('smile')}<span>Preview as patient</span></a></div></header>
    <div class="cs-grid">
      <section class="cs-col" aria-label="Lifestyle cards"><h2>Lifestyle cards</h2><p class="sub">Unlocked cards appear in every check-in. Locked cards stay hidden.</p>${DOMAINS.map(dcard).join('')}</section>
      <section class="cs-col" aria-label="Check-in settings">
        <div class="setcard"><h2 class="sh">Check-in length</h2>
          <div class="seg fill" id="lenseg" role="group" aria-label="Default check-in length">${['quick', 'standard', 'extended'].map(k => `<button type="button" data-len="${k}" aria-pressed="${C.length === k}">${LENGTH[k].name}<small style="display:block;font-weight:600">${LENGTH[k].min} min</small></button>`).join('')}</div>
          <div class="rows">
            <div class="opt"><div class="t">Shorten automatically if questions are skipped<small>Switches to Quick for now, so check-ins never feel like a chore</small></div><button type="button" class="switch" role="switch" data-set="autoShorten" aria-checked="${C.autoShorten}" aria-label="Shorten automatically"></button></div>
            <div class="opt"><div class="t">Offer a longer check-in again<small>After a week of consistent check-ins, ask if they want to try more</small></div><button type="button" class="switch" role="switch" data-set="offerLonger" aria-checked="${C.offerLonger}" aria-label="Offer a longer check-in again"></button></div></div></div>
        <div class="setcard"><h2 class="sh">Reminders</h2><div class="rows">
          <div class="opt"><div class="t">Morning reminder</div><input class="input sm" type="time" data-time="remindAm" value="${C.remindAm}" aria-label="Morning reminder time"></div>
          <div class="opt"><div class="t">Evening reminder</div><input class="input sm" type="time" data-time="remindPm" value="${C.remindPm}" aria-label="Evening reminder time"></div>
          <div class="opt"><div class="t">Skip the reminder if already checked in<small>Keeps notifications to a minimum</small></div><button type="button" class="switch" role="switch" data-set="skipIfDone" aria-checked="${C.skipIfDone}" aria-label="Skip the reminder if already checked in"></button></div></div></div>
        <div class="setcard"><h2 class="sh">Quick-log buttons</h2><p class="muted" style="font-size:var(--t-sm);margin-top:-8px">One-tap buttons on the patient’s home screen for things to log between check-ins.</p><div class="rows">${qlRows}</div></div>
        <div class="setcard"><h2 class="sh">Add your own question</h2>
          <div class="qb">
            <div class="field"><label for="qdom">Card</label><select class="select" id="qdom">${DOMAINS.filter(d => true).map(d => `<option value="${d.id}">${d.name}</option>`).join('')}</select></div>
            <div class="field"><span class="label" id="qwl">Ask it</span><div class="seg fill" id="qwhen" role="group" aria-labelledby="qwl"><button type="button" data-w="am" aria-pressed="false">Morning</button><button type="button" data-w="pm" aria-pressed="true">Evening</button><button type="button" data-w="wk" aria-pressed="false">Weekly</button></div></div>
            <div class="field"><label for="qtext">Question</label><textarea class="textarea" id="qtext" placeholder="Example: How did the breathing exercise from our visit go?"></textarea><div class="msg" id="qerr" role="alert">${ic('triangle-alert', 'sm')}<span>Write the question first.</span></div></div>
            <div class="field"><span class="label" id="qtl">Answer type</span><div class="seg fill" id="qtype" role="group" aria-labelledby="qtl"><button type="button" data-t="text" aria-pressed="true">Short answer</button><button type="button" data-t="yesno" aria-pressed="false">Yes or no</button><button type="button" data-t="scale" aria-pressed="false">0 to 10</button><button type="button" data-t="choice" aria-pressed="false">Choices</button></div></div>
            <div class="field hide" id="qchwrap"><label for="qch">Choices, separated by commas</label><input class="input" id="qch" placeholder="Not at all, A little, A lot"></div>
            <div><div class="label" style="margin-bottom:6px">Preview of what the patient sees</div><div class="pv" aria-live="polite"><span class="pill info" id="pvdom"></span><div class="pvq" id="pvq">Your question appears here.</div><div id="pvfake"></div></div></div>
            <button type="button" class="btn primary block" id="qadd">${ic('plus')}<span>Add question</span></button></div></div>
        <div class="setcard"><h2 class="sh">Your added questions</h2><ul class="cq-list" id="cqlist"></ul></div>
      </section></div>`);
  return {
    html, mount(root) {
      mountShell(root);
      let saveT; const saved = () => { const s = $('#saved', root); s.classList.remove('hide'); clearTimeout(saveT); saveT = setTimeout(() => s.classList.add('hide'), 1800); };
      const commit = () => { saveCfg(id, C); saved(); };
      on(root, 'click', '[data-unlock]', (e, b) => {
        const k = b.dataset.unlock, onNow = b.getAttribute('aria-checked') !== 'true';
        b.setAttribute('aria-checked', String(onNow)); C.unlocked = onNow ? [...new Set([...C.unlocked, k])] : C.unlocked.filter(x => x !== k);
        const card = b.closest('.dcard'); card.classList.toggle('on', onNow); $('[data-state]', card).textContent = onNow ? 'Unlocked' : 'Locked';
        $('.dic', card).innerHTML = ic(onNow ? DOM[k].icon : 'lock'); const ob = $('[data-optbtn]', card); ob.disabled = !onNow;
        if (!onNow) { $('[data-opts]', card).classList.add('hide'); ob.setAttribute('aria-expanded', 'false'); }
        else if (k === 'substance') { $('[data-opts]', card).classList.remove('hide'); ob.setAttribute('aria-expanded', 'true'); }
        commit(); toast(`${DOM[k].name} ${onNow ? 'unlocked' : 'locked'} for ${first}`);
      });
      on(root, 'click', '[data-optbtn]', (e, b) => { const o = $(`[data-opts="${b.dataset.optbtn}"]`, root), open = o.classList.contains('hide'); o.classList.toggle('hide', !open); b.setAttribute('aria-expanded', String(open)); });
      on(root, 'click', '[data-opt]', (e, b) => { const k = b.dataset.opt; C[k] = !C[k]; b.setAttribute('aria-checked', String(C[k])); commit(); });
      on(root, 'click', '[data-set]', (e, b) => { const k = b.dataset.set; C[k] = !C[k]; b.setAttribute('aria-checked', String(C[k])); commit(); });
      on(root, 'click', '[data-ql]', (e, b) => { const k = b.dataset.ql; C.quick[k] = !C.quick[k]; b.setAttribute('aria-checked', String(C.quick[k])); commit(); if (C.quick[k] && QUICKLOG.find(q => q.id === k).sensitive) toast('Sensitive button on. Check with the care plan first.'); });
      on(root, 'change', '[data-optsel]', (e, s) => { C[s.dataset.optsel] = s.value; commit(); });
      on(root, 'input', '[data-optsel]', (e, s) => { if (s.tagName === 'INPUT' && s.type !== 'time') { C[s.dataset.optsel] = s.value; saveCfg(id, C); } });
      on(root, 'change', '[data-time]', (e, s) => { C[s.dataset.time] = s.value; commit(); });
      on(root, 'click', '[data-len]', (e, b) => { C.length = b.dataset.len; $$('[data-len]', root).forEach(x => x.setAttribute('aria-pressed', String(x === b))); commit(); toast(`Check-in length set to ${LENGTH[C.length].name}`); });
      on(root, 'click', '[data-qs]', (e, b) => {
        const d = DOM[b.dataset.qs], li = a => a.map(q => `<li>${esc(q.text || q)}${q.team ? ' <span class="pill info">Team suggestion</span>' : ''}</li>`).join('');
        openDialog(`<div class="qlist-dlg"><div class="row between"><h2>${d.name} questions</h2><button class="btn icon sm" data-close aria-label="Close">${ic('x')}</button></div>
          <p class="ink2" style="margin:var(--s2) 0 var(--s3)">The first question in each list is the main question. Follow-ups are optional and adapt to the patient’s answers.</p>
          <h4>Morning</h4><ol>${li(d.am)}</ol><h4>Evening</h4><ol>${li(d.pm)}</ol><h4>Weekly</h4><ol>${li(d.wk)}</ol>
          ${d.note ? `<div class="notice warn">${ic('info')}<span>${esc(d.note)}</span></div>` : ''}
          <div class="row end" style="margin-top:var(--s4)"><button class="btn primary" data-close>Done</button></div></div>`, { label: d.name + ' questions', wide: true });
      });
      /* custom question builder */
      const st = { when: 'pm', type: 'text' };
      const pv = () => {
        const dom = DOM[$('#qdom', root).value], txt = $('#qtext', root).value.trim();
        $('#pvdom', root).innerHTML = ic(dom.icon, 'sm') + dom.name; $('#pvq', root).textContent = txt || 'Your question appears here.';
        $('#pvfake', root).innerHTML = previewFake(st.type, $('#qch', root).value.split(',').map(s => s.trim()).filter(Boolean));
        $('#qchwrap', root).classList.toggle('hide', st.type !== 'choice');
      };
      const list = () => {
        const ul = $('#cqlist', root);
        ul.innerHTML = C.custom.length ? C.custom.map(q => `<li><div class="tx"><b>${esc(q.text)}</b><div class="tg"><span class="pill info">${ic(DOM[q.dom].icon, 'sm')}${DOM[q.dom].name}</span><span class="pill">${whenName[q.when]}</span><span class="pill">${qTypeName[q.type]}</span></div></div><button type="button" class="btn icon sm" data-del="${q.id}" aria-label="Delete question: ${esc(q.text)}">${ic('trash-2', 'sm')}</button></li>`).join('') : `<li><div class="tx"><span class="muted">No questions added yet. Write one above and it will appear in ${esc(first)}’s check-in.</span></div></li>`;
      };
      on(root, 'click', '#qwhen button', (e, b) => { st.when = b.dataset.w; $$('#qwhen button', root).forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
      on(root, 'click', '#qtype button', (e, b) => { st.type = b.dataset.t; $$('#qtype button', root).forEach(x => x.setAttribute('aria-pressed', String(x === b))); pv(); });
      ['#qdom', '#qtext', '#qch'].forEach(s => $(s, root).addEventListener('input', pv));
      $('#qadd', root).addEventListener('click', () => {
        const txt = $('#qtext', root).value.trim(), f = $('#qtext', root).closest('.field');
        if (!txt) { f.classList.add('err'); $('#qtext', root).focus(); return; }
        f.classList.remove('err');
        const opts = $('#qch', root).value.split(',').map(s => s.trim()).filter(Boolean);
        C.custom.push({ id: 'c' + Date.now(), dom: $('#qdom', root).value, when: st.when, type: st.type, text: txt, options: st.type === 'choice' ? (opts.length ? opts : ['Yes', 'Somewhat', 'No']) : undefined });
        $('#qtext', root).value = ''; $('#qch', root).value = ''; pv(); list(); commit(); toast('Question added to ' + first + '’s check-in');
      });
      $('#qtext', root).addEventListener('input', () => $('#qtext', root).closest('.field').classList.remove('err'));
      on(root, 'click', '[data-del]', (e, b) => { C.custom = C.custom.filter(q => q.id !== b.dataset.del); list(); commit(); toast('Question removed'); });
      pv(); list();
    }
  };
}, 'cards');
