/*
  @license
	Rollup.js v4.68.0
	Fri, 06 Nov 2026 16:52:39 GMT - commit b93d9a40e1eed7a78069a58ca191260f5c094727

	https://github.com/rollup/rollup

	Released under the MIT License.
*/
'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const rollup = require('./shared/rollup.js');
const rollup_js = require('./shared/node-entry.js');
require('./shared/parseAst.js');
require('./native.js');
require('node:path');
require('node:process');
require('path');
require('node:perf_hooks');
require('node:fs/promises');
require('./shared/fsevents-importer.js');



exports.defineConfig = rollup.defineConfig;
exports.rollup = rollup.rollup;
exports.VERSION = rollup_js.VERSION;
exports.watch = rollup_js.watch;
//# sourceMappingURL=rollup.js.map
