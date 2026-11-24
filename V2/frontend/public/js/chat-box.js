// WHAT THIS FILE DOES
// The assistant chat box on the practitioner's patient page. Type a question, press Enter, and the reply shows in the chat.
// The box talks to the backend through ONE function (sendToBackend, step 2). Everything below the big
// "DISPLAY ONLY" line just draws the chat, so it never needs to change.
(function () {
'use strict';

/* ==========================================================================
   BACKEND WIRING  |  STEP 1 OF 3  |  THE CHAT ADDRESS
   ==========================================================================
   >>> CHANGE THIS to the route that talks to the model. <<<
   Leave CHAT_URL as '' to show the box as "Not connected".
   TIMEOUT_MS is how long to wait for an answer before showing an error.
   HISTORY_TURNS is how many earlier messages go along with each question.
   ========================================================================== */
const CHAT_URL = '/api/chat'; // The backend AI route. Change this if you name your route something other than /chat.
const TIMEOUT_MS = 60000;
const HISTORY_TURNS = 20;
const CHECK_MS = 30000; // How often the Connected pill re-checks (in milliseconds).


/* ==========================================================================
   BACKEND WIRING  |  STEP 2 OF 3  |  THE SEND FUNCTION
   ==========================================================================
   >>> WIRE THE LLM HERE. This is the only function that talks to the backend. <<<
   It gets: the typed message, the id of the patient on screen, and the earlier messages.
   It must return the reply text, or throw an Error with a short message (shown in the chat).
   Change the body however you like (headers, streaming, another route).

   Request body sent right now (POST, JSON):
     { "message": "How has this patient slept?",
       "patient_id": 3,
       "history": [ { "role": "user", "content": "..." }, { "role": "assistant", "content": "..." } ] }
   ========================================================================== */

   // Sends the question to the backend and returns its reply
async function sendToBackend(message, patientId, history, signal) {
  // Send the question to the backend route
  const res = await fetch(CHAT_URL, {
    method: 'POST',
    // Tell the backend we are sending JSON
    headers: { 'Content-Type': 'application/json' },
    // What the backend receives: the question, the patient, and the earlier messages
    body: JSON.stringify({ message, patient_id: patientId, history }),
    // Lets the box cancel the request if it takes too long
    signal,
  });
  // Read the backend's answer
  let data = null;
  try { data = await res.json(); } catch (e) { /* not JSON */ }
  // Pull out the reply text to show in the chat
  return readReply(data, res);
}


/* ==========================================================================
   BACKEND WIRING  |  STEP 3 OF 3  |  THE REPLY SHAPE
   ==========================================================================
   >>> The backend answers with JSON like this: <<<
     { "reply": "text shown in the chat", "error": null }
     { "reply": null, "error": "short message shown if something went wrong" }
   The reply is shown as plain text (line breaks are kept).
   If the route is missing or the server is down, the box shows "Not connected".

   OPTIONAL: a GET on the chat address plus "/status" that answers { "ok": true } when the model works
   or { "ok": false } when it does not. The pill checks it on load and every 30 seconds.
   Without it, the pill only checks that the chat route exists.
   ========================================================================== */
   
// Turns the backend's answer into reply text, or an error
function readReply(data, res) {
  // No answer or route not found means the backend is not connected
  if (!data || res.status === 404) { const e = new Error('Cannot reach the assistant.'); e.offline = true; throw e; }
  // The backend sent an error, so show its message
  if (!res.ok || data.error) throw new Error(data.error || 'The assistant could not answer (' + res.status + ').');
  // All good, return the reply text
  return String(data.reply == null ? '' : data.reply);
}

// Checks if the backend is reachable, for the Connected pill
async function checkConnection(signal) {
  try {
    // Ask the backend's status route first
    const s = await fetch(CHAT_URL + '/status', { signal });
    // The status route answered: connected, unless it says the AI is down
    if (s.ok) { let d = null; try { d = await s.json(); } catch (e) { /* not JSON */ } return !(d && d.ok === false); }
    // The status route is broken (not just missing), so not connected
    if (s.status !== 404 && s.status !== 405) return false;
  } catch (e) { return false; }
  // No status route, so check that the chat route exists
  try { const r = await fetch(CHAT_URL, { signal }); return r.status !== 404 && r.status < 500; } catch (e) { return false; }
}








// ##############################################
// ### Chat Box UI Display                      #
// ### Everything below just draws the chat box # 
// ### No backend changes needed.               #
// ##############################################
const MIN = { w: 340, h: 240 }, DEF = { w: 4000, h: 340 };
const memo = typeof store !== 'undefined' ? store : { get: (k, d) => d, set() {} };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const CSS = `
.cb-card{position:relative;flex:none;max-width:100%;min-width:0;box-sizing:border-box;display:flex;flex-direction:column;gap:var(--s3,12px);padding:var(--s5,20px) 24px var(--s4,16px);background:var(--surface);border:1px solid var(--line);border-radius:var(--r-card,20px);color:var(--ink);overflow:hidden}
.cb-card.resizing{user-select:none;box-shadow:0 0 0 2px var(--edge)}
.cb-head{display:flex;align-items:center;justify-content:space-between;gap:var(--s3,12px)}
.cb-title{margin:0;font-size:1.05rem;font-weight:700}
.cb-pill{padding:3px 10px;border-radius:999px;background:var(--sunken);color:var(--ink2);font-size:.8rem;font-weight:600}
.cb-pill.ok{background:var(--good-soft);color:var(--good)}
.cb-pill.off{background:var(--bad-soft);color:var(--bad)}
.cb-log{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:var(--s2,8px);padding-right:4px}
.cb-empty{margin:auto;text-align:center;color:var(--ink3);font-size:.95rem}
.cb-row{display:flex}
.cb-row.cb-user{justify-content:flex-end}
.cb-bubble{max-width:78%;padding:9px 14px;border-radius:16px;font-size:.95rem;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}
.cb-user .cb-bubble{background:var(--accent);color:var(--on-accent);border-bottom-right-radius:6px}
.cb-bot .cb-bubble{background:var(--sunken);color:var(--ink);border-bottom-left-radius:6px}
.cb-err .cb-bubble{background:var(--bad-soft);color:var(--bad);border:1px solid var(--bad);border-bottom-left-radius:6px}
.cb-retry{display:block;margin-top:6px;padding:0;border:0;background:none;color:inherit;font:inherit;font-weight:700;text-decoration:underline;cursor:pointer}
.cb-dots{display:inline-flex;align-items:center;gap:5px;height:1.45em}
.cb-dots i{width:7px;height:7px;border-radius:50%;background:var(--ink3);opacity:.45}
@media (prefers-reduced-motion:no-preference){.cb-dots i{animation:cbDot 1.2s infinite ease-in-out}.cb-dots i:nth-child(2){animation-delay:.2s}.cb-dots i:nth-child(3){animation-delay:.4s}}
@keyframes cbDot{0%,80%,100%{opacity:.3}40%{opacity:1}}
.cb-form{display:flex;align-items:flex-end;gap:var(--s2,8px)}
.cb-input{flex:1;min-width:0;min-height:42px;max-height:120px;box-sizing:border-box;resize:none;padding:10px 14px;border:var(--edge-w,1px) solid var(--edge);border-radius:var(--r-ctl,12px);background:var(--surface);color:var(--ink);font:inherit;line-height:1.4}
.cb-input:disabled{opacity:.55;cursor:not-allowed}
.cb-send{min-height:42px;padding:0 var(--s5,20px);border:0;border-radius:var(--r-ctl,12px);background:var(--accent);color:var(--on-accent);font:inherit;font-weight:700;cursor:pointer}
.cb-send:disabled{opacity:.45;cursor:not-allowed}
.cb-input:focus-visible,.cb-send:focus-visible,.cb-grip:focus-visible,.cb-retry:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.cb-grip{position:absolute;right:2px;bottom:2px;width:22px;height:22px;padding:0;display:grid;place-items:center;border:0;background:none;color:var(--ink3);cursor:nwse-resize;touch-action:none}
.cb-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;

// Puts the chat box into "host" for one patient. Returns { destroy } for when the page changes.
function mountChatBox(host, patient) {
  if (!document.getElementById('cb-style')) {
    const s = document.createElement('style'); s.id = 'cb-style'; s.textContent = CSS; document.head.appendChild(s);
  }
  const pid = patient && patient.backend ? patient.backend.patientId : null;
  const saved = memo.get('chatSize2', DEF) || DEF;
  const size = { w: Number(saved.w) || DEF.w, h: Number(saved.h) || DEF.h };
  const history = [];
  let busy = false, dead = false, ctl = null, checker = null;

  host.innerHTML = `<section class="cb-card" aria-label="Assistant chat">
    <header class="cb-head"><h2 class="cb-title">Assistant chat</h2><span class="cb-pill" hidden></span></header>
    <div class="cb-log" role="log" aria-live="polite" aria-label="Conversation"></div>
    <form class="cb-form"><textarea class="cb-input" rows="1" aria-label="Message" placeholder="Ask about this patient"></textarea><button type="submit" class="cb-send">Send</button></form>
    <button type="button" class="cb-grip" aria-label="Resize chat: drag, or use the arrow keys" title="Drag to resize. Double-click to reset."><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M17 5 5 17M17 11 11 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
  </section>`;
  const card = host.querySelector('.cb-card'), log = host.querySelector('.cb-log'), pill = host.querySelector('.cb-pill');
  const form = host.querySelector('.cb-form'), input = host.querySelector('.cb-input'), send = host.querySelector('.cb-send'), grip = host.querySelector('.cb-grip');

  /* ---- messages ---- */
  const toEnd = () => { log.scrollTop = log.scrollHeight; };
  const clearEmpty = () => { const e = log.querySelector('.cb-empty'); if (e) e.remove(); };
  const row = (kind, who) => {
    clearEmpty();
    const r = document.createElement('div'); r.className = 'cb-row cb-' + kind;
    const b = document.createElement('div'); b.className = 'cb-bubble';
    if (who) { const s = document.createElement('span'); s.className = 'cb-sr'; s.textContent = who + ': '; b.appendChild(s); }
    r.appendChild(b); log.appendChild(r); toEnd();
    return { r, b };
  };
  const addMsg = (kind, text) => { const m = row(kind, kind === 'user' ? 'You' : 'Assistant'); m.b.appendChild(document.createTextNode(text)); toEnd(); return m.r; };
  const addThinking = () => {
    const m = row('bot', 'Assistant'); m.b.insertAdjacentHTML('beforeend', '<span class="cb-dots" role="status" aria-label="Thinking"><i></i><i></i><i></i></span>');
    toEnd();
    return m.r;
  };
  const addError = (text, again) => {
    const m = row('err', 'Error'); m.b.appendChild(document.createTextNode(text));
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cb-retry'; b.textContent = 'Try again';
    b.addEventListener('click', () => { if (busy) return; m.r.remove(); ask(again); });
    m.b.appendChild(b); toEnd();
  };
  const setPill = kind => { pill.hidden = !kind; pill.className = 'cb-pill' + (kind ? ' ' + kind : ''); pill.textContent = kind === 'ok' ? 'Connected' : kind === 'off' ? 'Not connected' : kind === 'chk' ? 'Checking' : ''; };

  /* ---- asking ---- */
  async function ask(text) {
    busy = true; send.disabled = true;
    const wait = addThinking();
    ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const reply = await sendToBackend(text, pid, history.slice(-HISTORY_TURNS), ctl.signal);
      if (dead) return;
      wait.remove(); addMsg('bot', reply || '(No reply)');
      history.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
      setPill('ok');
    } catch (e) {
      if (dead) return;
      wait.remove();
      const slow = e && e.name === 'AbortError';
      const off = !slow && e && (e.offline || e instanceof TypeError);
      addError(slow ? 'The assistant took too long to answer. Try again.' : off ? 'Could not reach the assistant. Check the connection and try again.' : (e && e.message) || 'Something went wrong. Try again.', text);
      if (off) setPill('off');
    } finally {
      clearTimeout(timer);
      if (!dead) { busy = false; send.disabled = false; }
    }
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || busy || !CHAT_URL) return;
    input.value = ''; grow(); addMsg('user', text); ask(text);
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
  const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; };
  input.addEventListener('input', grow);

  /* ---- start state ---- */
  if (CHAT_URL) {
    log.innerHTML = '<p class="cb-empty">Ask about this patient’s check-ins and scores.</p>';
    setPill('chk');
    const poll = async () => {
      if (dead || busy || document.hidden) return;
      const c = new AbortController(), t = setTimeout(() => c.abort(), 8000);
      const ok = await checkConnection(c.signal); clearTimeout(t);
      if (!dead && !busy) setPill(ok ? 'ok' : 'off');
    };
    poll(); checker = setInterval(poll, CHECK_MS);
  } else {
    setPill('off'); input.disabled = true; send.disabled = true; input.placeholder = 'Not connected';
    log.innerHTML = '<p class="cb-empty">The assistant is not connected yet.</p>';
  }

  /* ---- resize: drag the corner, or use the arrow keys. Size is remembered. ---- */
  const maxW = () => ((host.closest('.pp-grid') || host.parentElement || {}).clientWidth) || 1200;
  const apply = () => {
    const m = maxW();
    size.w = clamp(size.w, Math.min(MIN.w, m), m); size.h = clamp(size.h, MIN.h, 900);
    card.style.width = size.w + 'px'; card.style.height = size.h + 'px';
  };
  const keep = () => memo.set('chatSize2', { w: Math.round(size.w), h: Math.round(size.h) });
  let drag = null;
  grip.addEventListener('pointerdown', e => { e.preventDefault(); grip.setPointerCapture(e.pointerId); const r = card.getBoundingClientRect(); drag = { x: e.clientX, y: e.clientY, w: r.width, h: r.height }; card.classList.add('resizing'); });
  grip.addEventListener('pointermove', e => { if (!drag) return; size.w = drag.w + e.clientX - drag.x; size.h = drag.h + e.clientY - drag.y; apply(); });
  const endDrag = () => { if (!drag) return; drag = null; card.classList.remove('resizing'); keep(); };
  grip.addEventListener('pointerup', endDrag); grip.addEventListener('pointercancel', endDrag);
  grip.addEventListener('dblclick', () => { size.w = DEF.w; size.h = DEF.h; apply(); keep(); });
  grip.addEventListener('keydown', e => {
    const k = { ArrowRight: [32, 0], ArrowLeft: [-32, 0], ArrowDown: [0, 32], ArrowUp: [0, -32] }[e.key];
    if (!k) return; e.preventDefault(); size.w += k[0]; size.h += k[1]; apply(); keep();
  });
  window.addEventListener('resize', apply);
  apply();

  return { destroy() { dead = true; clearInterval(checker); if (ctl) ctl.abort(); window.removeEventListener('resize', apply); host.innerHTML = ''; } };
}

window.mountChatBox = mountChatBox;
})();
