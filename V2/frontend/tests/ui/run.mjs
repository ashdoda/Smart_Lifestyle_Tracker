// WHAT THIS FILE DOES
// Runs all the browser tests in this folder a few at a time and prints which passed or failed.
// It is started by "npm test". If the dev server or backend is not running it says so and skips.
// Browser tests: each file drives the real pages in headless Chromium (Python Playwright).
// Needs Vite on :5173, the backend on :8000 (use a disposable database: add_test creates patients) and `pip install playwright`.
// If those are not running it says so and skips; STRICT=1 turns the skip into a failure. UI_JOBS sets how many files run at once (default 3).
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const up = async u => { try { return (await fetch(u)).status < 500; } catch { return false; } };
const bail = why => { console.log(`\nUI TESTS SKIPPED: ${why}`); process.exit(process.env.STRICT === '1' ? 1 : 0); };
if (!(await up('http://127.0.0.1:5173/'))) bail('Vite is not running on 127.0.0.1:5173 (npm run dev)');
if (!(await up('http://127.0.0.1:8000/docs'))) bail('backend is not running on 127.0.0.1:8000');
const py = process.env.PYTHON || 'python3';
if (spawnSync(py, ['-c', 'import playwright'], { stdio: 'ignore' }).status !== 0) bail('python Playwright is not installed (pip install playwright && playwright install chromium)');
// warm Vite's first-load transforms so the parallel browsers do not all hit a cold server
await Promise.all(['patient-today', 'patient-checkin', 'patient-week', 'provider-patients', 'provider-patient', 'provider-report', 'login'].map(n => fetch(`http://127.0.0.1:5173/${n}.html`).then(r => r.text()).catch(() => 0)));
const out = join(here, '.out');
const run = f => new Promise(res => {
  const cwd = join(out, f.replace('.py', '')); mkdirSync(join(cwd, 'shots'), { recursive: true });
  let text = ''; const c = spawn(py, [join(here, f)], { cwd });
  c.stdout.on('data', d => text += d); c.stderr.on('data', d => text += d);
  c.on('close', code => res({ f, code, text }));
});
const queue = readdirSync(here).filter(n => n.endsWith('.py')).sort(), results = [];
await Promise.all(Array.from({ length: +process.env.UI_JOBS || 3 }, async () => { for (let f; (f = queue.shift());) results.push(await run(f)); }));
results.sort((a, b) => a.f.localeCompare(b.f));
let bad = 0;
for (const { f, code, text } of results) {
  const ok = code === 0 && !/^FAIL|Traceback/m.test(text);
  const n = (text.match(/^PASS/gm) || []).length, tot = text.match(/(\d+) ?(?:\/|of) ?(\d+)/g);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${f}  (${n} passing checks)`); if (!ok) { bad++; console.log(text.split('\n').slice(-12).join('\n')); }
}
console.log(bad ? `\n${bad} UI test file(s) failed` : '\nAll UI test files passed');
process.exit(bad ? 1 : 0);
