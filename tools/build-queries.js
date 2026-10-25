#!/usr/bin/env node
/*
 * Copies queries/*.sql into js/queries.js, so the page can show them and run the
 * SQLite one on a dropped file (a page opened from disk cannot fetch files).
 * Only for maintainers; run it after changing a query. tests/run.js checks they match.
 *
 *   node tools/build-queries.js
 */
'use strict';
var fs = require('fs');
var path = require('path');

var dir = path.join(__dirname, '..', 'queries');
var out = {};
fs.readdirSync(dir).filter(function (f) { return /\.sql$/.test(f); }).sort().forEach(function (f) {
  out[f.replace(/\.sql$/, '')] = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n');
});

var body = '// Made by tools/build-queries.js from queries/*.sql. Do not edit by hand.\n' +
  '(function (root) {\n  var queries = ' + JSON.stringify(out, null, 2) + ';\n' +
  "  if (typeof module !== 'undefined' && module.exports) module.exports = queries;\n" +
  '  else root.JOINSCOPE_QUERIES = queries;\n})(this);\n';
fs.writeFileSync(path.join(__dirname, '..', 'js', 'queries.js'), body);
console.log('js/queries.js: ' + Object.keys(out).join(', '));
