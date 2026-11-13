// WHAT THIS FILE DOES
// Each screen is its own page file, so moving between them reloads the page.
// This file saves who is signed in just before leaving a page and puts it back on the next one.
/* ===== Keeps who is signed in when the browser moves from one page file to the next ===== */
// The name the saved sign-in is stored under in the browser
const HK_STATE_KEY = 'hk.state';
// Saves who is signed in
function hkSaveState() {
  try { sessionStorage.setItem(HK_STATE_KEY, JSON.stringify({ session })); } catch (e) { /* storage blocked: nothing to keep */ }
}
// Puts the saved sign-in back. A manual refresh clears it, so a refresh goes back to the sign-in page
function hkRestoreState() {
  try {
    const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    if (nav && nav.type === 'reload') { sessionStorage.removeItem(HK_STATE_KEY); return; }
    const raw = sessionStorage.getItem(HK_STATE_KEY); if (!raw) return;
    Object.assign(session, JSON.parse(raw).session || {});
    const t = JSON.parse(sessionStorage.getItem('hk.toast') || 'null');
    if (t && Date.now() - t[1] < 2400) setTimeout(() => toast(t[0]), 0);
  } catch (e) { /* ignore a damaged snapshot */ }
}
// Save automatically when the page is left
window.addEventListener('pagehide', hkSaveState);
