/*
 * Joinscope's JSON formats, both read into the same model the SQL parser produces.
 *
 * - "joinscope-schema": a whole schema (docs/schema-format.md). Exported by Joinscope,
 *   and the easiest format for anyone writing an exporter for another database.
 * - "joinscope-catalogue": the one-cell result of a catalogue query (queries/*.sql), a
 *   flat list of columns, keys and indexes read from the database's own catalogue.
 *
 * Works in the browser (window.SchemaJson) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  var Parser = (typeof module !== 'undefined' && module.exports) ? require('./parser.js') : root.SchemaParser;
  var DEFAULT_SCHEMAS = /^(public|dbo|main)$/i;
  var DIALECTS = /^(mysql|postgres|sqlite|sqlserver|other)$/;

  function newTable(name) {
    return { name: name, columns: [], primaryKey: [], indexes: [], fks: [], triggers: [], engine: null, comment: null, autoIncrement: null, rows: null };
  }

  function emptyModel(dialect) {
    return { dialect: dialect, tables: Object.create(null), views: Object.create(null), triggers: [], warnings: [], statements: 0, insertRows: 0, hasData: false };
  }

  // Pasted JSON can be anything: lists that are not lists, names that are not text.
  var list = function (v) { return Array.isArray(v) ? v : []; };
  var names = function (v) { return list(v).filter(function (x) { return x != null && typeof x !== 'object'; }).map(String); };
  // quoted parts keep their case, the rest is lower case; the default schema is left off
  var cleanType = function (t) {
    return String(t == null ? '' : t).replace(/"([^"]*)"|[^"]+/g, function (all, quoted) { return quoted != null ? quoted : all.toLowerCase(); })
      .replace(/^(public|main|dbo)\./i, '');
  };

  var bool = function (v) { return v === true || v === 1 || v === '1' || v === 't' || v === 'true' || v === 'YES'; };
  var rule = function (v) {
    var r = String(v || 'RESTRICT').toUpperCase().replace(/_/g, ' ').trim();
    return r === 'NO ACTION' || r === '' ? 'RESTRICT' : r;
  };

  // MariaDB reports a text default with its quotes, and NULL as the word NULL
  function cleanDefault(v, dialect) {
    if (v == null) return null;
    var s = String(v);
    if (dialect === 'mysql' && /^NULL$/i.test(s)) return null;
    if (/^'.*'$/.test(s)) return s.slice(1, -1).replace(/''/g, "'");
    if (dialect === 'postgres') {
      if (/^nextval\(/i.test(s)) return null;
      var m = s.match(/^'((?:[^']|'')*)'::[\w ."]+(\[\])?$/);
      if (m) return m[1].replace(/''/g, "'");
    }
    return s;
  }

  // ---------- joinscope-schema ----------

  function fromModel(model, name) {
    var tables = Object.keys(model.tables).sort().map(function (n) {
      var t = model.tables[n];
      return {
        name: n,
        comment: t.comment || undefined,
        rows: t.rows == null ? undefined : t.rows,
        columns: t.columns.map(function (c) {
          return { name: c.name, type: c.type, nullable: !!c.nullable, default: c.default == null ? undefined : c.default,
            autoIncrement: c.autoIncrement || undefined, generated: c.generated || undefined, comment: c.comment || undefined };
        }),
        primaryKey: t.primaryKey.slice(),
        indexes: t.indexes.map(function (i) { return { name: i.name, unique: i.type === 'UNIQUE', type: i.type === 'UNIQUE' ? undefined : i.type, columns: i.columns.slice() }; }),
        foreignKeys: t.fks.map(function (f) {
          return { name: f.name || undefined, columns: f.columns.slice(), references: f.refTable, referencedColumns: f.refColumns.slice(), onDelete: f.onDelete, onUpdate: f.onUpdate };
        }),
        partitions: t.partitions || undefined
      };
    });
    var views = Object.keys(model.views).sort().map(function (v) { return { name: v, sql: model.views[v].sql }; });
    var triggers = model.triggers.map(function (t) { return { name: t.name, table: t.table, timing: t.timing, event: t.event }; });
    return JSON.parse(JSON.stringify({ format: 'joinscope-schema', version: 1, name: name || undefined, dialect: model.dialect || 'mysql', tables: tables, views: views, triggers: triggers }));
  }

  function viewRefs(sql, dialect) {
    if (!sql) return [];
    var stmt = /^\s*CREATE\b/i.test(sql) ? sql : 'CREATE VIEW joinscope_view AS ' + sql;
    var parsed = Parser.parse(stmt, { dialect: dialect === 'other' || dialect === 'sqlserver' ? 'postgres' : dialect });
    var first = Object.keys(parsed.views)[0];
    return first ? parsed.views[first].refs : [];
  }

  function fromSchemaJson(doc) {
    var dialect = DIALECTS.test(doc.dialect) ? doc.dialect : 'other';
    var model = emptyModel(dialect);
    list(doc.tables).forEach(function (td) {
      if (!td || typeof td !== 'object' || td.name == null) return;
      var t = newTable(String(td.name));
      t.comment = td.comment == null ? null : String(td.comment);
      t.rows = td.rows == null || isNaN(Number(td.rows)) ? null : Number(td.rows);
      t.columns = list(td.columns).filter(function (c) { return c && typeof c === 'object' && c.name != null; }).map(function (c) {
        return { name: String(c.name), type: cleanType(c.type), nullable: c.nullable !== false, default: c.default == null ? null : String(c.default),
          autoIncrement: !!c.autoIncrement, primary: false, unique: false, comment: c.comment == null ? null : String(c.comment), generated: !!c.generated };
      });
      t.primaryKey = names(td.primaryKey);
      t.indexes = list(td.indexes).filter(function (i) { return i && typeof i === 'object'; }).map(function (i) {
        var ix = { type: i.unique ? 'UNIQUE' : (i.type && /^(FULLTEXT|SPATIAL)$/i.test(i.type) ? String(i.type).toUpperCase() : 'INDEX'), name: i.name == null ? null : String(i.name), columns: names(i.columns) };
        if (i.partial) ix.partial = true;
        return ix;
      }).filter(function (i) { return i.columns.length; });
      t.fks = list(td.foreignKeys).filter(function (f) { return f && typeof f === 'object' && f.references != null; }).map(function (f) {
        return { name: f.name == null ? null : String(f.name), columns: names(f.columns), refTable: String(f.references), refColumns: names(f.referencedColumns), onDelete: rule(f.onDelete), onUpdate: rule(f.onUpdate) };
      }).filter(function (f) { return f.columns.length; });
      if (Array.isArray(td.partitions)) t.partitions = names(td.partitions);
      model.tables[t.name] = t;
    });
    list(doc.views).forEach(function (v) {
      if (!v || typeof v !== 'object' || v.name == null) return;
      var sql = v.sql == null ? '' : String(v.sql);
      model.views[String(v.name)] = { name: String(v.name), refs: Array.isArray(v.refs) ? names(v.refs) : viewRefs(sql, dialect), sql: sql };
    });
    list(doc.triggers).forEach(function (tr) {
      if (!tr || typeof tr !== 'object' || tr.name == null) return;
      var tn = String(tr.table);
      model.triggers.push({ name: String(tr.name), timing: String(tr.timing || ''), event: String(tr.event || ''), table: tn, body: String(tr.body || '') });
      if (model.tables[tn]) model.tables[tn].triggers.push(String(tr.name));
    });
    return finish(model);
  }

  // ---------- joinscope-catalogue ----------

  function fromCatalogue(doc) {
    var dialect = DIALECTS.test(doc.dialect) ? doc.dialect : 'other';
    var model = emptyModel(dialect);
    ['tables', 'columns', 'primary_keys', 'foreign_keys', 'indexes', 'views', 'triggers'].forEach(function (k) {
      doc[k] = list(doc[k]).filter(function (r) { return r && typeof r === 'object'; });
    });
    var nameOf = function (row, key) {
      var table = row[key || 'table'];
      var schema = row[key ? key.replace('table', 'schema') : 'schema'];
      return schema && !DEFAULT_SCHEMAS.test(schema) && dialect !== 'mysql' ? schema + '.' + table : String(table);
    };
    var table = function (row) {
      var n = nameOf(row);
      return model.tables[n] || (model.tables[n] = newTable(n));
    };
    var byPosition = function (a, b) { return (Number(a.position) || 0) - (Number(b.position) || 0); };

    (doc.tables || []).forEach(function (r) {
      var t = table(r);
      if (r.rows != null && Number(r.rows) >= 0) t.rows = Number(r.rows);
      if (r.comment) t.comment = r.comment;
      if (r.engine) t.engine = r.engine;
    });
    (doc.columns || []).slice().sort(byPosition).forEach(function (r) {
      table(r).columns.push({
        name: String(r.column), type: cleanType(r.type), nullable: bool(r.nullable), default: cleanDefault(r.default, dialect),
        autoIncrement: bool(r.auto), primary: false, unique: false, comment: r.comment || null, generated: bool(r.generated)
      });
    });
    (doc.primary_keys || []).slice().sort(byPosition).forEach(function (r) {
      var t = table(r);
      if (t.primaryKey.indexOf(String(r.column)) < 0) t.primaryKey.push(String(r.column));
    });

    // composite keys and indexes come one row per column: gather them by name
    var groups = {};
    (doc.foreign_keys || []).slice().sort(byPosition).forEach(function (r) {
      var key = 'fk|' + nameOf(r) + '|' + (r.name || r.id);
      var g = groups[key] || (groups[key] = { kind: 'fk', table: nameOf(r), row: r, cols: [], refCols: [] });
      g.cols.push(String(r.column));
      if (r.ref_column != null) g.refCols.push(String(r.ref_column));
    });
    (doc.indexes || []).slice().sort(byPosition).forEach(function (r) {
      var key = 'ix|' + nameOf(r) + '|' + r.name;
      var g = groups[key] || (groups[key] = { kind: 'ix', table: nameOf(r), row: r, cols: [] });
      if (r.column != null) g.cols.push(String(r.column));
    });
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      var t = model.tables[g.table] || (model.tables[g.table] = newTable(g.table));
      if (g.kind === 'fk') {
        var refTable = nameOf(g.row, 'ref_table');
        var dup = t.fks.some(function (f) { return f.refTable === refTable && f.columns.join() === g.cols.join(); });
        if (!dup) t.fks.push({ name: g.row.name || null, columns: g.cols, refTable: refTable, refColumns: g.refCols, onDelete: rule(g.row.on_delete), onUpdate: rule(g.row.on_update) });
      } else if (g.cols.length) {
        var type = /FULLTEXT/i.test(g.row.type || '') ? 'FULLTEXT' : /SPATIAL/i.test(g.row.type || '') ? 'SPATIAL' : bool(g.row.unique) ? 'UNIQUE' : 'INDEX';
        var ix = { type: type, name: g.row.name || null, columns: g.cols };
        if (bool(g.row.partial)) ix.partial = true;
        t.indexes.push(ix);
      }
    });

    (doc.views || []).forEach(function (r) {
      var n = r.schema && !DEFAULT_SCHEMAS.test(r.schema) && dialect !== 'mysql' ? r.schema + '.' + r.name : String(r.name);
      delete model.tables[n];
      model.views[n] = { name: n, refs: viewRefs(r.sql, dialect), sql: r.sql || '' };
    });
    (doc.triggers || []).forEach(function (r) {
      var tn = nameOf(r);
      model.triggers.push({ name: String(r.name), timing: String(r.timing || '').toUpperCase(), event: String(r.event || '').toUpperCase(), table: tn, body: r.body || '' });
      if (model.tables[tn]) model.tables[tn].triggers.push(String(r.name));
    });
    return finish(model);
  }

  function finish(model) {
    // a key with no referenced columns points at the parent's primary key
    Object.keys(model.tables).forEach(function (k) {
      model.tables[k].fks.forEach(function (fk) {
        if (!fk.refColumns.length && model.tables[fk.refTable]) fk.refColumns = model.tables[fk.refTable].primaryKey.slice();
      });
    });
    return model;
  }

  // Any of the formats above; throws a plain message when it is neither.
  function toModel(doc) {
    if (typeof doc === 'string') doc = JSON.parse(doc);
    // a catalogue result pasted with its column heading or quotes still around it
    if (doc && !doc.format && doc.joinscope) doc = typeof doc.joinscope === 'string' ? JSON.parse(doc.joinscope) : doc.joinscope;
    if (Array.isArray(doc) && doc.length === 1) return toModel(doc[0]);
    if (!doc || typeof doc !== 'object') throw new Error('This is not a Joinscope schema or catalogue result.');
    if (doc.format === 'joinscope-catalogue') return fromCatalogue(doc);
    if (doc.format === 'joinscope-schema' || Array.isArray(doc.tables)) return fromSchemaJson(doc);
    throw new Error('This JSON is not a Joinscope schema or catalogue result (no "format" field).');
  }

  // Text that holds JSON, perhaps wrapped by the tool it was copied from ("joinscope" heading, quotes).
  function looksLikeJson(text) {
    var t = String(text).replace(/^﻿/, '').trim();
    return /^[[{]/.test(t) || /^"?joinscope"?\s*[\r\n]+\s*["{]/i.test(t) || /^"\{/.test(t);
  }

  function parseText(text) {
    var t = String(text).replace(/^﻿/, '').trim();
    t = t.replace(/^"?joinscope"?\s*[\r\n]+/i, '');
    if (/^"\{/.test(t)) t = JSON.parse(t.replace(/\r?\n/g, ' '));
    return toModel(t);
  }

  var api = { toModel: toModel, fromModel: fromModel, looksLikeJson: looksLikeJson, parseText: parseText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SchemaJson = api;
})(this);
