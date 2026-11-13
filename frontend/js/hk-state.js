/* ===== Keeps the prototype's in-memory state when the browser moves from one page file to the next =====
   The screens keep a little state in memory (who is signed in, today's check-in progress, favorites, check-in length).
   Because every screen is now its own page file, that state is copied into sessionStorage when a page is left and
   put back when the next page opens. This is mock-only plumbing: with a real server these values come from the API. */
const HK_STATE_KEY = 'hk.state';
function hkSaveState() {
  try {
    const patients = {};
    PATIENTS.forEach(p => { patients[p.id] = { fav: p.fav, lengthNow: p.lengthNow, lengthChosen: p.lengthChosen, unlocked: p.unlocked }; });
    sessionStorage.setItem(HK_STATE_KEY, JSON.stringify({ session, PSTATE, patients }));
  } catch (e) { /* storage blocked: nothing to keep */ }
}
function hkRestoreState() {
  try {
    const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    if (nav && nav.type === 'reload') { sessionStorage.removeItem(HK_STATE_KEY); return; }   /* a refresh starts clean, like the one-file prototype did */
    const raw = sessionStorage.getItem(HK_STATE_KEY); if (!raw) return;
    const s = JSON.parse(raw);
    Object.assign(session, s.session || {});
    Object.assign(PSTATE, s.PSTATE || {});
    Object.entries(s.patients || {}).forEach(([id, v]) => { const p = PAT[id]; if (p) Object.assign(p, v); });
    const t = JSON.parse(sessionStorage.getItem('hk.toast') || 'null');
    if (t && Date.now() - t[1] < 2400) setTimeout(() => toast(t[0]), 0);
  } catch (e) { /* ignore a damaged snapshot */ }
}
window.addEventListener('pagehide', hkSaveState);
