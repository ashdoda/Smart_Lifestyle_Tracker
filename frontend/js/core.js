/* ===== Core: helpers, storage, theme, router, toast, dialog ===== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mean = a => { const v = a.filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const MISSING_ICONS = [];
const ic = (name, cls = '') => {
  if (!ICONS[name]) { MISSING_ICONS.push(name); console.warn('missing icon', name); return ''; }
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
};
// delegated events
const on = (root, type, sel, fn) => root.addEventListener(type, e => { const t = e.target.closest(sel); if (t && root.contains(t)) fn(e, t); });

/* ---- storage that never throws (private mode / file:// safe) ---- */
const mem = {};
const store = {
  get(k, d) { try { const v = localStorage.getItem('hk.' + k); return v == null ? (k in mem ? mem[k] : d) : JSON.parse(v); } catch (e) { return k in mem ? mem[k] : d; } },
  set(k, v) { mem[k] = v; try { localStorage.setItem('hk.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};

/* ---- seeded random (chart smoothing, avatar colours) ---- */
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function randn(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/* ---- dates: "today" comes from the adapter clock (HK.now()) ---- */
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
const fmtMY = d => `${MON[d.getMonth()]} ${d.getFullYear()}`;
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };

/* ---- toast ---- */
let toastT;
function toast(msg) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; requestAnimationFrame(() => t.classList.add('show'));
  try { sessionStorage.setItem('hk.toast', JSON.stringify([msg, Date.now()])); } catch (e) { /* ignore */ }
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---- dialog (focus returns to opener, Esc closes) ---- */
function openDialog(html, { wide = false, label = 'Dialog', onMount } = {}) {
  const opener = document.activeElement;
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(label)}" ${wide ? 'style="width:min(760px,100%)"' : ''}>${html}</div>`;
  document.body.appendChild(scrim);
  const close = () => { scrim.remove(); document.removeEventListener('keydown', key); opener && opener.focus && opener.focus(); };
  const key = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  scrim.addEventListener('mousedown', e => { if (e.target === scrim) close(); });
  on(scrim, 'click', '[data-close]', close);
  const first = $('input,select,textarea,button,[tabindex]', scrim); first && first.focus();
  onMount && onMount(scrim.firstElementChild, close);
  return close;
}

/* ---- theme ---- */
const THEME_LIST = [
  ['sage', 'Misty sage', '#7A8F73'], ['lavender', 'Dusk lavender', '#8E7CAE'], ['tide', 'Calm tide', '#6FA3B8'],
  ['oat', 'Warm oat', '#BFA58A'], ['pine', 'Moonlit pine', '#1B2B2E'],
];
function setTheme(k) { document.documentElement.dataset.theme = k; store.set('theme', k); $$('.proto .themes button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === k))); }

/* ---- router: hash based, every unknown path falls back to a real screen (never a 404) ---- */
const ROUTES = [];
const route = (re, fn, group) => ROUTES.push({ re, fn, group });
/* ---- pages: each screen lives in its own page file. [file, route pattern, default route for that file] ---- */
const firstPid = () => (PATIENTS[0] ? PATIENTS[0].id : 'none');
const PAGES = [
  ['login.html', /^\/login$/, () => '/login'],
  ['invite.html', /^\/invite\/[^/?#]+$/, () => '/invite/' + (PATIENTS.find(p => p.state === 'invited') || PATIENTS[0] || { id: 'none' }).id],
  ['provider-patients.html', /^\/provider$/, () => '/provider'],
  ['provider-add.html', /^\/provider\/add$/, () => '/provider/add'],
  ['provider-patient.html', /^\/provider\/patient\/[^/?#]+$/, () => '/provider/patient/' + firstPid()],
  ['provider-cards.html', /^\/provider\/patient\/[^/?#]+\/cards$/, () => '/provider/patient/' + firstPid() + '/cards'],
  ['provider-report.html', /^\/provider\/patient\/[^/?#]+\/report$/, () => '/provider/patient/' + firstPid() + '/report'],
  ['patient-today.html', /^\/patient$/, () => '/patient'],
  ['patient-checkin.html', /^\/patient\/checkin$/, () => '/patient/checkin'],
  ['patient-week.html', /^\/patient\/week$/, () => '/patient/week'],
];
const PAGE = document.body.dataset.page || '';
const pageFor = path => { const h = PAGES.find(x => x[1].test(path)); return h ? h[0] : null; };
const defaultRoute = () => { const h = PAGES.find(x => x[0] === PAGE); return h ? h[2]() : '/login'; };
const go = p => { if (location.hash === '#' + p) render(); else location.hash = p; };
const session = { role: null, id: null };
let cleanup = null;
function render() {
  const path = (location.hash.replace(/^#/, '') || defaultRoute()).split('?')[0];
  let hit = null;
  for (const r of ROUTES) { const m = path.match(r.re); if (m) { hit = { r, m }; break; } }
  if (!hit) { location.replace(PAGE && PAGE !== 'login.html' ? 'login.html#/login' : '#/login'); return; }
  const pf = pageFor(path); if (PAGE && pf && pf !== PAGE) { location.replace(pf + location.hash); return; }   /* the route belongs to another page file */
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  let app = $('#app'); const fresh = app.cloneNode(false); app.replaceWith(fresh); app = fresh;   /* drops every listener from the previous screen */
  document.body.classList.toggle('clean', isClean()); setProtoH();
  app.dataset.screen = hit.r.group;
  app.innerHTML = '';
  const out = hit.r.fn(...hit.m.slice(1));
  cleanup = (out && out.cleanup) || null;
  if (out && out.html != null) { app.innerHTML = out.html; out.mount && out.mount(app); }
  $$('.proto nav a').forEach(a => a.setAttribute('aria-current', String(a.dataset.g === hit.r.group)));
  window.scrollTo(0, 0);
  document.title = (hit.r.title || 'Lifestyle Tracker') + ' prototype';
}
function setProtoH() { const p = $('#proto'); const h = p && getComputedStyle(p).display !== 'none' ? p.offsetHeight : 0; document.documentElement.style.setProperty('--proto-h', h + 'px'); }
const provName = () => HK.config.providerName || 'Your provider';
const isClean = () => /[?&]clean=1/.test(location.hash);
const keepClean = p => p + (isClean() ? (p.includes('?') ? '&' : '?') + 'clean=1' : '');
window.addEventListener('hashchange', render);

/* ---- prototype bar ---- */
const PROTO = [
  ['login', 'Sign in', '/login'],
  ['invite', 'Invite page', '__invite'],
  ['#', 'Provider'],
  ['providers', 'Patient list', '/provider'],
  ['patient-page', 'Patient page', '/provider/patient/{pid}'],
  ['cards', 'Card settings', '/provider/patient/{pid}/cards'],
  ['report', 'Weekly report', '/provider/patient/{pid}/report'],
  ['#', 'Patient app'],
  ['p-home', 'Today', '/patient'],
  ['p-checkin', 'Check-in', '/patient/checkin'],
  ['p-week', 'Weekly summary', '/patient/week'],
];
function protoBar() {
  return `<div class="proto" id="proto" role="region" aria-label="Prototype controls">
    <div class="tag">${ic('layout-dashboard')}<span>Prototype</span></div>
    <nav aria-label="Prototype screens">${PROTO.map(([g, l, p]) => g === '#' ? `<span class="grp">${l}</span>` : `<a href="#${p === '__invite' ? '/invite/' + (PATIENTS.find(x => x.state === 'invited') || PATIENTS[0] || { id: 'none' }).id : p.replace('{pid}', firstPid())}" data-g="${g}">${l}</a>`).join('')}</nav>
    <div class="themes" role="group" aria-label="Color palette">${THEME_LIST.map(([k, n, c]) => `<button type="button" data-t="${k}" title="${n}" aria-label="${n}" aria-pressed="false" style="background:${c}"></button>`).join('')}</div>
  </div>`;
}
function initProto() {
  document.body.insertAdjacentHTML('afterbegin', protoBar());
  on($('#proto'), 'click', '.themes button', (e, b) => { setTheme(b.dataset.t); toast(THEME_LIST.find(t => t[0] === b.dataset.t)[1]); });
  setTheme(store.get('theme', 'sage'));
}
