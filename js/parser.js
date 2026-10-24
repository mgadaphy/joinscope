/*
 * Schema parser for MySQL / MariaDB dumps (mysqldump, phpMyAdmin, SHOW CREATE TABLE output).
 * Reads CREATE TABLE, ALTER TABLE, CREATE VIEW, CREATE TRIGGER and DROP statements.
 * INSERT statements are not kept; only their rows are counted.
 * Works in the browser (window.SchemaParser) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  function unquote(id) {
    if (!id) return id;
    id = id.trim();
    // schema-qualified names: keep the last part
    var parts = id.match(/`[^`]*`|"[^"]*"|[^.\s]+/g) || [id];
    var last = parts[parts.length - 1];
    if ((last[0] === '`' && last[last.length - 1] === '`') || (last[0] === '"' && last[last.length - 1] === '"')) {
      last = last.slice(1, -1);
    }
    return last;
  }

  function unquoteString(s) {
    if (s == null) return s;
    s = s.trim();
    if (s.length >= 2 && (s[0] === "'" || s[0] === '"') && s[s.length - 1] === s[0]) {
      return s.slice(1, -1).replace(/''/g, "'").replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    }
    return s;
  }

  var IDENT = '(?:`[^`]+`|"[^"]+"|[\\w$]+)';
  var QUALIFIED = IDENT + '(?:\\s*\\.\\s*' + IDENT + ')?';

  // Split a dump into statements, honouring quotes, comments and DELIMITER changes.
  // Executable comments (/*!40101 ... */) are treated as code, the way MySQL runs them.
  function scan(sql, onStatement) {
    var n = sql.length;
    var i = 0;
    var delim = ';';
    var start = -1;
    var depth0Opens = 0;
    var parenDepth = 0;
    var execComment = 0;

    function flush(end) {
      if (start >= 0) onStatement(start, end, depth0Opens);
      start = -1;
      depth0Opens = 0;
      parenDepth = 0;
    }

    while (i < n) {
      var c = sql.charCodeAt(i);

      if (start < 0) {
        // between statements: skip whitespace and look for DELIMITER
        if (c === 32 || c === 9 || c === 10 || c === 13) { i++; continue; }
        if ((c === 68 || c === 100) && /^DELIMITER\s/i.test(sql.substr(i, 10))) {
          var eol = sql.indexOf('\n', i);
          if (eol < 0) eol = n;
          var d = sql.slice(i + 9, eol).trim();
          if (d) delim = d;
          i = eol + 1;
          continue;
        }
      }

      // line comments
      if (c === 35 || (c === 45 && sql.charCodeAt(i + 1) === 45 && (i + 2 >= n || /\s/.test(sql[i + 2])))) {
        var e = sql.indexOf('\n', i);
        i = e < 0 ? n : e + 1;
        continue;
      }
      // block comments
      if (c === 47 && sql.charCodeAt(i + 1) === 42) {
        if (sql.charCodeAt(i + 2) === 33) {
          // executable comment: drop the marker, keep the content
          if (start < 0) start = i;
          i += 3;
          while (i < n && sql.charCodeAt(i) >= 48 && sql.charCodeAt(i) <= 57) i++;
          execComment++;
          continue;
        }
        var ce = sql.indexOf('*/', i + 2);
        i = ce < 0 ? n : ce + 2;
        continue;
      }
      if (execComment > 0 && c === 42 && sql.charCodeAt(i + 1) === 47) {
        execComment--;
        i += 2;
        continue;
      }

      if (start < 0) start = i;

      // quoted strings and identifiers
      if (c === 39 || c === 34 || c === 96) {
        var q = c;
        i++;
        while (i < n) {
          var cc = sql.charCodeAt(i);
          if (cc === 92 && q !== 96) { i += 2; continue; }
          if (cc === q) {
            if (sql.charCodeAt(i + 1) === q) { i += 2; continue; }
            break;
          }
          i++;
        }
        i++;
        continue;
      }

      if (c === 40) { if (parenDepth === 0) depth0Opens++; parenDepth++; }
      else if (c === 41) { if (parenDepth > 0) parenDepth--; }

      if (sql.startsWith(delim, i)) {
        flush(i);
        i += delim.length;
        execComment = 0;
        continue;
      }
      i++;
    }
    flush(n);
  }

  function stripExecMarkers(s) {
    return s.replace(/\/\*!\d*/g, ' ').replace(/\*\//g, ' ');
  }

  // Split by commas that are not inside parentheses or quotes.
  function splitTopLevel(s) {
    var out = [];
    var depth = 0;
    var cur = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === "'" || c === '"' || c === '`') {
        var q = c;
        i++;
        while (i < s.length) {
          if (s[i] === '\\' && q !== '`') { i += 2; continue; }
          if (s[i] === q) { if (s[i + 1] === q) { i += 2; continue; } break; }
          i++;
        }
        continue;
      }
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && depth === 0) {
        out.push(s.slice(cur, i).trim());
        cur = i + 1;
      }
    }
    var last = s.slice(cur).trim();
    if (last) out.push(last);
    return out;
  }

  // Index of the parenthesis that closes the one at `open`.
  function matchParen(s, open) {
    var depth = 0;
    for (var i = open; i < s.length; i++) {
      var c = s[i];
      if (c === "'" || c === '"' || c === '`') {
        var q = c;
        i++;
        while (i < s.length) {
          if (s[i] === '\\' && q !== '`') { i += 2; continue; }
          if (s[i] === q) { if (s[i + 1] === q) { i += 2; continue; } break; }
          i++;
        }
        continue;
      }
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (depth === 0) return i; }
    }
    return -1;
  }

  function parseColumnList(s) {
    // "(`a`,`b`(10) DESC)" -> ["a","b"]
    var inner = s.trim().replace(/^\(/, '').replace(/\)$/, '');
    return splitTopLevel(inner).map(function (p) {
      var m = p.match(new RegExp('^' + IDENT));
      return m ? unquote(m[0]) : p;
    });
  }

  var FK_RE = new RegExp(
    '^(?:CONSTRAINT\\s+(' + IDENT + ')\\s+)?FOREIGN\\s+KEY\\s*(?:' + IDENT + '\\s*)?(\\([^)]*\\))\\s*REFERENCES\\s+(' + QUALIFIED + ')\\s*(\\([^)]*\\))([\\s\\S]*)$', 'i');

  function parseFk(def) {
    var m = def.match(FK_RE);
    if (!m) return null;
    var rest = m[5] || '';
    var od = rest.match(/ON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)/i);
    var ou = rest.match(/ON\s+UPDATE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)/i);
    return {
      name: m[1] ? unquote(m[1]) : null,
      columns: parseColumnList(m[2]),
      refTable: unquote(m[3]),
      refColumns: parseColumnList(m[4]),
      // NO ACTION and RESTRICT behave the same in MySQL and MariaDB; MySQL 8 dumps omit the clause
      onDelete: od ? od[1].toUpperCase().replace(/\s+/g, ' ').replace('NO ACTION', 'RESTRICT') : 'RESTRICT',
      onUpdate: ou ? ou[1].toUpperCase().replace(/\s+/g, ' ').replace('NO ACTION', 'RESTRICT') : 'RESTRICT'
    };
  }

  function parseIndex(def) {
    var m = def.match(new RegExp('^(?:CONSTRAINT\\s+(?:' + IDENT + '\\s+)?)?(PRIMARY\\s+KEY|UNIQUE(?:\\s+(?:KEY|INDEX))?|FULLTEXT(?:\\s+(?:KEY|INDEX))?|SPATIAL(?:\\s+(?:KEY|INDEX))?|KEY|INDEX)\\s*(' + IDENT + ')?\\s*(?:USING\\s+\\w+\\s*)?(\\([\\s\\S]*\\))', 'i'));
    if (!m) return null;
    var kind = m[1].toUpperCase();
    var type = kind.indexOf('PRIMARY') === 0 ? 'PRIMARY' : kind.indexOf('UNIQUE') === 0 ? 'UNIQUE' : kind.indexOf('FULLTEXT') === 0 ? 'FULLTEXT' : kind.indexOf('SPATIAL') === 0 ? 'SPATIAL' : 'INDEX';
    var open = m[3].indexOf('(');
    var close = matchParen(m[3], open);
    return {
      type: type,
      name: m[2] ? unquote(m[2]) : (type === 'PRIMARY' ? 'PRIMARY' : null),
      columns: parseColumnList(m[3].slice(open, close + 1))
    };
  }

  function parseColumn(def) {
    var m = def.match(new RegExp('^(' + IDENT + ')\\s+([\\s\\S]*)$'));
    if (!m) return null;
    var name = unquote(m[1]);
    var rest = m[2];
    // data type, including (...) arguments that may hold quoted values
    var tm = rest.match(/^[A-Za-z_][\w ]*?(?=\(|\s|$)/);
    var type = tm ? tm[0].trim() : '';
    var pos = tm ? tm[0].length : 0;
    while (rest[pos] === ' ') pos++;
    if (rest[pos] === '(') {
      var close = matchParen(rest, pos);
      type += rest.slice(pos, close + 1);
      pos = close + 1;
    }
    var after = rest.slice(pos);
    var mods = after.match(/^\s*((?:UNSIGNED|ZEROFILL|SIGNED)\s*)+/i);
    if (mods) { type += ' ' + mods[0].trim().toLowerCase(); after = after.slice(mods[0].length); }
    type = type.replace(/^(\w+)/, function (t) { return t.toLowerCase(); });

    var col = {
      name: name,
      type: type,
      nullable: !/\bNOT\s+NULL\b/i.test(after),
      default: null,
      autoIncrement: /\bAUTO_INCREMENT\b/i.test(after),
      primary: /\bPRIMARY\s+KEY\b/i.test(after),
      unique: /\bUNIQUE\b/i.test(after),
      comment: null,
      generated: /\b(GENERATED\s+ALWAYS\s+)?AS\s*\(/i.test(after)
    };
    var dm = after.match(/\bDEFAULT\s+('(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.)*"|\([^)]*\)|[^\s,]+(?:\(\))?)/i);
    if (dm) col.default = unquoteString(dm[1]);
    var cm = after.match(/\bCOMMENT\s+('(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.)*")/i);
    if (cm) col.comment = unquoteString(cm[1]);
    if (col.primary) col.nullable = false;
    var inlineRef = after.match(new RegExp('\\bREFERENCES\\s+(' + QUALIFIED + ')\\s*(\\([^)]*\\))([\\s\\S]*)', 'i'));
    if (inlineRef) {
      col.inlineFk = parseFk('FOREIGN KEY (`' + name + '`) REFERENCES ' + inlineRef[1] + ' ' + inlineRef[2] + inlineRef[3]);
    }
    return col;
  }

  function newTable(name) {
    return {
      name: name,
      columns: [],
      primaryKey: [],
      indexes: [],
      fks: [],
      triggers: [],
      engine: null,
      comment: null,
      autoIncrement: null,
      rows: null
    };
  }

  function applyDefinition(table, def, warnings) {
    var d = def.replace(/^ADD\s+(?:COLUMN\s+)?/i, '');
    if (/^(?:CONSTRAINT\s+\S+\s+)?FOREIGN\s+KEY/i.test(d)) {
      var fk = parseFk(d);
      if (fk) table.fks.push(fk); else warnings.push('Could not read foreign key on ' + table.name + ': ' + d.slice(0, 80));
      return;
    }
    if (/^(?:CONSTRAINT\s+\S+\s+)?CHECK\b/i.test(d) || /^CHECK\b/i.test(d)) return;
    if (/^(?:CONSTRAINT\s+(?:\S+\s+)?)?(PRIMARY\s+KEY|UNIQUE|FULLTEXT|SPATIAL|KEY|INDEX)\b/i.test(d)) {
      var idx = parseIndex(d);
      if (!idx) return;
      if (idx.type === 'PRIMARY') {
        table.primaryKey = idx.columns;
      } else {
        table.indexes = table.indexes.filter(function (x) { return !idx.name || x.name !== idx.name; });
        table.indexes.push(idx);
      }
      return;
    }
    var col = parseColumn(d);
    if (!col) return;
    var existing = table.columns.findIndex(function (x) { return x.name === col.name; });
    if (existing >= 0) table.columns[existing] = col; else table.columns.push(col);
    if (col.primary && table.primaryKey.indexOf(col.name) < 0) table.primaryKey = [col.name];
    if (col.unique) table.indexes.push({ type: 'UNIQUE', name: col.name, columns: [col.name] });
    if (col.inlineFk) table.fks.push(col.inlineFk);
    delete col.inlineFk;
  }

  function readTableOptions(table, opts) {
    var em = opts.match(/ENGINE\s*=\s*(\w+)/i);
    if (em) table.engine = em[1];
    var am = opts.match(/AUTO_INCREMENT\s*=\s*(\d+)/i);
    if (am) table.autoIncrement = parseInt(am[1], 10);
    var cm = opts.match(/COMMENT\s*=?\s*('(?:[^'\\]|\\.|'')*')/i);
    if (cm) table.comment = unquoteString(cm[1]);
  }

  function parse(sql, options) {
    options = options || {};
    var model = { tables: {}, views: {}, triggers: [], warnings: [], statements: 0, insertRows: 0, hasData: false };
    var tables = model.tables;

    function table(name) {
      if (!tables[name]) tables[name] = newTable(name);
      return tables[name];
    }

    scan(sql, function (start, end, depth0Opens) {
      // peek at the head before slicing, so large INSERT statements are never copied
      var head = sql.substr(start, 400);
      var headClean = stripExecMarkers(head).replace(/^\s+/, '');
      var kw = headClean.slice(0, 16).toUpperCase();
      model.statements++;

      if (kw.indexOf('INSERT') === 0 || kw.indexOf('REPLACE') === 0) {
        var im = headClean.match(new RegExp('^(?:INSERT|REPLACE)\\s+(?:LOW_PRIORITY\\s+|DELAYED\\s+|HIGH_PRIORITY\\s+)?(?:IGNORE\\s+)?(?:INTO\\s+)?(' + QUALIFIED + ')\\s*(\\()?', 'i'));
        if (im) {
          var rows = depth0Opens - (im[2] ? 1 : 0);
          var t = table(unquote(im[1]));
          t.rows = (t.rows || 0) + Math.max(rows, 0);
          model.insertRows += Math.max(rows, 0);
          model.hasData = true;
        }
        return;
      }

      if (!/^(CREATE|ALTER|DROP)/.test(kw)) return;
      var stmt = stripExecMarkers(sql.slice(start, end)).trim();

      var ct = stmt.match(new RegExp('^CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:TEMPORARY\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(' + QUALIFIED + ')\\s*', 'i'));
      if (ct) {
        var name = unquote(ct[1]);
        var open = stmt.indexOf('(', ct[0].length - 1);
        var likeM = stmt.slice(ct[0].length).match(new RegExp('^LIKE\\s+(' + QUALIFIED + ')', 'i'));
        if (likeM) {
          var src = tables[unquote(likeM[1])];
          var copy = src ? JSON.parse(JSON.stringify(src)) : newTable(name);
          copy.name = name; copy.fks = []; copy.rows = null;
          tables[name] = copy;
          return;
        }
        if (open < 0) return;
        var close = matchParen(stmt, open);
        var t2 = newTable(name);
        tables[name] = t2;
        splitTopLevel(stmt.slice(open + 1, close)).forEach(function (def) {
          applyDefinition(t2, def, model.warnings);
        });
        readTableOptions(t2, stmt.slice(close + 1));
        return;
      }

      var at = stmt.match(new RegExp('^ALTER\\s+(?:ONLINE\\s+|IGNORE\\s+)?TABLE\\s+(' + QUALIFIED + ')\\s+', 'i'));
      if (at) {
        var tName = unquote(at[1]);
        var t3 = table(tName);
        splitTopLevel(stmt.slice(at[0].length)).forEach(function (part) {
          if (/^ADD\b/i.test(part)) {
            applyDefinition(t3, part, model.warnings);
          } else if (/^(MODIFY|CHANGE)\b/i.test(part)) {
            var mm = part.match(new RegExp('^(?:MODIFY|CHANGE)\\s+(?:COLUMN\\s+)?(' + IDENT + ')\\s+', 'i'));
            var def = part.replace(/^(?:MODIFY|CHANGE)\s+(?:COLUMN\s+)?/i, '');
            if (/^CHANGE/i.test(part)) def = def.replace(new RegExp('^' + IDENT + '\\s+'), '');
            var col = parseColumn(def);
            if (col && mm) {
              var idx = t3.columns.findIndex(function (x) { return x.name === unquote(mm[1]); });
              if (idx >= 0) t3.columns[idx] = col; else t3.columns.push(col);
              if (col.primary) t3.primaryKey = [col.name];
            }
          } else if (/^DROP\s+(?:FOREIGN\s+KEY|CONSTRAINT)\s+/i.test(part)) {
            var fkName = unquote(part.replace(/^DROP\s+(?:FOREIGN\s+KEY|CONSTRAINT)\s+(?:IF\s+EXISTS\s+)?/i, ''));
            t3.fks = t3.fks.filter(function (f) { return f.name !== fkName; });
          } else if (/^DROP\s+(?:COLUMN\s+)?/i.test(part) && !/^DROP\s+(INDEX|KEY|PRIMARY)/i.test(part)) {
            var cName = unquote(part.replace(/^DROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?/i, ''));
            t3.columns = t3.columns.filter(function (c) { return c.name !== cName; });
          } else if (/^AUTO_INCREMENT\s*=/i.test(part) || /^ENGINE\s*=/i.test(part) || /^COMMENT\s*=/i.test(part)) {
            readTableOptions(t3, part);
          }
        });
        return;
      }

      var dt = stmt.match(new RegExp('^DROP\\s+(TABLE|VIEW)\\s+(?:IF\\s+EXISTS\\s+)?([\\s\\S]+)$', 'i'));
      if (dt) {
        splitTopLevel(dt[2].replace(/\b(RESTRICT|CASCADE)\s*$/i, '')).forEach(function (nm) {
          var key = unquote(nm);
          if (dt[1].toUpperCase() === 'TABLE') delete tables[key]; else delete model.views[key];
        });
        return;
      }

      var cv = stmt.match(new RegExp('^CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:ALGORITHM\\s*=\\s*\\w+\\s+)?(?:DEFINER\\s*=\\s*\\S+\\s+)?(?:SQL\\s+SECURITY\\s+\\w+\\s+)?VIEW\\s+(' + QUALIFIED + ')(?:\\s*\\([^)]*\\))?\\s+AS\\s+([\\s\\S]*)$', 'i'));
      if (cv) {
        var vName = unquote(cv[1]);
        var body = cv[2];
        var refs = {};
        var re = new RegExp('\\b(?:FROM|JOIN)\\s+(' + QUALIFIED + ')', 'gi');
        var rm;
        while ((rm = re.exec(body))) refs[unquote(rm[1])] = true;
        // comma joins: FROM a, b
        delete tables[vName];
        model.views[vName] = { name: vName, refs: Object.keys(refs), sql: body.trim() };
        return;
      }

      var tr = stmt.match(new RegExp('^CREATE\\s+(?:DEFINER\\s*=\\s*\\S+\\s+)?TRIGGER\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(' + QUALIFIED + ')\\s+(BEFORE|AFTER)\\s+(INSERT|UPDATE|DELETE)\\s+ON\\s+(' + QUALIFIED + ')([\\s\\S]*)$', 'i'));
      if (tr) {
        var trig = { name: unquote(tr[1]), timing: tr[2].toUpperCase(), event: tr[3].toUpperCase(), table: unquote(tr[4]), body: tr[5].trim() };
        model.triggers.push(trig);
        table(trig.table).triggers.push(trig.name);
      }
    });

    // tables referenced only by INSERT or ALTER but never created are leftovers, drop empty ones
    Object.keys(tables).forEach(function (k) {
      if (!tables[k].columns.length && !tables[k].fks.length) {
        if (tables[k].rows) model.warnings.push('Rows found for ' + k + ' but no CREATE TABLE statement.');
        delete tables[k];
      }
    });

    if (options.rowCounts) {
      Object.keys(options.rowCounts).forEach(function (k) {
        if (tables[k]) tables[k].rows = options.rowCounts[k];
      });
    }
    return model;
  }

  var api = { parse: parse, _scan: scan, _splitTopLevel: splitTopLevel, _parseColumn: parseColumn };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SchemaParser = api;
})(this);
