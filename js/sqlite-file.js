/*
 * Opening a SQLite database file in the browser.
 *
 * SQLite itself (sql.js, in vendor/) reads the file in this page: nothing is uploaded.
 * It is loaded only when a SQLite file is dropped, since it is about 1 MB. The
 * structure is read with the same catalogue query a SQLite console would run
 * (queries/sqlite.sql), and every table's rows are counted.
 *
 * Works in the browser (window.SqliteFile) and in Node for the tests, where the
 * engine is passed in.
 */
(function (root) {
  'use strict';

  var Json = (typeof module !== 'undefined' && module.exports) ? require('./schema-json.js') : root.SchemaJson;
  var Queries = (typeof module !== 'undefined' && module.exports) ? require('./queries.js') : root.JOINSCOPE_QUERIES;
  var loading = null;

  // "SQLite format 3" and a zero byte open every SQLite database file
  function isSqlite(bytes) {
    var sig = 'SQLite format 3';
    if (!bytes || bytes.length < 16) return false;
    for (var i = 0; i < sig.length; i++) if (bytes[i] !== sig.charCodeAt(i)) return false;
    return bytes[15] === 0;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load ' + src + '. Is the vendor folder next to index.html?')); };
      document.head.appendChild(s);
    });
  }

  function engine() {
    if (!loading) {
      loading = loadScript('vendor/sql-wasm.js')
        .then(function () { return loadScript('vendor/sql-wasm-binary.js'); })
        .then(function () {
          var raw = atob(root.SQL_WASM_BASE64);
          var bin = new Uint8Array(raw.length);
          for (var i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i);
          return root.initSqlJs({ wasmBinary: bin });
        });
      loading.catch(function () { loading = null; });
    }
    return loading;
  }

  // The catalogue document of an open database, with row counts filled in.
  function catalogue(db) {
    var res = db.exec(Queries.sqlite);
    if (!res.length) throw new Error('SQLite returned no description of this database.');
    var doc = JSON.parse(res[0].values[0][0]);
    (doc.tables || []).forEach(function (t) {
      try {
        var n = db.exec('SELECT COUNT(*) FROM "' + String(t.table).replace(/"/g, '""') + '"');
        t.rows = n.length ? Number(n[0].values[0][0]) : null;
      } catch (e) {
        t.rows = null;
      }
    });
    return doc;
  }

  // bytes: Uint8Array of the file. SQL: an engine from initSqlJs (Node tests), else loaded here.
  function read(bytes, SQL) {
    var ready = SQL ? Promise.resolve(SQL) : engine();
    return ready.then(function (S) {
      var db = new S.Database(bytes);
      try {
        return Json.toModel(catalogue(db));
      } finally {
        db.close();
      }
    });
  }

  var api = { isSqlite: isSqlite, read: read, catalogue: catalogue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SqliteFile = api;
})(this);
