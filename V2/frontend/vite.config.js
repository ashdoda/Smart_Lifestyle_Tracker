// WHAT THIS FILE DOES
// Settings for Vite, the tool that runs the app while we build it and packages it when we are done.
import {defineConfig} from 'vite';
import {resolve} from 'node:path';
// The list of page files that make up the app
const pages = ['login','provider-patients','provider-add','provider-patient','provider-report','patient-today','patient-checkin','patient-week'];
export default defineConfig({
  // While developing: anything sent to /api is passed on to the server running on this computer (port 8000)
  server: {proxy: {'/api': {target: 'http://127.0.0.1:8000', rewrite: p => p.replace(/^\/api/, '')}}},
  // When packaging: include every page in the list above
  build: {rollupOptions: {input: Object.fromEntries(pages.map(n => [n, resolve(__dirname, n + '.html')]))}},
});
