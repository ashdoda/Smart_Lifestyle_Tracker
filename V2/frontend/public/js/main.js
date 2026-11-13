// WHAT THIS FILE DOES
// This is the last script to run. It starts the app: it loads the patients, restores who was signed in and draws the first page.
/* ===== boot ===== */
/* safety net: any screen that is not built yet shows a friendly placeholder instead of an error */
// Safety net: if a screen is missing, show a simple "being finished" message instead of an error
[['report', /^\/provider\/patient\/([^/?#]+)\/report$/, 'Weekly report'],
 ['p-home', /^\/patient$/, 'Patient app: today'], ['p-checkin', /^\/patient\/checkin$/, 'Patient app: check-in'], ['p-week', /^\/patient\/week$/, 'Patient app: weekly summary']]
  .forEach(([g, re, name]) => { if (!ROUTES.some(r => r.group === g)) route(re, () => ({ html: providerShell(`<div class="card" style="max-width:520px"><h2>${name}</h2><p class="ink2" style="margin:8px 0 16px">This screen is being finished in the next version of the prototype.</p><a class="btn primary" href="#/provider">Back to patient list</a></div>`), mount: mountShell }), g); });
// Waits until the data has loaded, then starts the app
HK.ready(() => {
  // Put the patients from the server into the list
  hkLoadPatients(HK.data.patients);
  // Remember who was signed in on the previous page
  hkRestoreState();
  window.__hkBooted = true; syncLastActive();
  initProto(); setProtoH();
  // Re-fit the page when the window size changes
  window.addEventListener('resize', setProtoH);
  // Open the first screen if none is chosen yet, otherwise draw the current one
  if (!location.hash) location.replace('#' + defaultRoute()); else render();
});
