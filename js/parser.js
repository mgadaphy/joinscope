/*
 * Schema parser for SQL dumps: MySQL and MariaDB (mysqldump, phpMyAdmin, SHOW CREATE
 * TABLE output), PostgreSQL (pg_dump --schema-only, with or without data), SQLite
 * (.schema and .dump output), SQL Server (SSMS "Generate Scripts", with GO lines) and
 * Oracle (DBMS_METADATA, SQL Developer and impdp SQLFILE output). The dialect is
 * detected from the text.
 * Reads CREATE TABLE, ALTER TABLE, CREATE INDEX, CREATE VIEW, CREATE TRIGGER, COMMENT ON,
 * SQL Server's extended properties and DROP statements. INSERT and COPY data is not kept;
 * only its rows are counted.
 * Works in the browser (window.SchemaParser) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  // Set at the start of parse(): which SQL the dump is written in.
  var dialect = 'mysql';

  // Schemas whose name is left off table names, so public.film is just film.
  var DEFAULT_SCHEMAS = /^(public|dbo|main)$/i;
  // Oracle: the one owner an export names its objects with ("HR"."EMPLOYEES"), also left off
  var owner = null;

  // Decided from the structure, never from data: INSERT lines (and phpMyAdmin's row
  // continuation lines) are left out, so a row that mentions OWNER TO changes nothing.
  function detectDialect(sql) {
    var head = sql.slice(0, 200000);
    var ddl = head.split('\n').filter(function (l) { return !/^\s*(INSERT|REPLACE|\(|VALUES)\b|^\s*\(/i.test(l); }).join('\n');
    // lines only pg_dump writes, each at the start of a line
    if (/^-- PostgreSQL database dump|^SET search_path|^SELECT pg_catalog\.set_config|^ALTER (?:TABLE|SEQUENCE|TYPE|FUNCTION|SCHEMA|VIEW|DOMAIN)\b.* OWNER TO |^COPY [\w."]+ \([^)]*\) FROM stdin;\s*$/m.test(ddl)) return 'postgres';
    // SSMS's own lines, each a whole line: SET options and GO
    if (/^SET (?:ANSI_NULLS|QUOTED_IDENTIFIER|ANSI_PADDING|IDENTITY_INSERT)\b|^\s*GO\s*$/im.test(ddl)) return 'sqlserver';
    // the rest is decided from the code alone: a comment saying 'was NUMBER(10)' decides nothing
    // (a backslash is not an escape here: in SQL Server and Oracle 'C:\' is a whole string)
    var code = ddl.replace(/\/\*(?!!)[\s\S]*?\*\/|--[^\n]*|'(?:[^']|'')*'/g, ' ');
    // backticks and ENGINE= are MySQL's alone
    if (/`/.test(code) || /\bENGINE\s*=/i.test(code)) return 'mysql';
    // SQL Server: IDENTITY(1,1), [dbo]., NONCLUSTERED, extended properties
    if (/\bIDENTITY\s*\(\s*\d+\s*,\s*\d+\s*\)|\[dbo\]\.|\bNONCLUSTERED\b|\bsp_addextendedproperty\b/i.test(code)) return 'sqlserver';
    // SQLite: its bookkeeping rows (INSERT lines, so looked for in the whole head), or its own words
    if ((/^(?:INSERT INTO|DELETE FROM) "?sqlite_sequence/m.test(head) || /^PRAGMA foreign_keys|^BEGIN TRANSACTION;|^CREATE TABLE (?:IF NOT EXISTS )?\[|\bAUTOINCREMENT\b/m.test(code)) && !/\bAUTO_INCREMENT\b/i.test(code)) return 'sqlite';
    // Oracle: its own type names and storage clauses, impdp's object paths, editionable code
    if (/^-- new object type path/m.test(ddl) || /\bN?VARCHAR2\s*\(|\bNUMBER\s*\(\s*[*\d]|\bSEGMENT CREATION\b|\bPCTFREE\s+\d|\bTABLESPACE\s+"|\b(?:NON)?EDITIONABLE\b/i.test(code)) return 'oracle';
    // hand-written PostgreSQL scripts: psql's \c, identity columns, its own type names
    if (/^\\c\s|GENERATED (?:ALWAYS|BY DEFAULT) AS IDENTITY|\bcharacter varying\b|\btimestamp with(?:out)? time zone\b|\bBYTEA\b|\bJSONB\b/im.test(code)) return 'postgres';
    return 'mysql';
  }

  function unquote(id) {
    if (!id) return id;
    id = id.trim();
    // schema-qualified names: keep the last part
    var parts = id.match(NAME_PARTS) || [id];
    var last = parts[parts.length - 1];
    if (last[0] === '[' && last[last.length - 1] === ']') return last.slice(1, -1).replace(/\]\]/g, ']');
    if ((last[0] === '`' && last[last.length - 1] === '`') || (last[0] === '"' && last[last.length - 1] === '"')) {
      return last.slice(1, -1);
    }
    return fold(last);
  }

  // An unquoted name as the database stores it: PostgreSQL folds it to lower case (Users is
  // users), Oracle to upper case (employees is EMPLOYEES); the others keep it as written.
  function fold(name) {
    return dialect === 'postgres' ? name.toLowerCase() : dialect === 'oracle' ? name.toUpperCase() : name;
  }

  // A table or view name. MySQL dumps qualify names with their own database, so the last
  // part is enough. PostgreSQL can hold the same name in two schemas (auth.users and
  // public.users), so a schema other than the default one stays in the name.
  function tname(id) {
    if (!id) return id;
    if (dialect === 'mysql') return unquote(id);
    var parts = (id.trim().match(NAME_PARTS) || [id]).map(function (p) {
      if (p[0] === '[') return p.slice(1, -1).replace(/\]\]/g, ']');
      if (/^["`]/.test(p)) return p.slice(1, -1);
      return fold(p);
    });
    var schema = parts[parts.length - 2];
    if (parts.length >= 2 && !DEFAULT_SCHEMAS.test(schema) && schema !== owner) return schema + '.' + parts[parts.length - 1];
    return parts[parts.length - 1];
  }

  function unquoteString(s) {
    if (s == null) return s;
    s = s.trim();
    if (s.length >= 2 && (s[0] === "'" || s[0] === '"') && s[s.length - 1] === s[0]) {
      return s.slice(1, -1).replace(/''/g, "'").replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    }
    return s;
  }

  // `mysql`, "standard", [sqlite and sql server], or bare
  // (in SQL Server's brackets, ]] is a ])
  var IDENT = '(?:`[^`]+`|"[^"]+"|\\[(?:[^\\]]|\\]\\])+\\]|[\\w$]+)';
  // the parts of a dotted name, each with its quotes
  var NAME_PARTS = /`[^`]*`|"[^"]*"|\[(?:[^\]]|\]\])*\]|[^.\s]+/g;
  // table, schema.table, or SQL Server's database.schema.table
  var QUALIFIED = IDENT + '(?:\\s*\\.\\s*' + IDENT + '){0,2}';

  // Split a dump into statements, honouring quotes, comments and DELIMITER changes.
  // Executable comments (/*!40101 ... */) are treated as code, the way MySQL runs them.
  // PostgreSQL: $$ quoted bodies, and COPY data, whose lines are counted as rows.
  // SQLite: a trigger body (BEGIN ...; ...; END) is one statement.
  // SQL Server: a GO line ends a batch, and a statement needs no semicolon, so a line that
  // starts a new statement ends the one before. Oracle: a "/" line ends a PL/SQL block.
  // In both, a procedure, function or trigger runs to that line, semicolons and all.
  var TSQL_STATEMENT = /^[ \t]*(?:INSERT|CREATE|ALTER|DROP|EXEC|EXECUTE|SET|USE|PRINT|DECLARE|IF|UPDATE|DELETE|GRANT|DENY|REVOKE|TRUNCATE)\b/i;
  var CODE_BLOCK = /^CREATE\s+(?:OR\s+(?:REPLACE|ALTER)\s+)?(?:(?:NON)?EDITIONABLE\s+)?(?:PROC(?:EDURE)?|FUNCTION|TRIGGER|PACKAGE|TYPE\s+BODY)\b/i;
  // T-SQL's ALTER PROCEDURE restates the code (Oracle's ALTER TRIGGER x ENABLE is one line);
  // an anonymous PL/SQL block (in T-SQL, BEGIN and DECLARE are ordinary statements)
  var TSQL_BLOCK = /^ALTER\s+(?:PROC(?:EDURE)?|FUNCTION|TRIGGER)\b/i;
  var PLSQL_BLOCK = /^(?:BEGIN|DECLARE)\b/i;

  function scan(sql, onStatement, d) {
    d = d || dialect;
    var n = sql.length;
    var i = 0;
    var delim = ';';
    var start = -1;
    var depth0Opens = 0;
    var parenDepth = 0;
    var execComment = 0;
    var backslashEscapes = d === 'mysql';
    var lineEnded = d === 'sqlserver' || d === 'oracle';
    var block = false;

    function flush(end, extra) {
      if (start >= 0) onStatement(start, end, depth0Opens, extra);
      start = -1;
      depth0Opens = 0;
      parenDepth = 0;
      block = false;
    }

    while (i < n) {
      var c = sql.charCodeAt(i);

      if (lineEnded && (i === 0 || sql.charCodeAt(i - 1) === 10)) {
        // GO (SQL Server) or / (Oracle) alone on a line ends whatever is open
        var term = sql.slice(i, i + 24).match(d === 'sqlserver' ? /^[ \t]*GO(?:[ \t]+\d+)?[ \t]*(?:\r?\n|$)/i : /^[ \t]*\/[ \t]*(?:\r?\n|$)/);
        if (term) {
          flush(i);
          i += term[0].length;
          continue;
        }
        if (d === 'sqlserver' && start >= 0 && !block && parenDepth === 0 && TSQL_STATEMENT.test(sql.substr(i, 24))) flush(i);
      }

      if (start < 0) {
        // between statements: skip whitespace and look for DELIMITER
        if (c === 32 || c === 9 || c === 10 || c === 13) { i++; continue; }
        if ((c === 68 || c === 100) && /^DELIMITER\s/i.test(sql.substr(i, 10))) {
          var eol = sql.indexOf('\n', i);
          if (eol < 0) eol = n;
          var newDelim = sql.slice(i + 9, eol).trim();
          if (newDelim) delim = newDelim;
          i = eol + 1;
          continue;
        }
        // psql meta-commands (\c db, \connect, \restrict) are a line each, not SQL
        // and so are SQL*Plus commands (PROMPT, REM, SET ECHO OFF, @script), which need no semicolon
        if ((c === 92 && d !== 'mysql') || (d === 'oracle' && /^(?:REM(?:ARK)?|PRO(?:MPT)?|SET|SPOOL|WHENEVER|CONN(?:ECT)?|DEFINE|UNDEFINE|COL(?:UMN)?|TTITLE|BTITLE|EXIT|QUIT|SHOW|CLEAR|PAUSE|ACCEPT|VAR(?:IABLE)?|EXEC(?:UTE)?)\b|^@/i.test(sql.substr(i, 12)))) {
          var metaEnd = sql.indexOf('\n', i);
          i = metaEnd < 0 ? n : metaEnd + 1;
          continue;
        }
      }

      // line comments
      if ((c === 35 && d === 'mysql') || (c === 45 && sql.charCodeAt(i + 1) === 45 && (i + 2 >= n || /\s/.test(sql[i + 2]) || d !== 'mysql'))) {
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

      if (start < 0) {
        start = i;
        if (lineEnded) block = CODE_BLOCK.test(sql.substr(i, 80)) || (d === 'sqlserver' ? TSQL_BLOCK : PLSQL_BLOCK).test(sql.substr(i, 40));
      }

      // SQL Server's [quoted names], which may hold a ' or a ;
      if (c === 91 && d === 'sqlserver') {
        i++;
        while (i < n && !(sql.charCodeAt(i) === 93 && sql.charCodeAt(i + 1) !== 93)) i += sql.charCodeAt(i) === 93 ? 2 : 1;
        i++;
        continue;
      }

      // quoted strings and identifiers
      if (c === 39 || c === 34 || c === 96) {
        var q = c;
        // PostgreSQL E'...' strings use backslash escapes, other strings do not
        var escapes = backslashEscapes || (d === 'postgres' && q === 39 && /[Ee]/.test(sql[i - 1] || '') && !/[\w$]/.test(sql[i - 2] || ''));
        i++;
        while (i < n) {
          var cc = sql.charCodeAt(i);
          if (cc === 92 && q !== 96 && escapes) { i += 2; continue; }
          if (cc === q) {
            if (sql.charCodeAt(i + 1) === q) { i += 2; continue; }
            break;
          }
          i++;
        }
        i++;
        continue;
      }

      // PostgreSQL dollar quoting: $$ ... $$ or $tag$ ... $tag$
      if (c === 36 && d === 'postgres' && !/[\w$]/.test(sql[i - 1] || '')) {
        var dq = sql.slice(i, i + 64).match(/^\$([A-Za-z_]\w*)?\$/);
        if (dq) {
          var closeAt = sql.indexOf(dq[0], i + dq[0].length);
          i = closeAt < 0 ? n : closeAt + dq[0].length;
          continue;
        }
      }

      if (c === 40) { if (parenDepth === 0) depth0Opens++; parenDepth++; }
      else if (c === 41) { if (parenDepth > 0) parenDepth--; }

      if (block && delim === ';' && c === 59) { i++; continue; }
      if (sql.startsWith(delim, i)) {
        // SQLite trigger: the semicolons inside BEGIN ... END do not end it
        // (a CASE ... END inside the body opens and closes like BEGIN ... END)
        if (d === 'sqlite' && /^CREATE\s+(?:TEMP(?:ORARY)?\s+)?TRIGGER\b/i.test(sql.substr(start, 40))) {
          var so = maskStrings(sql.slice(start, i));
          var opens = (so.match(/\b(BEGIN|CASE)\b/gi) || []).length;
          var ends = (so.match(/\bEND\b/gi) || []).length;
          if (/\bBEGIN\b/i.test(so) && ends < opens) { i += delim.length; continue; }
        }
        // PostgreSQL COPY ... FROM stdin: the data follows, one row per line, up to "\."
        if (d === 'postgres' && /^COPY\s/i.test(sql.substr(start, 5)) && /FROM\s+stdin\s*$/i.test(sql.slice(start, i))) {
          var lineEnd = sql.indexOf('\n', i);
          var dataStart = lineEnd < 0 ? n : lineEnd + 1;
          var endMark = sql.indexOf('\n\\.', dataStart - 1);
          var dataEnd = endMark < 0 ? n : endMark;
          // rows: the lines between dataStart and the "\." line
          var rows = dataEnd > dataStart ? 1 : 0;
          for (var p = dataStart; p < dataEnd; p++) if (sql.charCodeAt(p) === 10) rows++;
          flush(i, { copyRows: rows });
          var after = endMark < 0 ? n : sql.indexOf('\n', endMark + 1);
          i = after < 0 ? n : after + 1;
          execComment = 0;
          continue;
        }
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
      // SQL Server's [names] can hold commas and brackets ([a,b], [odd]]name])
      if (c === '[' && dialect === 'sqlserver') {
        i++;
        while (i < s.length && !(s[i] === ']' && s[i + 1] !== ']')) i += s[i] === ']' ? 2 : 1;
        continue;
      }
      // brackets too: PostgreSQL's ARRAY[1,2] (outside strings MySQL never has them)
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
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
    // "(`a`,`b`(10) DESC)" -> ["a","b"]. An expression, such as lower(email), is kept whole:
    // it is not a column, and two different expressions must never look alike.
    var inner = s.trim().replace(/^\(/, '').replace(/\)$/, '');
    return splitTopLevel(inner).map(function (p) {
      var m = p.match(new RegExp('^' + IDENT));
      if (!m) return p.trim();
      var rest = p.slice(m[0].length).trim();
      if (/^\(/.test(rest) && !/^\(\s*\d+\s*\)/.test(rest)) return p.trim().replace(/\s+(ASC|DESC)$/i, '');
      return unquote(m[0]);
    });
  }

  // a constraint's name: quoted, or unquoted with letters \w does not know (CONSTRAINT clé_fk)
  var CNAME = '(?:' + IDENT + '|\\S+)';

  // (REFERENCES parent with no column list means the parent's primary key)
  var FK_RE = new RegExp(
    '^(?:CONSTRAINT\\s+(' + CNAME + ')\\s+)?FOREIGN\\s+KEY\\s*(?:' + IDENT + '\\s*)?(\\([^)]*\\))\\s*REFERENCES\\s+(' + QUALIFIED + ')\\s*(\\([^)]*\\))?([\\s\\S]*)$', 'i');

  function parseFk(def) {
    var m = def.match(FK_RE);
    if (!m) return null;
    var rest = m[5] || '';
    var od = rest.match(/ON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)/i);
    var ou = rest.match(/ON\s+UPDATE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)/i);
    return {
      name: m[1] ? unquote(m[1]) : null,
      columns: parseColumnList(m[2]),
      refTable: tname(m[3]),
      refColumns: m[4] ? parseColumnList(m[4]) : [],
      // NO ACTION and RESTRICT behave the same in MySQL and MariaDB; MySQL 8 dumps omit the clause
      onDelete: od ? od[1].toUpperCase().replace(/\s+/g, ' ').replace('NO ACTION', 'RESTRICT') : 'RESTRICT',
      onUpdate: ou ? ou[1].toUpperCase().replace(/\s+/g, ' ').replace('NO ACTION', 'RESTRICT') : 'RESTRICT'
    };
  }

  function parseIndex(def) {
    // SQL Server: PRIMARY KEY CLUSTERED (...), UNIQUE NONCLUSTERED (...)
    var m = def.match(new RegExp('^(?:CONSTRAINT\\s+(' + CNAME + ')\\s+)?(PRIMARY\\s+KEY|UNIQUE(?:\\s+(?:KEY|INDEX))?|FULLTEXT(?:\\s+(?:KEY|INDEX))?|SPATIAL(?:\\s+(?:KEY|INDEX))?|KEY|INDEX)\\s*(?:(?:NON)?CLUSTERED\\s*)?(' + IDENT + ')?\\s*(?:USING\\s+\\w+\\s*)?(\\([\\s\\S]*\\))', 'i'));
    if (!m) return null;
    var kind = m[2].toUpperCase();
    var type = kind.indexOf('PRIMARY') === 0 ? 'PRIMARY' : kind.indexOf('UNIQUE') === 0 ? 'UNIQUE' : kind.indexOf('FULLTEXT') === 0 ? 'FULLTEXT' : kind.indexOf('SPATIAL') === 0 ? 'SPATIAL' : 'INDEX';
    var open = m[4].indexOf('(');
    var close = matchParen(m[4], open);
    return {
      type: type,
      // MySQL's index name, else the constraint's (a unique constraint's index has its name)
      name: m[3] ? unquote(m[3]) : m[1] && type !== 'PRIMARY' ? unquote(m[1]) : (type === 'PRIMARY' ? 'PRIMARY' : null),
      columns: parseColumnList(m[4].slice(open, close + 1))
    };
  }

  // The text with every quoted string's content blanked out, keeping its length, so a
  // keyword search never matches inside a comment or a default value. `Names` (and [names]
  // in SQL Server and SQLite) are kept as they are, so a quote inside one does not start a
  // string; elsewhere [ ] is PostgreSQL's ARRAY['...'], whose texts are masked like any other.
  function maskStrings(s) {
    var re = dialect === 'sqlserver' || dialect === 'sqlite'
      ? /`[^`]*`|\[[^\]]*\]|'(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.)*"/g
      : /`[^`]*`|'(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.)*"/g;
    return s.replace(re, function (m) {
      return m[0] === '`' || m[0] === '[' ? m : m[0] + new Array(m.length - 1).join('_') + m[m.length - 1];
    });
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

    // keywords are looked for outside quoted text: a comment saying "not null" is not NOT NULL
    var bare = maskStrings(after);
    var col = {
      name: name,
      type: type,
      nullable: !/\bNOT\s+NULL\b/i.test(bare),
      default: null,
      autoIncrement: /\bAUTO_INCREMENT\b/i.test(bare),
      primary: /\bPRIMARY\s+KEY\b/i.test(bare),
      unique: /\bUNIQUE\b/i.test(bare),
      comment: null,
      generated: /\b(GENERATED\s+ALWAYS\s+)?AS\s*\(/i.test(bare)
    };
    var dAt = bare.search(/\bDEFAULT\s/i);
    var dm = dAt < 0 ? null : after.slice(dAt).match(/^DEFAULT\s+('(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.)*"|\([^)]*\)|[^\s,]+(?:\(\))?)/i);
    if (dm) col.default = unquoteString(dm[1]);
    var cAt = bare.search(/\bCOMMENT\s/i);
    var cm = cAt < 0 ? null : after.slice(cAt).match(/^COMMENT\s+('(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.)*")/i);
    if (cm) col.comment = unquoteString(cm[1]);
    if (col.primary) col.nullable = false;
    var rAt = bare.search(/\bREFERENCES\s/i);
    var inlineRef = rAt < 0 ? null : after.slice(rAt).match(new RegExp('^REFERENCES\\s+(' + QUALIFIED + ')\\s*(\\([^)]*\\))([\\s\\S]*)', 'i'));
    if (inlineRef) {
      col.inlineFk = parseFk('FOREIGN KEY (`' + name + '`) REFERENCES ' + inlineRef[1] + ' ' + inlineRef[2] + inlineRef[3]);
    }
    return col;
  }

  // Words that end a column's type in PostgreSQL and SQLite, where a type can run to
  // several words (character varying(255), timestamp with time zone, double precision).
  var CONSTRAINT_WORD = /^(NOT|NULL|DEFAULT|PRIMARY|UNIQUE|REFERENCES|CHECK|CONSTRAINT|GENERATED|COLLATE|AUTOINCREMENT|AUTO_INCREMENT|ON|COMMENT|AS|IDENTITY|ROWGUIDCOL|SPARSE|FILESTREAM|MASKED|ENCRYPTED|ENABLE|DISABLE|VISIBLE|INVISIBLE|ENCRYPT)\b/i;

  // SQL Server keeps a default in brackets, ((0)) or (N'new'): the value inside them
  function plainDefault(v) {
    if (v == null) return v;
    var s = String(v).trim();
    while (s[0] === '(' && matchParen(s, 0) === s.length - 1) s = s.slice(1, -1).trim();
    if (/^N'/.test(s)) s = s.slice(1);
    return unquoteString(s);
  }

  // One value after DEFAULT: a literal, a call, a bracketed expression, with any ::casts.
  function readDefault(s) {
    var i = 0;
    var estring = false;
    var take = function () {
      while (s[i] === ' ') i++;
      // E'it\'s': a PostgreSQL string with backslash escapes
      if ((s[i] === 'E' || s[i] === 'e') && s[i + 1] === "'") { estring = true; i++; }
      // N'text': SQL Server's Unicode string
      else if ((s[i] === 'N' || s[i] === 'n') && s[i + 1] === "'") i++;
      var c = s[i];
      if (c === "'" || c === '"') {
        var q = c;
        i++;
        while (i < s.length) {
          if (estring && s[i] === '\\') { i += 2; continue; }
          if (s[i] === q) { if (s[i + 1] === q) { i += 2; continue; } break; }
          i++;
        }
        i++;
      } else if (c === '(') {
        i = matchParen(s, i) + 1;
      } else {
        var w = s.slice(i).match(/^[-+]?[\w.]+/);
        i += w ? w[0].length : 1;
        while (s[i] === ' ' && s[i + 1] === '(') i++;
        if (s[i] === '(') i = matchParen(s, i) + 1;
      }
    };
    take();
    while (s.substr(i, 2) === '::') { i += 2; var t = s.slice(i).match(/^[\w."]+(\[\])?(\([^)]*\))?/); i += t ? t[0].length : 0; }
    var raw = s.slice(0, i).trim();
    var bare = raw.replace(/::[\w."]+(\[\])?(\([^)]*\))?/g, '');
    if (estring) bare = bare.replace(/^[Ee]'/, "'").replace(/\\(.)/g, '$1');
    return { raw: raw, value: unquoteString(bare) };
  }

  function parseColumnGeneric(def) {
    var m = def.match(new RegExp('^(' + IDENT + ')\\s*([\\s\\S]*)$'));
    if (!m) return null;
    var name = unquote(m[1]);
    var rest = m[2];
    var parts = [];
    var pos = 0;
    while (pos < rest.length) {
      while (rest[pos] === ' ' || rest[pos] === '\n' || rest[pos] === '\t' || rest[pos] === '\r') pos++;
      if (pos >= rest.length || CONSTRAINT_WORD.test(rest.slice(pos, pos + 16))) break;
      if (rest[pos] === '(') {
        var close = matchParen(rest, pos);
        parts.push(rest.slice(pos, close + 1));
        pos = close + 1;
        continue;
      }
      var w = rest.slice(pos).match(/^("[^"]*"|[^\s(]+)/);
      parts.push(w[0]);
      pos += w[0].length;
    }
    // quoted parts keep their case ("MyEnum"), the rest is lower case; public.year is year,
    // the default schema left off as the catalogue does
    var type = parts.join(' ').replace(/ \(/g, '(').replace(/ \[/g, '[');
    // SQL Server's [nvarchar](15) is nvarchar(15) (elsewhere [] marks an array)
    if (dialect === 'sqlserver') type = type.replace(/\[([^\]]+)\]/g, '$1');
    type = type
      .replace(/"([^"]*)"|[^"]+/g, function (all, quoted) { return quoted != null ? quoted : all.toLowerCase(); })
      // Oracle's VARCHAR2(20 BYTE) is varchar2(20)
      .replace(/\((\d+) (?:byte|char)\)/, '($1)')
      // SSMS writes decimal(5, 2): sizes are written without spaces, as catalogues give them
      .replace(/\(\s*([\d*]+)\s*,\s*(\d+)\s*\)/, '($1,$2)')
      .replace(/^(public|main|dbo)\./i, '');
    var after = rest.slice(pos);
    var bare = maskStrings(after);
    var col = {
      name: name,
      type: type,
      nullable: !/\bNOT\s+NULL\b/i.test(bare),
      default: null,
      autoIncrement: /\b(AUTOINCREMENT|AUTO_INCREMENT|IDENTITY)\b/i.test(bare),
      primary: /\bPRIMARY\s+KEY\b/i.test(bare),
      unique: /\bUNIQUE\b/i.test(bare),
      comment: null,
      // SQL Server's computed columns and Oracle's virtual ones can be written plain: x AS (a * b)
      generated: /\bGENERATED\s+ALWAYS\s+AS\s*\(/i.test(bare) || ((dialect === 'sqlserver' || dialect === 'oracle') && /(?:^|\s)AS\s*\(/i.test(bare))
    };
    // serial types are an integer with a sequence behind it
    var serial = type.match(/^(small|big)?serial$/);
    if (serial) { col.type = serial[1] === 'small' ? 'smallint' : serial[1] === 'big' ? 'bigint' : 'integer'; col.autoIncrement = true; }
    // the DEFAULT of a default value, not of GENERATED BY DEFAULT AS IDENTITY
    var dIdx = -1;
    var dRe = /\bDEFAULT\b/gi;
    var dm2;
    while ((dm2 = dRe.exec(bare))) {
      if (!/\bBY\s+$/i.test(bare.slice(0, dm2.index))) { dIdx = dm2.index; break; }
    }
    if (dIdx >= 0) {
      // Oracle: DEFAULT ON NULL 0 is the default 0
      var dv = readDefault(after.slice(dIdx + 7).replace(/^\s*ON\s+NULL\s+(?:FOR\s+INSERT\s+(?:ONLY|AND\s+UPDATE)\s+)?/i, ''));
      if (/^nextval\(/i.test(dv.raw)) col.autoIncrement = true;
      else col.default = dialect === 'sqlserver' ? plainDefault(dv.raw) : dv.value;
    }
    if (col.primary) col.nullable = false;
    var rIdx = bare.search(/\bREFERENCES\s/i);
    var inlineRef = rIdx < 0 ? null : after.slice(rIdx).match(new RegExp('^REFERENCES\\s+(' + QUALIFIED + ')\\s*(\\([^)]*\\))?([\\s\\S]*)', 'i'));
    if (inlineRef) {
      col.inlineFk = parseFk('FOREIGN KEY ("' + name + '") REFERENCES ' + inlineRef[1] + ' ' + (inlineRef[2] || '(id)') + inlineRef[3]);
      if (col.inlineFk && !inlineRef[2]) col.inlineFk.refColumns = [];
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
    var named = '^(?:CONSTRAINT\\s+' + CNAME + '\\s+)?';
    if (new RegExp(named + 'FOREIGN\\s+KEY', 'i').test(d)) {
      var fk = parseFk(d);
      if (fk) table.fks.push(fk); else warnings.push('Could not read foreign key on ' + table.name + ': ' + d.slice(0, 80));
      return;
    }
    if (new RegExp(named + 'CHECK\\b', 'i').test(d)) return;
    // SQL Server: ADD CONSTRAINT [DF_x] DEFAULT ((0)) FOR [column]
    var df = d.match(new RegExp(named + 'DEFAULT\\s+([\\s\\S]+?)\\s+FOR\\s+(' + IDENT + ')\\s*$', 'i'));
    if (df) {
      var dc = table.columns.find(function (x) { return x.name === unquote(df[2]); });
      if (dc) dc.default = plainDefault(df[1]);
      return;
    }
    // KEY, INDEX, FULLTEXT and SPATIAL lines are MySQL's; elsewhere those words can be
    // column names (a PostgreSQL "fulltext tsvector" column), so only MySQL reads them
    var indexWords = dialect === 'mysql' ? new RegExp(named + '(PRIMARY\\s+KEY|UNIQUE|FULLTEXT|SPATIAL|KEY|INDEX)\\b', 'i') : new RegExp(named + '(PRIMARY\\s+KEY|UNIQUE)\\s*(?:(?:NON)?CLUSTERED\\s*)?\\(', 'i');
    if (indexWords.test(d)) {
      var idx = parseIndex(d);
      if (idx) {
        if (idx.type === 'PRIMARY') {
          table.primaryKey = idx.columns;
        } else {
          table.indexes = table.indexes.filter(function (x) { return !idx.name || x.name !== idx.name; });
          table.indexes.push(idx);
        }
        return;
      }
      // not an index after all (a column named key, say): read it as a column
    }
    var col = dialect === 'mysql' ? parseColumn(d) : parseColumnGeneric(d);
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
    dialect = options.dialect || detectDialect(sql);
    owner = null;
    if (dialect === 'oracle') {
      // Oracle exports name every object with its owner. When the tables and views are all
      // one owner's (names written without one are in the same schema), it is the schema you
      // exported, and is left off as the catalogue does.
      var owners = {};
      var ore = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:NO)?FORCE\s+)?(?:(?:NON)?EDITIONABLE\s+)?(?:GLOBAL\s+TEMPORARY\s+)?(?:TABLE|VIEW)\s+("[^"]+"|\w+)\s*\.\s*(?:"[^"]+"|\w+)/gi;
      var om;
      while ((om = ore.exec(sql))) owners[om[1][0] === '"' ? om[1].slice(1, -1) : om[1].toUpperCase()] = true;
      if (Object.keys(owners).length === 1) owner = Object.keys(owners)[0];
    }
    // tables and views have no prototype, so a table called __proto__ or constructor is just a table
    var model = { dialect: dialect, tables: Object.create(null), views: Object.create(null), triggers: [], warnings: [], statements: 0, insertRows: 0, hasData: false };
    var tables = model.tables;
    var partitions = {};

    function table(name) {
      if (!tables[name]) tables[name] = newTable(name);
      return tables[name];
    }

    // EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'...', @level0type=N'SCHEMA',
    // @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'x' [, @level2type=N'COLUMN', @level2name=N'y'],
    // or the same eight values without their @names
    function readExtendedProperty(text) {
      var keys = ['name', 'value', 'level0type', 'level0name', 'level1type', 'level1name', 'level2type', 'level2name'];
      var p = {};
      var re = /(?:@(\w+)\s*=\s*)?(?:N?'((?:[^']|'')*)'|NULL)/gi;
      var body = text.replace(/^[\s\S]*?sp_addextendedproperty/i, '');
      var m, k = 0;
      while ((m = re.exec(body)) && k < 8) {
        var key = m[1] ? m[1].toLowerCase() : keys[k];
        p[key] = m[2] == null ? null : m[2].replace(/''/g, "'");
        k++;
      }
      if (p.name !== 'MS_Description' || !/^TABLE$/i.test(p.level1type || '') || !p.level1name) return;
      var t = tables[tname('[' + (p.level0name || 'dbo') + '].[' + p.level1name + ']')];
      if (!t) return;
      if (/^COLUMN$/i.test(p.level2type || '')) {
        var c = t.columns.find(function (x) { return x.name === p.level2name; });
        if (c) c.comment = p.value;
      } else if (!p.level2type) {
        t.comment = p.value;
      }
    }

    scan(sql, function (start, end, depth0Opens, extra) {
      // peek at the head before slicing, so large INSERT statements are never copied
      var head = sql.substr(start, 400);
      var headClean = stripExecMarkers(head).replace(/^\s+/, '');
      var kw = headClean.slice(0, 16).toUpperCase();
      model.statements++;

      if (kw.indexOf('INSERT') === 0 || kw.indexOf('REPLACE') === 0) {
        var im = headClean.match(new RegExp('^(?:INSERT|REPLACE)\\s+(?:OR\\s+\\w+\\s+)?(?:LOW_PRIORITY\\s+|DELAYED\\s+|HIGH_PRIORITY\\s+)?(?:IGNORE\\s+)?(?:INTO\\s+)?(' + QUALIFIED + ')\\s*(\\()?', 'i'));
        if (im) {
          var rows = depth0Opens - (im[2] ? 1 : 0);
          var t = table(tname(im[1]));
          t.rows = (t.rows || 0) + Math.max(rows, 0);
          model.insertRows += Math.max(rows, 0);
          model.hasData = true;
        }
        return;
      }

      if (kw.indexOf('COPY') === 0) {
        var cm = headClean.match(new RegExp('^COPY\\s+(' + QUALIFIED + ')', 'i'));
        if (cm && extra && extra.copyRows != null) {
          var tc = table(tname(cm[1]));
          tc.rows = (tc.rows || 0) + extra.copyRows;
          model.insertRows += extra.copyRows;
          model.hasData = true;
        }
        return;
      }

      // SQL Server keeps comments as extended properties named MS_Description
      if (dialect === 'sqlserver' && /^EXEC/.test(kw) && /sp_addextendedproperty/i.test(head)) {
        readExtendedProperty(sql.slice(start, end));
        return;
      }

      if (!/^(CREATE|ALTER|DROP|COMMENT)/.test(kw)) return;
      var stmt = stripExecMarkers(sql.slice(start, end)).trim();

      var ct = stmt.match(new RegExp('^CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:(?:GLOBAL|LOCAL)\\s+)?(?:TEMP(?:ORARY)?\\s+|UNLOGGED\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(' + QUALIFIED + ')\\s*', 'i'));
      if (ct) {
        var name = tname(ct[1]);
        var partOf = stmt.slice(ct[0].length).match(new RegExp('^PARTITION\\s+OF\\s+(' + QUALIFIED + ')', 'i'));
        if (partOf) {
          partitions[name] = tname(partOf[1]);
          return;
        }
        var open = stmt.indexOf('(', ct[0].length - 1);
        var likeM = stmt.slice(ct[0].length).match(new RegExp('^LIKE\\s+(' + QUALIFIED + ')', 'i'));
        if (likeM) {
          var src = tables[tname(likeM[1])];
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

      var at = stmt.match(new RegExp('^ALTER\\s+(?:ONLINE\\s+|IGNORE\\s+)?TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?(' + QUALIFIED + ')\\s+', 'i'));
      if (at) {
        var tName = tname(at[1]);
        var t3 = table(tName);
        // SQL Server: ALTER TABLE x WITH CHECK ADD CONSTRAINT ...
        var alterParts = splitTopLevel(stmt.slice(at[0].length).replace(/^WITH\s+(?:NO)?CHECK\s+/i, ''));
        // Oracle: ADD (CONSTRAINT a ..., CONSTRAINT b ...) and MODIFY (col NOT NULL, ...)
        var listed = dialect === 'oracle' && alterParts.length === 1 && alterParts[0].match(/^(ADD|MODIFY)\s*\(([\s\S]*)\)\s*$/i);
        if (listed) {
          var verb = listed[1].toUpperCase();
          splitTopLevel(listed[2]).forEach(function (item) {
            if (verb === 'ADD') { applyDefinition(t3, item, model.warnings); return; }
            var om = item.match(new RegExp('^(' + IDENT + ')\\s+([\\s\\S]*)$'));
            var oc = om && t3.columns.find(function (x) { return x.name === unquote(om[1]); });
            if (!oc) return;
            var bareItem = maskStrings(om[2]);
            if (/\bNOT\s+NULL\b/i.test(bareItem)) oc.nullable = false;
            else if (/^(?:CONSTRAINT\s+\S+\s+)?NULL\b/i.test(bareItem)) oc.nullable = true;
            if (!CONSTRAINT_WORD.test(om[2])) { var nc = parseColumnGeneric(item); if (nc && nc.type) oc.type = nc.type; }
          });
          return;
        }
        alterParts.forEach(function (part) {
          var attach = part.match(new RegExp('^ATTACH\\s+PARTITION\\s+(' + QUALIFIED + ')', 'i'));
          var alterCol = part.match(new RegExp('^ALTER\\s+(?:COLUMN\\s+)?(' + IDENT + ')\\s+([\\s\\S]*)$', 'i'));
          if (attach) {
            partitions[tname(attach[1])] = tName;
          } else if (alterCol && dialect !== 'mysql') {
            // PostgreSQL: SET DEFAULT nextval(...), ADD GENERATED ... AS IDENTITY, SET/DROP NOT NULL, TYPE
            var ac = t3.columns.find(function (x) { return x.name === unquote(alterCol[1]); });
            var what = alterCol[2];
            if (!ac) return;
            if (/^SET\s+DEFAULT\s+nextval\(/i.test(what) || /^ADD\s+GENERATED\b[\s\S]*\bIDENTITY\b/i.test(what)) ac.autoIncrement = true;
            else if (/^SET\s+DEFAULT\s+/i.test(what)) ac.default = readDefault(what.replace(/^SET\s+DEFAULT\s+/i, '')).value;
            else if (/^SET\s+NOT\s+NULL/i.test(what)) ac.nullable = false;
            else if (/^DROP\s+NOT\s+NULL/i.test(what)) ac.nullable = true;
            else if (/^(?:SET\s+DATA\s+)?TYPE\s+/i.test(what)) ac.type = what.replace(/^(?:SET\s+DATA\s+)?TYPE\s+/i, '').replace(/\s+USING[\s\S]*$/i, '').trim().toLowerCase();
          } else if (/^OWNER\s+TO\b|^ENABLE\b|^DISABLE\b|^REPLICA\b|^CLUSTER\b|^SET\s+\(/i.test(part)) {
            return;
          } else if (/^ADD\b/i.test(part)) {
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
          } else if (/^DROP\s+PRIMARY\s+KEY/i.test(part)) {
            t3.primaryKey = [];
          } else if (/^DROP\s+(?:INDEX|KEY)\s+/i.test(part)) {
            var ixName = unquote(part.replace(/^DROP\s+(?:INDEX|KEY)\s+(?:IF\s+EXISTS\s+)?/i, ''));
            t3.indexes = t3.indexes.filter(function (i) { return i.name !== ixName; });
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
          var key = tname(nm);
          if (dt[1].toUpperCase() === 'TABLE') delete tables[key]; else delete model.views[key];
        });
        return;
      }

      // CREATE [UNIQUE] INDEX name ON table [USING method] (columns)
      // (SQL Server: [NON]CLUSTERED; Oracle: BITMAP)
      var ci = stmt.match(new RegExp('^CREATE\\s+(UNIQUE\\s+)?(?:FULLTEXT\\s+|SPATIAL\\s+|BITMAP\\s+)?(?:(?:NON)?CLUSTERED\\s+)?INDEX\\s+(?:CONCURRENTLY\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?(' + QUALIFIED + ')?\\s*ON\\s+(?:ONLY\\s+)?(' + QUALIFIED + ')\\s*(?:USING\\s+\\w+\\s*)?\\(', 'i'));
      if (ci) {
        var ti = table(tname(ci[3]));
        var io = ci[0].length - 1;
        var ic = matchParen(stmt, io);
        var ix = { type: ci[1] ? 'UNIQUE' : 'INDEX', name: ci[2] ? unquote(ci[2]) : null, columns: parseColumnList(stmt.slice(io, ic + 1)) };
        // a partial index (... WHERE deleted_at IS NULL) covers only some rows
        if (/\bWHERE\b/i.test(maskStrings(stmt.slice(ic + 1)))) ix.partial = true;
        ti.indexes.push(ix);
        return;
      }

      // COMMENT ON TABLE x IS '...' / COMMENT ON COLUMN [schema.]table.column IS '...'
      var co = stmt.match(/^COMMENT\s+ON\s+(TABLE|COLUMN|VIEW)\s+([\s\S]+?)\s+IS\s+('(?:[^']|'')*'|NULL)\s*$/i);
      if (co) {
        var text = /^NULL$/i.test(co[3]) ? null : unquoteString(co[3]);
        var path = co[2].match(/"[^"]*"|`[^`]*`|[^.\s]+/g) || [];
        if (co[1].toUpperCase() === 'COLUMN' && path.length >= 2) {
          var colName = unquote(path[path.length - 1]);
          var tn = tname(path.slice(0, -1).join('.'));
          var tcm = tables[tn];
          var cc2 = tcm && tcm.columns.find(function (x) { return x.name === colName; });
          if (cc2) cc2.comment = text;
        } else if (co[1].toUpperCase() === 'TABLE' && tables[tname(co[2])]) {
          tables[tname(co[2])].comment = text;
        }
        return;
      }

      // (SQL Server: OR ALTER, WITH SCHEMABINDING; Oracle: FORCE, EDITIONABLE, DEFAULT COLLATION)
      var cv = stmt.match(new RegExp('^CREATE\\s+(?:OR\\s+(?:REPLACE|ALTER)\\s+)?(?:(?:NO)?FORCE\\s+)?(?:(?:NON)?EDITIONABLE\\s+)?(?:TEMP(?:ORARY)?\\s+)?(?:RECURSIVE\\s+)?(?:ALGORITHM\\s*=\\s*\\w+\\s+)?(?:DEFINER\\s*=\\s*\\S+\\s+)?(?:SQL\\s+SECURITY\\s+\\w+\\s+)?(?:MATERIALIZED\\s+)?VIEW\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(' + QUALIFIED + ')(?:\\s*\\([^)]*\\))?(?:\\s+DEFAULT\\s+COLLATION\\s+' + IDENT + ')?(?:\\s+WITH\\s+\\w+(?:\\s*,\\s*\\w+)*)?\\s+AS\\s+([\\s\\S]*)$', 'i'));
      if (cv) {
        var vName = tname(cv[1]);
        var body = cv[2];
        var refs = {};
        // pg_dump brackets joins: FROM ((public.actor a LEFT JOIN ...). Names that are not
        // tables (a subquery's SELECT, EXTRACT(YEAR FROM d)) are dropped when links are built.
        var re = new RegExp('\\b(?:FROM|JOIN)\\s+(?:ONLY\\s+)?[(\\s]*(' + QUALIFIED + ')', 'gi');
        var rm;
        while ((rm = re.exec(body))) refs[tname(rm[1])] = true;
        // comma joins: FROM a, b AS x JOIN y ON ..., c. Read each FROM clause up to WHERE,
        // GROUP and the like or a closing bracket, then take the first table of every
        // comma-separated item (tables after JOIN are found above).
        var fromRe = /\bFROM\s+/gi;
        var fm;
        while ((fm = fromRe.exec(body))) {
          var start = fm.index + fm[0].length;
          var k = start;
          var depth = 0;
          for (; k < body.length; k++) {
            var ch = body[k];
            if (ch === '(') depth++;
            else if (ch === ')') { if (depth === 0) break; depth--; }
            else if (depth === 0 && /\s/.test(ch) && /^\s+(WHERE|GROUP|ORDER|LIMIT|HAVING|UNION|WINDOW|FOR|LOCK|INTO)\b/i.test(body.slice(k, k + 40))) break;
          }
          splitTopLevel(body.slice(start, k)).forEach(function (part) {
            var pm = part.trim().replace(/^[(\s]+/, '').match(new RegExp('^(' + QUALIFIED + ')'));
            if (pm) refs[tname(pm[1])] = true;
          });
        }
        delete tables[vName];
        model.views[vName] = { name: vName, refs: Object.keys(refs), sql: body.trim() };
        return;
      }

      // SQL Server names the table first: CREATE TRIGGER t ON x AFTER INSERT, UPDATE AS ...
      var ms = stmt.match(new RegExp('^CREATE\\s+(?:OR\\s+ALTER\\s+)?TRIGGER\\s+(' + QUALIFIED + ')\\s+ON\\s+(' + QUALIFIED + ')\\s+(?:WITH\\s+[\\w\\s,]+?\\s+)?(FOR|AFTER|INSTEAD\\s+OF)\\s+((?:INSERT|UPDATE|DELETE)(?:\\s*,\\s*(?:INSERT|UPDATE|DELETE))*)\\b([\\s\\S]*)$', 'i'));
      if (ms) {
        var mtrig = { name: unquote(ms[1]), timing: ms[3].toUpperCase().replace(/\s+/g, ' ').replace('FOR', 'AFTER'), event: ms[4].toUpperCase().replace(/\s*,\s*/g, ' OR '), table: tname(ms[2]), body: ms[5].trim() };
        model.triggers.push(mtrig);
        table(mtrig.table).triggers.push(mtrig.name);
        return;
      }

      var tr = stmt.match(new RegExp('^CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:(?:NON)?EDITIONABLE\\s+)?(?:DEFINER\\s*=\\s*\\S+\\s+)?(?:TEMP(?:ORARY)?\\s+)?(?:CONSTRAINT\\s+)?TRIGGER\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(' + QUALIFIED + ')\\s+(BEFORE|AFTER|INSTEAD\\s+OF)\\s+((?:INSERT|UPDATE|DELETE|TRUNCATE)(?:\\s+OF\\s+[\\w\\s,"]+?)?(?:\\s+OR\\s+(?:INSERT|UPDATE|DELETE|TRUNCATE)(?:\\s+OF\\s+[\\w\\s,"]+?)?)*)\\s+ON\\s+(' + QUALIFIED + ')([\\s\\S]*)$', 'i'));
      if (tr) {
        // UPDATE OF col1, col2 is UPDATE: the event is the kind of change, as catalogues give it
        var trig = { name: unquote(tr[1]), timing: tr[2].toUpperCase().replace(/\s+/g, ' '), event: tr[3].toUpperCase().replace(/\s+OF\s+[\w\s,"]+?(?=\s+OR\s|$)/g, '').replace(/\s+/g, ' '), table: tname(tr[4]), body: tr[5].trim() };
        model.triggers.push(trig);
        table(trig.table).triggers.push(trig.name);
      }
    });

    // Partitions of one table (payment_p2022_01, ...) are shown as that table.
    Object.keys(partitions).forEach(function (child) {
      var parent = tables[partitions[child]];
      var part = tables[child];
      if (!parent) return;
      parent.partitions = (parent.partitions || []).concat(child);
      if (part && part.rows) parent.rows = (parent.rows || 0) + part.rows;
      // keys declared on each partition are the parent's links (once each)
      (part ? part.fks : []).forEach(function (fk) {
        var same = parent.fks.some(function (x) { return x.refTable === fk.refTable && x.columns.join() === fk.columns.join(); });
        if (!same) parent.fks.push(fk);
      });
      delete tables[child];
    });

    // tables referenced only by INSERT or ALTER but never created are leftovers, drop empty ones;
    // SQLite's own bookkeeping tables (sqlite_sequence, sqlite_stat1) are not the application's
    Object.keys(tables).forEach(function (k) {
      if (dialect === 'sqlite' && /^sqlite_/i.test(k)) { delete tables[k]; return; }
      if (!tables[k].columns.length && !tables[k].fks.length) {
        if (tables[k].rows) model.warnings.push('Rows found for ' + k + ' but no CREATE TABLE statement.');
        delete tables[k];
      }
    });

    // SQLite: a primary key of one INTEGER column is the row id, numbered automatically,
    // whether it is declared on the column or on its own line (not so for a two-column key)
    if (dialect === 'sqlite') {
      Object.keys(tables).forEach(function (k) {
        var t = tables[k];
        // (AUTOINCREMENT is only allowed on that same column, so this covers it too)
        t.columns.forEach(function (c) {
          c.autoIncrement = t.primaryKey.length === 1 && t.primaryKey[0] === c.name && /^integer$/i.test(c.type);
        });
      });
    }

    // A primary key column cannot be null, also when the key is added later by ALTER TABLE
    // (SQLite is the exception: it allows nulls there, except in the row id)
    if (dialect !== 'sqlite') {
      Object.keys(tables).forEach(function (k) {
        tables[k].columns.forEach(function (c) {
          if (tables[k].primaryKey.indexOf(c.name) >= 0) c.nullable = false;
        });
      });
    }

    if (dialect === 'oracle') {
      // Oracle builds an index for every primary key and unique constraint, and exports often
      // write it out again as CREATE UNIQUE INDEX: the key is enough, and one unique index each
      Object.keys(tables).forEach(function (k) {
        var t = tables[k];
        var seen = {};
        var pk = t.primaryKey.join();
        t.indexes = t.indexes.filter(function (ix) {
          var cols = ix.columns.join();
          if (ix.type !== 'UNIQUE') return true;
          if (cols === pk) return false;
          if (seen[cols]) return false;
          seen[cols] = true;
          return true;
        });
      });
    }

    // A foreign key written REFERENCES parent, with no columns, points at the parent's primary key
    Object.keys(tables).forEach(function (k) {
      tables[k].fks.forEach(function (fk) {
        if (!fk.refColumns.length && tables[fk.refTable]) fk.refColumns = tables[fk.refTable].primaryKey.slice();
      });
    });

    if (options.rowCounts) {
      Object.keys(options.rowCounts).forEach(function (k) {
        if (tables[k]) tables[k].rows = options.rowCounts[k];
      });
    }
    return model;
  }

  var api = { parse: parse, detectDialect: detectDialect, _scan: scan, _splitTopLevel: splitTopLevel, _parseColumn: parseColumn };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SchemaParser = api;
})(this);
