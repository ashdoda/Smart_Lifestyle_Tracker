// WHAT THIS FILE DOES
// This file makes the app load its data from the server instead of using built-in example data.
/* Loads data from the server instead of the built-in example data. HK.ready waits until src/hk-backend.js has filled HK.data. */
// No placeholder score: a patient with no data shows "no score yet"
HK.config.defaultScore = null;
// Wait here until src/hk-backend.js has finished loading the data, then start the app
HK.ready = function (cb) { window.__hkStart = cb; if (window.__hkLoaded) cb(); };
