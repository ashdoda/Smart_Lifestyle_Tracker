/* ===== boot ===== */
/* safety net: any screen that is not built yet shows a friendly placeholder instead of an error */
[['cards', /^\/provider\/patient\/([^/?#]+)\/cards$/, 'Card settings'], ['report', /^\/provider\/patient\/([^/?#]+)\/report$/, 'Weekly report'],
 ['p-home', /^\/patient$/, 'Patient app: today'], ['p-checkin', /^\/patient\/checkin$/, 'Patient app: check-in'], ['p-week', /^\/patient\/week$/, 'Patient app: weekly summary']]
  .forEach(([g, re, name]) => { if (!ROUTES.some(r => r.group === g)) route(re, () => ({ html: providerShell(`<div class="card" style="max-width:520px"><h2>${name}</h2><p class="ink2" style="margin:8px 0 16px">This screen is being finished in the next version of the prototype.</p><a class="btn primary" href="#/provider">Back to patient list</a></div>`), mount: mountShell }), g); });
HK.ready(() => {
  hkLoadPatients(HK.data.patients);
  restoreEnrollment(); hkRestoreState();
  window.__hkBooted = true; syncLastActive();
  initProto(); setProtoH();
  window.addEventListener('resize', setProtoH);
  if (!location.hash) location.replace('#' + defaultRoute()); else render();
});
