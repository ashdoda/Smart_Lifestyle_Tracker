// WHAT THIS FILE DOES
// The toolbox the other scripts share: short helper functions (find things on the page, dates, saving small settings),
// the pop-up message ("toast"), the pop-up dialog, the colour theme switcher, and the "router" that decides which
// screen to draw when the address changes. The demo bar at the top of the page is also built here.
/* ===== Core: helpers, storage, theme, router, toast, dialog ===== */
// Short names for finding one thing or many things on the page
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
// Makes text safe to put on the page (so characters like < do not break it)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Keeps a number between a lowest and highest value
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Finds a value part of the way between two numbers
const lerp = (a, b, t) => a + (b - a) * t;
// Average of a list of numbers, skipping any that are missing
const mean = a => { const v = a.filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const MISSING_ICONS = [];
// Gives back the small icon picture with the given name
const ic = (name, cls = '') => {
  if (!ICONS[name]) { MISSING_ICONS.push(name); console.warn('missing icon', name); return ''; }
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
};
// Listens for clicks (and similar) on things inside a box, even if they are added later
// delegated events
const on = (root, type, sel, fn) => root.addEventListener(type, e => { const t = e.target.closest(sel); if (t && root.contains(t)) fn(e, t); });

/* ---- storage that never throws (private mode / file:// safe) ---- */
// Small settings storage: tries the browser's storage and falls back to memory if it is blocked
const mem = {};
const store = {
  get(k, d) { try { const v = localStorage.getItem('hk.' + k); return v == null ? (k in mem ? mem[k] : d) : JSON.parse(v); } catch (e) { return k in mem ? mem[k] : d; } },
  set(k, v) { mem[k] = v; try { localStorage.setItem('hk.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};

/* ---- seeded random (chart smoothing, avatar colours) ---- */
// Random number helpers that give the same numbers each time for the same start value
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function randn(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/* ---- dates: "today" comes from the adapter clock (HK.now()) ---- */
// Today's date, and small helpers for working with dates and writing them out
const TODAY = (() => { const n = HK.now(); return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12); })();
const DAY = 86400000;
const day0 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
const dayDiff = (a, b) => Math.round((day0(a) - day0(b)) / DAY);
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = MONTHS.map(m => m.slice(0, 3));
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmtD = d => `${MON[d.getMonth()]} ${d.getDate()}`;
const fmtDY = d => `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
const fmtDow = d => `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`;
/* pctToG and pctDiffToG (server score, 0 to 100, kept as is) are defined in src/adapter.js and exposed by src/hk-backend.js */
const fmtMY = d => `${MON[d.getMonth()]} ${d.getFullYear()}`;
// Turns text like 2026-11-08 into a date
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };

/* ---- toast ---- */
// The toast: a short message that slides up and goes away, like "Saved"
let toastT;
function toast(msg) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; requestAnimationFrame(() => t.classList.add('show'));
  try { sessionStorage.setItem('hk.toast', JSON.stringify([msg, Date.now()])); } catch (e) { /* ignore */ }
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---- dialog (focus returns to opener, Esc closes) ---- */
// Opens a pop-up dialog. Esc or clicking outside closes it, and Tab stays inside it
function openDialog(html, { wide = false, label = 'Dialog', onMount, cls = '' } = {}) {
  const opener = document.activeElement;
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `<div class="dialog ${cls}" role="dialog" aria-modal="true" aria-label="${esc(label)}" ${wide ? 'style="width:min(760px,100%)"' : ''}>${html}</div>`;
  document.body.appendChild(scrim);
  const close = () => { scrim.remove(); document.removeEventListener('keydown', key); opener && opener.focus && opener.focus(); };
  const key = e => {
    if (scrim !== [...document.querySelectorAll('.scrim')].pop()) return;   /* only the top dialog reacts */
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {   /* keep Tab inside the dialog */
      const f = [...scrim.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && !x.hidden && x.offsetParent !== null);
      if (!f.length) return; const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } else if (!scrim.contains(document.activeElement)) { e.preventDefault(); a.focus(); }
    }
  };
  document.addEventListener('keydown', key);
  scrim.addEventListener('mousedown', e => { if (e.target === scrim) close(); });
  on(scrim, 'click', '[data-close]', close);
  const first = $('input,select,textarea,button,[tabindex]', scrim); first && first.focus();
  onMount && onMount(scrim.firstElementChild, close);
  return close;
}

/* ---- theme ---- */
// The colour themes people can choose from
const THEME_LIST = [
  ['sage', 'Misty sage', '#7A8F73'], ['lavender', 'Dusk lavender', '#8E7CAE'], ['tide', 'Calm tide', '#6FA3B8'],
  ['oat', 'Warm oat', '#BFA58A'], ['pine', 'Moonlit pine', '#1B2B2E'],
];
// Switches the colour theme and remembers the choice
function setTheme(k) { document.documentElement.dataset.theme = k; store.set('theme', k); $$('.proto .themes button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === k))); }

/* ---- router: hash based, every unknown path falls back to a real screen (never a 404) ---- */
// The router: a list of screens and the address each one is for
const ROUTES = [];
// Adds one screen to that list
const route = (re, fn, group) => ROUTES.push({ re, fn, group });
/* ---- pages: each screen lives in its own page file. [file, route pattern, default route for that file] ---- */
// The first patient in the list
const firstPid = () => (PATIENTS[0] ? PATIENTS[0].id : 'none');
/* The patient being reviewed: the one in the address, otherwise the signed-in patient, otherwise the first patient.
   Links inside the app always carry the patient, so a reload or a jump between screens never swaps to someone else. */
// Works out which patient the page is about (from the address, the signed-in patient, or the first one)
function ctxPid() {
  const path = location.hash.replace(/^#/, '').split('?')[0], m = path.match(/^\/provider\/patient\/([^/?#]+)/);
  if (m && PAT[m[1]]) return m[1];
  const q = new URLSearchParams(location.hash.split('?')[1] || '').get('p'); if (q && PAT[q]) return q;
  if (session.role === 'patient' && session.id && PAT[session.id]) return session.id;
  return firstPid();
}
// Builds a link that keeps the same patient
const protoHref = path => { const id = ctxPid(); return path.replace('{pid}', id) + (path.startsWith('/patient') && id !== 'none' ? '?p=' + id : ''); };
// Which page file each screen lives in
const PAGES = [
  ['login.html', /^\/login$/, () => '/login'],
  ['provider-patients.html', /^\/provider$/, () => '/provider'],
  ['provider-add.html', /^\/provider\/add$/, () => '/provider/add'],
  ['provider-patient.html', /^\/provider\/patient\/[^/?#]+$/, () => '/provider/patient/' + firstPid()],
  ['provider-report.html', /^\/provider\/patient\/[^/?#]+\/report$/, () => '/provider/patient/' + firstPid() + '/report'],
  ['patient-today.html', /^\/patient$/, () => '/patient'],
  ['patient-checkin.html', /^\/patient\/checkin$/, () => '/patient/checkin'],
  ['patient-week.html', /^\/patient\/week$/, () => '/patient/week'],
];
// The page file that is open right now, and small helpers about it
let PAGE = document.body.dataset.page || '';
const isPatientPage = f => /^patient-(today|checkin|week)\.html$/.test(f || '');
let firstRender = true;   /* the first screen of a page load may redirect to its own page file; later moves between patient screens stay in the same page */
const pageFor = path => { const h = PAGES.find(x => x[1].test(path)); return h ? h[0] : null; };
const defaultRoute = () => { const h = PAGES.find(x => x[0] === PAGE); return h ? h[2]() : '/login'; };
// Moves to another screen
const go = p => { if (location.hash === '#' + p) render(); else location.hash = p; };
// Who is signed in (kept only while the page is open)
const session = { role: null, id: null };
let cleanup = null;
// Draws the current screen: finds the matching route, builds its page and turns on its buttons
function render() {
  const path = (location.hash.replace(/^#/, '') || defaultRoute()).split('?')[0];
  let hit = null;
  for (const r of ROUTES) { const m = path.match(r.re); if (m) { hit = { r, m }; break; } }
  if (!hit) { location.replace(PAGE && PAGE !== 'login.html' ? 'login.html#/login' : '#/login'); return; }
  const pf = pageFor(path);
  /* moving between Today, Check-in and Week keeps the page and the phone frame; any other page file is a real page change */
  const inPlace = !firstRender && isPatientPage(PAGE) && isPatientPage(pf);
  if (PAGE && pf && pf !== PAGE && !inPlace) { location.replace(pf + location.hash); return; }   /* the route belongs to another page file */
  if (inPlace && pf !== PAGE) { PAGE = pf; document.body.dataset.page = pf; }
  firstRender = false;
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  let app = $('#app'); const oldPhone = inPlace ? $('#phone', app) : null; const fresh = app.cloneNode(false); app.replaceWith(fresh); app = fresh;   /* drops every listener from the previous screen */
  document.body.classList.toggle('clean', isClean()); setProtoH();
  app.dataset.screen = hit.r.group;
  app.innerHTML = '';
  const out = hit.r.fn(...hit.m.slice(1));
  cleanup = (out && out.cleanup) || null;
  if (out && out.html != null) {
    app.innerHTML = out.html;
    const np = $('#phone', app);
    /* keep the existing phone frame (status bar, island, tab bar element) and swap in only the screen content */
    if (oldPhone && np && oldPhone.dataset.pid === np.dataset.pid) {
      $$('.sheet-wrap', oldPhone).forEach(x => x.remove());
      oldPhone.replaceChild($('#pbody', np), $('#pbody', oldPhone));
      const ot = $('.tabbar', oldPhone), nt = $('.tabbar', np); ot.innerHTML = nt.innerHTML;
      np.replaceWith(oldPhone);
    }
    out.mount && out.mount(app);
  }
  $$('.proto nav a').forEach(a => { a.setAttribute('aria-current', String(a.dataset.g === hit.r.group)); if (a.dataset.path) a.setAttribute('href', '#' + protoHref(a.dataset.path)); });
  window.scrollTo(0, 0);
  document.title = (hit.r.title || 'Lifestyle Tracker') + ' prototype';
}
// Measures the demo bar so the page fits underneath it
function setProtoH() { const p = $('#proto'); const h = p && getComputedStyle(p).display !== 'none' ? p.offsetHeight : 0; document.documentElement.style.setProperty('--proto-h', h + 'px'); }
// The practitioner's name for display
const provName = () => HK.config.providerName || 'Your provider';
const isClean = () => /[?&]clean=1/.test(location.hash);
const keepClean = p => p + (isClean() ? (p.includes('?') ? '&' : '?') + 'clean=1' : '');
// Draw again whenever the address changes
window.addEventListener('hashchange', render);

/* ---- prototype bar ---- */
// The links shown in the demo bar
const PROTO = [
  ['login', 'Sign in', '/login'],
  ['#', 'Provider'],
  ['providers', 'Patient list', '/provider'],
  ['patient-page', 'Patient page', '/provider/patient/{pid}'],
  ['report', 'Weekly report', '/provider/patient/{pid}/report'],
  ['#', 'Patient app'],
  ['p-home', 'Today', '/patient'],
  ['p-checkin', 'Check-in', '/patient/checkin'],
  ['p-week', 'Weekly summary', '/patient/week'],
];
// Builds the demo bar at the top (screen links and colour buttons)
function protoBar() {
  return `<div class="proto" id="proto" role="region" aria-label="Prototype controls">
    <div class="tag">${ic('layout-dashboard')}<span>Prototype</span></div>
    <nav aria-label="Prototype screens">${PROTO.map(([g, l, p]) => g === '#' ? `<span class="grp">${l}</span>` : `<a href="#${protoHref(p)}" data-g="${g}" data-path="${p}">${l}</a>`).join('')}</nav>
    <div class="themes" role="group" aria-label="Color palette">${THEME_LIST.map(([k, n, c]) => `<button type="button" data-t="${k}" title="${n}" aria-label="${n}" aria-pressed="false" style="background:${c}"></button>`).join('')}</div>
  </div>`;
}
// Puts the demo bar on the page and applies the saved theme
function initProto() {
  document.body.insertAdjacentHTML('afterbegin', protoBar());
  on($('#proto'), 'click', '.themes button', (e, b) => { setTheme(b.dataset.t); toast(THEME_LIST.find(t => t[0] === b.dataset.t)[1]); });
  setTheme(store.get('theme', 'sage'));
}
