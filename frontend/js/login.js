/* ===== Sign in + invite setup (inline field checks) ===== */
const LOGO = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="28" cy="12" r="6" fill="var(--sun)"/><path d="M0 28 C8 18 16 20 22 26 S34 22 40 24 V40 H0Z" fill="var(--hill-mid)"/><path d="M0 34 C10 26 18 32 26 31 S36 28 40 30 V40 H0Z" fill="var(--accent)"/></svg>`;
function accounts() {
  return { ...HK.data.accounts, ...store.get('extraAccounts', {}) };
}
const PW_RULES = [['8 or more characters', v => v.length >= 8], ['1 capital letter', v => /[A-Z]/.test(v)], ['1 symbol, like ! or #', v => /[^A-Za-z0-9\s]/.test(v)]];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function fieldHTML(id, label, { type = 'text', ph = '', ac = '', hint = '', pw = false, value = '', readonly = false } = {}) {
  const input = `<input class="input" id="${id}" name="${id}" type="${type}" placeholder="${esc(ph)}" autocomplete="${ac}" aria-describedby="m-${id}" value="${esc(value)}" ${readonly ? 'readonly' : ''}>`;
  return `<div class="field" id="f-${id}"><label for="${id}">${label}</label>
    ${pw ? `<div class="pw">${input}<button type="button" class="reveal" data-reveal="${id}" aria-label="Show password" aria-pressed="false">${ic('eye')}</button></div>` : input}
    ${hint ? `<small class="muted">${hint}</small>` : ''}
    <div class="msg" id="m-${id}" role="alert">${ic('triangle-alert', 'sm')}<span></span></div>
    <div class="ok" id="ok-${id}">${ic('circle-check', 'sm')}<span></span></div></div>`;
}
function setErr(root, id, msg) {
  const f = $('#f-' + id, root), i = $('#' + id, root); if (!f) return;
  f.classList.toggle('err', !!msg); f.classList.remove('good');
  $('.msg span', f).textContent = msg || ''; i.setAttribute('aria-invalid', msg ? 'true' : 'false');
}
function setOk(root, id, msg) { const f = $('#f-' + id, root); f.classList.toggle('good', !!msg); $('.ok span', f).textContent = msg || ''; if (msg) f.classList.remove('err'); }
function rulesHTML() {
  return `<ul class="rules" id="pwrules" aria-label="Password requirements">${PW_RULES.map(([t], i) => `<li data-r="${i}"><span class="mk">${ic('check')}</span><span>${t}</span><span class="sr" data-sr> (not met yet)</span></li>`).join('')}</ul>`;
}
function updateRules(root, v) {
  PW_RULES.forEach(([, fn], i) => { const li = $(`#pwrules li[data-r="${i}"]`, root), ok = fn(v); li.classList.toggle('met', ok); $('[data-sr]', li).textContent = ok ? ' (met)' : ' (not met yet)'; });
}
function wireReveal(root) {
  on(root, 'click', '[data-reveal]', (e, b) => {
    const i = $('#' + b.dataset.reveal, root), show = i.type === 'password';
    i.type = show ? 'text' : 'password'; b.setAttribute('aria-pressed', String(show)); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    b.innerHTML = ic(show ? 'eye-off' : 'eye');
  });
}
function heroHTML(h, p) {
  return `<aside class="hero scene">${sceneSVG({ w: 520, h: 760, mood: 'content', seed: 2, label: 'Layered hills with Pip the pet' }).replace('<svg ', '<svg class="scene-d" ')}${sceneSVG({ w: 390, h: 236, mood: null, seed: 2, label: 'Layered hills' }).replace('<svg ', '<svg class="scene-m" ')}
      <div class="copy"><div class="brandmark">${LOGO}<span>Lifestyle Tracker</span></div><h1>${h}</h1><p>${p}</p></div></aside>`;
}

route(/^\/login$/, () => {
  const invited = PATIENTS.find(p => p.state === 'invited');
  const html = `<div class="login">${heroHTML('Small steps between visits.', 'Set goals with your provider, check in for a minute a day, and watch the progress add up.')}
    <main class="pane"><div class="panel">
      <div><h2>Welcome back</h2><p class="sub">Sign in to continue.</p></div>
      <form id="signin" class="col" style="gap:var(--s4)" novalidate>
        ${fieldHTML('lemail', 'Email', { type: 'email', ph: 'you@example.com', ac: 'username' })}
        ${fieldHTML('lpw', 'Password', { type: 'password', pw: true, ac: 'current-password' })}
        <div class="form-error" id="lerr" role="alert">${ic('triangle-alert', 'sm')}<span></span></div>
        <button class="btn primary lg block" type="submit" id="lsubmit">Log in</button>
      </form>
      <p class="ink2" style="font-size:var(--t-sm)">New here? Your provider sends you an email with a link to set up your account.${invited ? ` <a href="#/invite/${invited.id}">See an example invite page</a>.` : ''}</p>
      ${HK.config.demoLogins.length ? `<div class="demo"><b>Demo accounts</b><small>${esc(HK.config.demoNote)}</small>
        <div class="row">${HK.config.demoLogins.map(d => `<button type="button" class="chip sm" data-demo="${esc(d.email)}" data-pw="${esc(d.pw)}">${esc(d.label)}</button>`).join('')}</div></div>` : ''}
    </div></main></div>`;
  return {
    html, mount(root) {
      wireReveal(root);
      on(root, 'click', '[data-demo]', (e, b) => { $('#lemail', root).value = b.dataset.demo; $('#lpw', root).value = b.dataset.pw; setErr(root, 'lemail', ''); setErr(root, 'lpw', ''); $('#lerr', root).classList.remove('show'); $('#lsubmit', root).focus(); });
      const lval = { lemail: v => !v.trim() ? 'Enter your email.' : (EMAIL_RE.test(v.trim()) ? '' : 'Enter a valid email, like name@example.com.'), lpw: v => v ? '' : 'Enter your password.' };
      ['lemail', 'lpw'].forEach(id => { const el = $('#' + id, root); el.addEventListener('blur', () => setErr(root, id, lval[id](el.value))); el.addEventListener('input', () => { if (!lval[id](el.value)) setErr(root, id, ''); }); });
      $('#signin', root).addEventListener('submit', e => {
        e.preventDefault(); const le = $('#lerr', root); le.classList.remove('show');
        let bad = false; for (const id of ['lemail', 'lpw']) { const m = lval[id]($('#' + id, root).value); setErr(root, id, m); bad = bad || !!m; }
        if (bad) { $('.field.err input', root).focus(); return; }
        const btn = $('#lsubmit', root); btn.disabled = true; btn.textContent = 'Logging in...';
        setTimeout(() => {
          const a = accounts()[$('#lemail', root).value.trim().toLowerCase()];
          if (!a || a.pw !== $('#lpw', root).value) { btn.disabled = false; btn.textContent = 'Log in'; $('span', le).textContent = 'Email or password is incorrect.'; le.classList.add('show'); return; }
          session.role = a.role; session.id = a.id;
          go(keepClean(a.role === 'provider' ? '/provider' : '/patient' + (a.id && a.id !== firstPid() ? '?p=' + a.id : '')));
        }, 650);
      });
    }
  };
}, 'login');

/* ----- the page a patient lands on from the invite email: they choose their own password ----- */
route(/^\/invite\/([^/?#]+)$/, id => {
  const p = PAT[id];
  if (!p && id === 'none') return { html: `<div class="login">${heroHTML('Welcome.', 'Your provider sends you a link to set up your account.')}<main class="pane"><div class="panel"><div><h2>No invite yet</h2><p class="sub">Add a patient in the provider view and send an invite. The invite page for that patient opens here.</p></div><a class="btn primary lg block" href="#/provider/add">Add a patient</a><a class="btn lg block" href="#/login">Go to sign in</a></div></main></div>` };
  if (!p) { go('/login'); return null; }
  const first = p.name.split(' ')[0], done = p.state === 'active' && accounts()[(p.email || '').toLowerCase()];
  const html = `<div class="login">${heroHTML(`Welcome, ${esc(first)}.`, `${esc(provName())} invited you to track small steps between visits.`)}
    <main class="pane"><div class="panel">
      ${done ? `<div><h2>You are all set</h2><p class="sub">This invite was already used.</p></div><a class="btn primary lg block" href="#/login">Go to sign in</a>` : `
      <div><h2>Set up your account</h2><p class="sub">${esc(provName())} invited you. Choose a password and you are in.</p></div>
      <ul class="privlist"><li>${ic('lock')}<span>Your answers stay on a private server and are never shared with other companies.</span></li><li>${ic('eye')}<span>${esc(provName())} sees your check-ins and rating over time.</span></li><li>${ic('eye-off')}<span>You can also keep private goals that only you can see.</span></li></ul>
      <form id="setup" class="col" style="gap:var(--s4)" novalidate>
        ${fieldHTML('iemail', 'Email', { type: 'email', value: p.email || '', readonly: true, ac: 'username' })}
        ${fieldHTML('ipw', 'Choose a password', { type: 'password', pw: true, ac: 'new-password' })}
        ${rulesHTML()}
        ${fieldHTML('ipw2', 'Confirm password', { type: 'password', pw: true, ac: 'new-password' })}
        <div class="form-error" id="ierr" role="alert">${ic('triangle-alert', 'sm')}<span></span></div>
        <button class="btn primary lg block" type="submit" id="isubmit">Create my account</button>
      </form>`}
    </div></main></div>`;
  return {
    html, mount(root) {
      if (done) return;
      wireReveal(root);
      const val = { ipw: v => PW_RULES.every(([, fn]) => fn(v)) ? '' : 'Password does not meet all the requirements below.', ipw2: v => !v ? 'Confirm the password.' : (v !== $('#ipw', root).value ? 'Passwords do not match.' : '') };
      const match = () => { const a = $('#ipw', root).value, b = $('#ipw2', root).value; setOk(root, 'ipw2', b && a === b ? 'Passwords match.' : ''); };
      ['ipw', 'ipw2'].forEach(k => {
        const el = $('#' + k, root);
        el.addEventListener('blur', () => { setErr(root, k, val[k](el.value)); if (k === 'ipw2') match(); });
        el.addEventListener('input', () => { if (k === 'ipw') { updateRules(root, el.value); match(); } else match(); if ($('#f-' + k, root).classList.contains('err') && !val[k](el.value)) setErr(root, k, ''); });
      });
      $('#setup', root).addEventListener('submit', e => {
        e.preventDefault(); let bad = false; for (const k of ['ipw', 'ipw2']) { const m = val[k]($('#' + k, root).value); setErr(root, k, m); bad = bad || !!m; }
        const fe = $('#ierr', root); if (bad) { fe.classList.add('show'); $('span', fe).textContent = 'Fix the highlighted fields and try again.'; $('.field.err input', root).focus(); return; }
        fe.classList.remove('show');
        const btn = $('#isubmit', root); btn.disabled = true; btn.textContent = 'Creating account...';
        setTimeout(() => {
          const extra = store.get('extraAccounts', {}); extra[p.email.toLowerCase()] = { pw: $('#ipw', root).value, role: 'patient', id: p.id, name: p.name }; store.set('extraAccounts', extra);
          setEnroll(p, 'active'); session.role = 'patient'; session.id = p.id; toast('Account created. Welcome!');
          go(keepClean('/patient?p=' + p.id));
        }, 700);
      });
    }
  };
}, 'invite');
