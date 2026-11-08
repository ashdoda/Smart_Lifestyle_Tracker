// WHAT THIS FILE DOES
// Builds the sign-in page and checks what you type (email and password) before logging in.
// Sign-in here is only for the demo: it looks the account up in a short list, since the server has no real accounts yet.
/* ===== Sign in (inline field checks) ===== */
// The small logo picture
const LOGO = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="28" cy="12" r="6" fill="var(--sun)"/><path d="M0 28 C8 18 16 20 22 26 S34 22 40 24 V40 H0Z" fill="var(--hill-mid)"/><path d="M0 34 C10 26 18 32 26 31 S36 28 40 30 V40 H0Z" fill="var(--accent)"/></svg>`;
// Gives back the list of demo accounts
function accounts() {
  return HK.data.accounts;
}
// The password rules shown to the person: length, a capital letter and a symbol
const PW_RULES = [['8 or more characters', v => v.length >= 8], ['1 capital letter', v => /[A-Z]/.test(v)], ['1 symbol, like ! or #', v => /[^A-Za-z0-9\s]/.test(v)]];
// A pattern that checks an email looks like name@site.com
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Builds one form field: label, box, hint and the error and success messages
function fieldHTML(id, label, { type = 'text', ph = '', ac = '', hint = '', pw = false, value = '', readonly = false } = {}) {
  const input = `<input class="input" id="${id}" name="${id}" type="${type}" placeholder="${esc(ph)}" autocomplete="${ac}" aria-describedby="m-${id}" value="${esc(value)}" ${readonly ? 'readonly' : ''}>`;
  return `<div class="field" id="f-${id}"><label for="${id}">${label}</label>
    ${pw ? `<div class="pw">${input}<button type="button" class="reveal" data-reveal="${id}" aria-label="Show password" aria-pressed="false">${ic('eye')}</button></div>` : input}
    ${hint ? `<small class="muted">${hint}</small>` : ''}
    <div class="msg" id="m-${id}" role="alert">${ic('triangle-alert', 'sm')}<span></span></div>
    <div class="ok" id="ok-${id}">${ic('circle-check', 'sm')}<span></span></div></div>`;
}
// Shows or clears the red error message under a field
function setErr(root, id, msg) {
  const f = $('#f-' + id, root), i = $('#' + id, root); if (!f) return;
  f.classList.toggle('err', !!msg); f.classList.remove('good');
  $('.msg span', f).textContent = msg || ''; i.setAttribute('aria-invalid', msg ? 'true' : 'false');
}
// Shows or clears the green "looks good" message under a field
function setOk(root, id, msg) { const f = $('#f-' + id, root); f.classList.toggle('good', !!msg); $('.ok span', f).textContent = msg || ''; if (msg) f.classList.remove('err'); }
// Builds the password rules checklist
function rulesHTML() {
  return `<ul class="rules" id="pwrules" aria-label="Password requirements">${PW_RULES.map(([t], i) => `<li data-r="${i}"><span class="mk">${ic('check')}</span><span>${t}</span><span class="sr" data-sr> (not met yet)</span></li>`).join('')}</ul>`;
}
// Ticks off each password rule as it is met
function updateRules(root, v) {
  PW_RULES.forEach(([, fn], i) => { const li = $(`#pwrules li[data-r="${i}"]`, root), ok = fn(v); li.classList.toggle('met', ok); $('[data-sr]', li).textContent = ok ? ' (met)' : ' (not met yet)'; });
}
// Makes the eye button show or hide the password
function wireReveal(root) {
  on(root, 'click', '[data-reveal]', (e, b) => {
    const i = $('#' + b.dataset.reveal, root), show = i.type === 'password';
    i.type = show ? 'text' : 'password'; b.setAttribute('aria-pressed', String(show)); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    b.innerHTML = ic(show ? 'eye-off' : 'eye');
  });
}
// Builds the picture side of the page with the welcome text
function heroHTML(h, p) {
  return `<aside class="hero scene">${sceneSVG({ w: 520, h: 760, mood: 'content', seed: 2, label: 'Layered hills with Pip the pet' }).replace('<svg ', '<svg class="scene-d" ')}${sceneSVG({ w: 390, h: 236, mood: null, seed: 2, label: 'Layered hills' }).replace('<svg ', '<svg class="scene-m" ')}
      <div class="copy"><div class="brandmark">${LOGO}<span>Lifestyle Tracker</span></div><h1>${h}</h1><p>${p}</p></div></aside>`;
}

// The sign-in page itself
route(/^\/login$/, () => {
  const html = `<div class="login">${heroHTML('Small steps between visits.', 'Set goals with your provider, check in for a minute a day, and watch the progress add up.')}
    <main class="pane"><div class="panel">
      <div><h2>Welcome back</h2><p class="sub">Sign in to continue.</p></div>
      <form id="signin" class="col" style="gap:var(--s4)" novalidate>
        ${fieldHTML('lemail', 'Email', { type: 'email', ph: 'you@example.com', ac: 'username' })}
        ${fieldHTML('lpw', 'Password', { type: 'password', pw: true, ac: 'current-password' })}
        <div class="form-error" id="lerr" role="alert">${ic('triangle-alert', 'sm')}<span></span></div>
        <button class="btn primary lg block" type="submit" id="lsubmit">Log in</button>
      </form>
      ${HK.config.demoLogins.length ? `<div class="demo"><b>Demo accounts</b><small>${esc(HK.config.demoNote)}</small>
        <div class="row">${HK.config.demoLogins.map(d => `<button type="button" class="chip sm" data-demo="${esc(d.email)}" data-pw="${esc(d.pw)}">${esc(d.label)}</button>`).join('')}</div></div>` : ''}
    </div></main></div>`;
  return {
    // "html" is the page layout; "mount" turns on the buttons and checks after the page is drawn
    html, mount(root) {
      wireReveal(root);
      // Pressing a demo account button fills in its email and password
      on(root, 'click', '[data-demo]', (e, b) => { $('#lemail', root).value = b.dataset.demo; $('#lpw', root).value = b.dataset.pw; setErr(root, 'lemail', ''); setErr(root, 'lpw', ''); $('#lerr', root).classList.remove('show'); $('#lsubmit', root).focus(); });
      // The checks for each field: the email must look right and the password must not be empty
      const lval = { lemail: v => !v.trim() ? 'Enter your email.' : (EMAIL_RE.test(v.trim()) ? '' : 'Enter a valid email, like name@example.com.'), lpw: v => v ? '' : 'Enter your password.' };
      // Check a field when you leave it, and clear the error as you fix it
      ['lemail', 'lpw'].forEach(id => { const el = $('#' + id, root); el.addEventListener('blur', () => setErr(root, id, lval[id](el.value))); el.addEventListener('input', () => { if (!lval[id](el.value)) setErr(root, id, ''); }); });
      // When the form is sent: check the fields, then look the account up
      $('#signin', root).addEventListener('submit', e => {
        e.preventDefault(); const le = $('#lerr', root); le.classList.remove('show');
        let bad = false; for (const id of ['lemail', 'lpw']) { const m = lval[id]($('#' + id, root).value); setErr(root, id, m); bad = bad || !!m; }
        if (bad) { $('.field.err input', root).focus(); return; }
        const btn = $('#lsubmit', root); btn.disabled = true; btn.textContent = 'Logging in...';
        setTimeout(() => {
          // If the email and password match a demo account, sign in and go to its first page
          const a = accounts()[$('#lemail', root).value.trim().toLowerCase()];
          if (!a || a.pw !== $('#lpw', root).value) { btn.disabled = false; btn.textContent = 'Log in'; $('span', le).textContent = 'Email or password is incorrect.'; le.classList.add('show'); return; }
          session.role = a.role; session.id = a.id;
          go(keepClean(a.role === 'provider' ? '/provider' : '/patient' + (a.id ? '?p=' + a.id : '')));
        }, 650);
      });
    }
  };
}, 'login');
