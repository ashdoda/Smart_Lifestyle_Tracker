// WHAT THIS FILE DOES
// Checks the small helper functions in logic.js and the way requests are sent to the server.
// Each test() is one check with a plain-English name. If a check fails, `npm test` says which one.
// Bring in the test tools and the functions being checked
import {test} from 'node:test';import assert from 'node:assert/strict';import {visible,submission,scoreText,filled} from './logic.js';
// Check: saving again keeps the old answers and keeps a real 0
test('resubmission keeps untouched answers and numeric zero',()=>{assert.deepEqual(submission([{id:'a'},{id:'b'}],{a:4,b:2},{b:0}),{a:4,b:0})});
// Check: a follow-up question is left out when the question before it changes
test('hidden followups are excluded when parent changes',()=>{assert.deepEqual(submission([{id:'a'},{id:'b',show_if:{question:'a',equals:'Yes'}}],{a:'Yes',b:'Walk'},{a:'No'}),{a:'No'})});
// Check: a question can depend on an answer from the other check-in of the day
test('cross-period conditions use day context',()=>{assert.equal(visible({show_if:{question:'morning',filled:true}},{morning:'Plan'}),true);assert.equal(filled('N/A'),false)});
// Check: "no score" and "0" are shown differently
test('missing and zero have different presentations',()=>{assert.equal(scoreText(null),'—');assert.equal(scoreText(0),'0')});

// Now the checks for sending requests to the server
import {request} from './logic.js';
// Check: requests are sent one at a time, in order
test('requests run one at a time, in order', async () => {
  const log = []; let open = 0, maxOpen = 0;
  globalThis.fetch = async path => { open++; maxOpen = Math.max(maxOpen, open); log.push('start ' + path); await new Promise(r => setTimeout(r, 5)); open--; return {ok: true, status: 200, text: async () => '{}'}; };
  await Promise.all([request('/a'), request('/b'), request('/c')]);
  assert.equal(maxOpen, 1); assert.deepEqual(log, ['start /api/a', 'start /api/b', 'start /api/c']);
});
// Check: if the server cannot be reached, the message is plain and later requests still work
test('a network failure gives a plain message and does not block later requests', async () => {
  globalThis.fetch = async () => { throw new TypeError('failed'); };
  await assert.rejects(request('/x'), /Cannot reach the server/);
  globalThis.fetch = async () => ({ok: true, status: 200, text: async () => '{"fine":true}'});
  assert.deepEqual(await request('/y'), {fine: true});
});
// Check: when the server says a field is wrong, that is kept so the form can show it
test('server field errors are kept on the error', async () => {
  globalThis.fetch = async () => ({ok: false, status: 422, text: async () => JSON.stringify({detail: {errors: {first_name: 'Required'}}})});
  await assert.rejects(request('/z'), e => e.fields.first_name === 'Required');
});
