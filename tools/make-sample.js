#!/usr/bin/env node
/*
 * Turns a .sql dump into a preloaded sample in samples/.
 * Only for maintainers: Joinscope itself needs nothing installed.
 *
 *   node tools/make-sample.js <dump.sql> <id> "<label>" [--default]
 *
 * INSERT statements are dropped (their rows are counted first), so the sample
 * holds the structure and row counts only.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var parser = require('../js/parser.js');

var args = process.argv.slice(2);
var isDefault = args.indexOf('--default') >= 0;
args = args.filter(function (a) { return a !== '--default'; });
if (args.length < 3) {
  console.error('Usage: node tools/make-sample.js <dump.sql> <id> "<label>" [--default]');
  process.exit(1);
}
var file = args[0], id = args[1], label = args[2];

var sql = fs.readFileSync(file, 'utf8');
var model = parser.parse(sql);
var rowCounts = {};
Object.keys(model.tables).forEach(function (t) {
  if (model.tables[t].rows) rowCounts[t] = model.tables[t].rows;
});

// Without DELIMITER changes, statements can be cut out and joined back with ";".
// With them (triggers, procedures), keep the text as it is.
var structure = sql;
if (!/^\s*DELIMITER\s/im.test(sql)) {
  var kept = [];
  parser._scan(sql, function (start, end) {
    var stmt = sql.slice(start, end).trim();
    if (!/^INSERT\s/i.test(stmt)) kept.push(stmt + ';');
  });
  structure = kept.join('\n\n') + '\n';
}

var entry = {
  name: id,
  label: label,
  generatedAt: new Date().toISOString().slice(0, 10),
  sql: structure,
  rowCounts: rowCounts
};
var body = isDefault
  ? 'window.DEFAULT_SCHEMA = ' + JSON.stringify(entry, null, 1) + ';\n'
  : 'window.EXTRA_SCHEMAS = window.EXTRA_SCHEMAS || {};\nwindow.EXTRA_SCHEMAS[' + JSON.stringify(id) + '] = ' + JSON.stringify(entry, null, 1) + ';\n';
var out = path.join(__dirname, '..', 'samples', id + '.js');
fs.writeFileSync(out, '// Sample schema for the Joinscope demo, made by tools/make-sample.js. Structure and row counts only.\n' + body);
console.log(out, Object.keys(model.tables).length + ' tables', Object.keys(rowCounts).length + ' with row counts', model.warnings.length + ' warnings');
