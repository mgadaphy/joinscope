#!/usr/bin/env node
/*
 * Joinscope's tests. Plain Node, nothing to install:  node tests/run.js
 *
 * The fixtures in tests/fixtures were made from real servers (MariaDB 10.4, PostgreSQL 18,
 * SQLite through sql.js): a dump of each database and the result of its catalogue query.
 * Both ways in must give the same picture of the same database.
 */
'use strict';
global.window = global;
var fs = require('fs');
var path = require('path');
var P = require('../js/parser.js');
var M = require('../js/schema-model.js');
var J = require('../js/schema-json.js');
var F = require('../js/sqlite-file.js');
var Q = require('../js/queries.js');

var root = path.join(__dirname, '..');
var fixture = function (name) { return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'); };
var passed = 0;
var failed = [];
var queue = [];

function test(name, fn) { queue.push({ name: name, fn: fn }); }
function eq(actual, expected, what) {
  var a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error((what ? what + ': ' : '') + 'expected ' + e + ', got ' + a);
}
function ok(cond, what) { if (!cond) throw new Error(what || 'expected true'); }

var count = function (model) {
  var names = Object.keys(model.tables);
  return {
    tables: names.length,
    columns: names.reduce(function (s, n) { return s + model.tables[n].columns.length; }, 0),
    fks: names.reduce(function (s, n) { return s + model.tables[n].fks.length; }, 0),
    views: Object.keys(model.views).length,
    triggers: model.triggers.length
  };
};

// The same database read two ways: every table, column, type, key, index and view link.
function sameDatabase(a, b) {
  var norm = function (t) { return String(t || '').toLowerCase().replace(/\b(tinyint|smallint|mediumint|int|integer|bigint)\(\d+\)/g, '$1').replace(/\s+/g, ' ').trim(); };
  var out = [];
  eq(Object.keys(a.tables).sort(), Object.keys(b.tables).sort(), 'tables');
  Object.keys(a.tables).forEach(function (n) {
    var A = a.tables[n], B = b.tables[n];
    eq(A.columns.map(function (c) { return c.name; }), B.columns.map(function (c) { return c.name; }), n + ' columns');
    A.columns.forEach(function (c, i) {
      var d = B.columns[i];
      if (norm(c.type) !== norm(d.type)) out.push(n + '.' + c.name + ' type ' + c.type + ' / ' + d.type);
      if (!!c.nullable !== !!d.nullable) out.push(n + '.' + c.name + ' nullable');
      if (!!c.autoIncrement !== !!d.autoIncrement) out.push(n + '.' + c.name + ' auto');
    });
    eq(A.primaryKey, B.primaryKey, n + ' primary key');
    var fk = function (f) { return f.columns.join('+') + '>' + f.refTable + '(' + f.refColumns.join('+') + ') ' + f.onDelete; };
    eq(A.fks.map(fk).sort(), B.fks.map(fk).sort(), n + ' foreign keys');
    var ix = function (i) { return i.type + ':' + i.columns.join('+'); };
    eq(A.indexes.map(ix).sort(), B.indexes.map(ix).sort(), n + ' indexes');
  });
  eq(Object.keys(a.views).sort(), Object.keys(b.views).sort(), 'views');
  Object.keys(a.views).forEach(function (v) { eq(a.views[v].refs.slice().sort(), b.views[v].refs.slice().sort(), 'view ' + v + ' links'); });
  if (out.length) throw new Error(out.join('; '));
}

// ---------- detection ----------

test('the dialect is detected from the text', function () {
  eq(P.detectDialect(fixture('sakila-mariadb-dump.sql')), 'mysql');
  eq(P.detectDialect(fixture('pagila-pg18-dump.sql')), 'postgres');
  eq(P.detectDialect(fixture('chinook-sqlite-script.sql')), 'sqlite');
  eq(P.detectDialect('CREATE TABLE a (id bigint GENERATED ALWAYS AS IDENTITY);'), 'postgres');
  // MySQL accepts SERIAL too, and data can mention anything: neither decides
  eq(P.detectDialect('CREATE TABLE a (id SERIAL PRIMARY KEY);'), 'mysql');
  eq(P.detectDialect("CREATE TABLE `posts` (`id` int, `body` text);\nINSERT INTO `posts` VALUES (1,'ALTER TABLE x OWNER TO postgres; SET search_path');"), 'mysql');
  eq(P.detectDialect('SET ANSI_NULLS ON\nGO\nCREATE TABLE [dbo].[a] (id int)'), 'sqlserver');
  eq(P.detectDialect('CREATE TABLE `a` (`id` int);'), 'mysql');
});

// ---------- the same database, two ways in ----------

test('MariaDB: the catalogue query and mysqldump agree (Sakila)', function () {
  var a = P.parse(fixture('sakila-mariadb-dump.sql'));
  var b = J.parseText(fixture('sakila-mariadb-catalogue.json'));
  eq(count(a), { tables: 16, columns: 89, fks: 22, views: 7, triggers: 3 }, 'dump');
  sameDatabase(a, b);
});

test('PostgreSQL: the catalogue query and pg_dump agree (Pagila, schemas, partitions)', function () {
  var a = P.parse(fixture('pagila-pg18-dump.sql'));
  var b = J.parseText(fixture('pagila-pg18-catalogue.json'));
  eq(count(a), { tables: 17, columns: 96, fks: 22, views: 8, triggers: 15 }, 'dump');
  sameDatabase(a, b);
  // a second schema keeps its name; its link from public is kept
  ok(a.tables['auth.users'], 'auth.users');
  eq(a.tables.profiles.fks[0].refTable, 'auth.users');
  // the 55 monthly partitions are payment, with the keys declared on them
  eq(a.tables.payment.partitions.length, 55);
  eq(a.tables.payment.fks.length, 3);
  // COPY data is counted, as the catalogue counts it
  eq([a.tables.language.rows, a.tables.country.rows, a.tables['auth.users'].rows], [3, 2, 2]);
  eq([b.tables.language.rows, b.tables.country.rows, b.tables['auth.users'].rows], [3, 2, 2]);
});

test('SQLite: the catalogue query on the file and the SQL script agree (Chinook)', function () {
  var a = P.parse(fixture('chinook-sqlite-script.sql'));
  var b = J.parseText(fixture('chinook-sqlite-catalogue.json'));
  // The released Chinook file lacks one index its script creates; everything else matches.
  a.tables.PlaylistTrack.indexes = a.tables.PlaylistTrack.indexes.filter(function (i) { return i.columns[0] !== 'PlaylistId'; });
  sameDatabase(a, b);
  eq(b.tables.Track.rows, 3503);
});

// ---------- parser details found on real dumps ----------

test('quoted text never counts as a keyword (a comment saying "not null")', function () {
  var m = P.parse("CREATE TABLE t (a varchar(9) DEFAULT 'x' COMMENT 'not null, default 5, auto_increment, references q(id)', b int NOT NULL DEFAULT 3);");
  eq(m.tables.t.columns.map(function (c) { return [c.name, c.nullable, c.default, c.autoIncrement]; }), [['a', true, 'x', false], ['b', false, '3', false]]);
  eq(m.tables.t.fks.length, 0);
});

test('PostgreSQL: multi-word types, casts, serial and identity, a column named fulltext', function () {
  var m = P.parse("SET search_path = '';\nCREATE TABLE public.f (id integer DEFAULT nextval('public.f_id_seq'::regclass) NOT NULL, " +
    "rating public.mpaa_rating DEFAULT 'G'::public.mpaa_rating, at timestamp(0) with time zone DEFAULT now(), fulltext tsvector NOT NULL, " +
    "n bigserial, g bigint GENERATED BY DEFAULT AS IDENTITY, v numeric(4,2) GENERATED ALWAYS AS (1.5) STORED);");
  var c = {};
  m.tables.f.columns.forEach(function (x) { c[x.name] = x; });
  eq(Object.keys(c), ['id', 'rating', 'at', 'fulltext', 'n', 'g', 'v']);
  eq([c.id.autoIncrement, c.id.default], [true, null]);
  eq([c.rating.type, c.rating.default], ['mpaa_rating', 'G']);
  eq(c.at.type, 'timestamp(0) with time zone');
  eq([c.n.type, c.n.autoIncrement, c.g.autoIncrement, c.v.generated], ['bigint', true, true, true]);
});

test('PostgreSQL: dollar-quoted bodies do not end a statement early', function () {
  var m = P.parse("SET search_path = '';\nCREATE FUNCTION f() RETURNS trigger AS $body$ BEGIN; CREATE TABLE fake (x int); END; $body$ LANGUAGE plpgsql;\nCREATE TABLE real_one (id int PRIMARY KEY);");
  eq(Object.keys(m.tables), ['real_one']);
});

test('SQLite: trigger bodies, bracketed names, REFERENCES without columns, row ids', function () {
  var m = P.parse("PRAGMA foreign_keys=ON;\nCREATE TABLE [users] ([id] INTEGER PRIMARY KEY, name TEXT);\n" +
    "CREATE TABLE orders (id INTEGER NOT NULL, user_id INTEGER REFERENCES users ON DELETE CASCADE, CONSTRAINT pk PRIMARY KEY (id));\n" +
    "CREATE TABLE pair (a INTEGER, b INTEGER, PRIMARY KEY (a, b));\n" +
    "CREATE TRIGGER t AFTER UPDATE ON orders BEGIN UPDATE orders SET id = id; SELECT 1; END;\nCREATE TABLE after_trigger (x TEXT);");
  eq(Object.keys(m.tables).sort(), ['after_trigger', 'orders', 'pair', 'users']);
  eq(m.triggers.length, 1);
  eq(m.tables.orders.fks[0].refTable + '.' + m.tables.orders.fks[0].refColumns, 'users.id');
  eq([m.tables.users.columns[0].autoIncrement, m.tables.orders.columns[0].autoIncrement, m.tables.pair.columns[0].autoIncrement], [true, true, false]);
});

test('views link to every table, bracketed joins and comma joins included', function () {
  var m = P.parse("SET search_path = '';\nCREATE TABLE public.a (id int); CREATE TABLE public.b (id int); CREATE TABLE public.c (id int);\n" +
    "CREATE VIEW public.v AS SELECT 1 FROM ((public.a x LEFT JOIN public.b y ON true) JOIN public.c z ON true);\n" +
    "CREATE VIEW public.w AS SELECT 1 FROM public.a, (SELECT 1 FROM public.b) q, public.c;");
  eq(m.views.v.refs.filter(function (r) { return m.tables[r]; }).sort(), ['a', 'b', 'c']);
  eq(m.views.w.refs.filter(function (r) { return m.tables[r]; }).sort(), ['a', 'b', 'c']);
});

test('MySQL dumps read as before (samples)', function () {
  window.DEFAULT_SCHEMA = undefined; window.EXTRA_SCHEMAS = undefined;
  ['webshop', 'webshop-fixed', 'chinook', 'sakila', 'pagila'].forEach(function (f) {
    delete require.cache[require.resolve('../samples/' + f + '.js')];
    require('../samples/' + f + '.js');
  });
  var webshop = P.parse(window.DEFAULT_SCHEMA.sql, { rowCounts: window.DEFAULT_SCHEMA.rowCounts });
  eq(count(webshop), { tables: 11, columns: 49, fks: 7, views: 0, triggers: 0 });
  eq(M.issues(M.build(webshop)).list.length, 14);
  var fixed = P.parse(window.EXTRA_SCHEMAS['webshop-fixed'].sql);
  eq(M.issues(M.build(fixed)).list.length, 1);
  var pagila = P.parse(window.EXTRA_SCHEMAS.pagila.sql);
  eq([pagila.dialect, count(pagila).tables, count(pagila).fks], ['postgres', 16, 22]);
});

// ---------- found by the review of 25 Oct 2026 ----------

test('MySQL: a DELIMITER block does not change how the rest of the dump is read', function () {
  var m = P.parse('CREATE TABLE `a` (`id` int);\nDELIMITER ;;\nCREATE TRIGGER t BEFORE INSERT ON `a` FOR EACH ROW BEGIN SET @x = 1; END ;;\nDELIMITER ;\n# a comment\nCREATE TABLE `b` (`id` int);');
  eq(Object.keys(m.tables).sort(), ['a', 'b']);
});

test('MySQL: data that mentions PostgreSQL keeps the dump MySQL, every table read', function () {
  var m = P.parse("CREATE TABLE `posts` (`id` int, `body` text, KEY `k` (`id`));\nINSERT INTO `posts` VALUES (1,'it\\'s ALTER TABLE x OWNER TO y;');\nCREATE TABLE `tags` (`id` int);");
  eq([m.dialect, Object.keys(m.tables).sort(), m.tables.posts.columns.length], ['mysql', ['posts', 'tags'], 2]);
});

test('PostgreSQL: E strings, ARRAY defaults, identity columns, quoted types, folded names, psql lines', function () {
  var m = P.parse("SET search_path = '';\n\\connect shop\nCREATE TABLE public.\"Users\" (id bigint GENERATED BY DEFAULT AS IDENTITY, note text DEFAULT E'it\\'s; fine', " +
    "tags int[] DEFAULT ARRAY[1,2], mood public.\"MyEnum\", Plain_Name text);\nCREATE TABLE Orders (ID int);");
  eq(Object.keys(m.tables).sort(), ['Users', 'orders']);
  var c = m.tables.Users.columns;
  eq(c.map(function (x) { return x.name; }), ['id', 'note', 'tags', 'mood', 'plain_name']);
  eq([c[0].autoIncrement, c[0].default, c[1].default, c[2].type, c[3].type], [true, null, "it's; fine", 'int[]', 'MyEnum']);
});

test('expression and partial indexes are never offered as duplicates to drop', function () {
  var m = P.parse("SET search_path = '';\nCREATE TABLE public.u (id int PRIMARY KEY, email text, name text, deleted_at timestamp);\n" +
    'CREATE INDEX u_email_lower ON public.u USING btree (lower(email));\nCREATE INDEX u_name_lower ON public.u USING btree (lower(name));\n' +
    'CREATE INDEX u_email_live ON public.u (email) WHERE deleted_at IS NULL;\nCREATE INDEX u_email_name ON public.u (email, name);');
  eq(m.tables.u.indexes.map(function (i) { return i.columns.join('+') + (i.partial ? ' partial' : ''); }), ['lower(email)', 'lower(name)', 'email partial', 'email+name']);
  eq(M.issues(M.build(m)).list.filter(function (i) { return i.kind === 'dup-index'; }).length, 0);
});

test('SQLite: CASE ... END inside a trigger body does not end the trigger', function () {
  var m = P.parse("PRAGMA foreign_keys=ON;\nCREATE TABLE a (id INTEGER PRIMARY KEY, v TEXT);\n" +
    "CREATE TRIGGER t AFTER INSERT ON a BEGIN UPDATE a SET v = CASE WHEN v IS NULL THEN 'x' ELSE v END; INSERT INTO a (v) VALUES ('y'); END;\nCREATE TABLE b (id INTEGER);");
  eq([Object.keys(m.tables).sort(), m.triggers.length, m.tables.a.rows], [['a', 'b'], 1, null]);
});

test('PostgreSQL type changes convert the values; other databases get no fix statements', function () {
  var pg = P.parse("SET search_path = '';\nCREATE TABLE public.c (id integer PRIMARY KEY); CREATE TABLE public.o (id integer PRIMARY KEY, c_id character varying(20));");
  var script = M.fixScript(M.issues(M.build(pg)).list, 'x', 'postgres');
  ok(/ALTER COLUMN "c_id" TYPE integer USING "c_id"::integer;/.test(script), script);
  var other = J.toModel({ format: 'joinscope-schema', version: 1, dialect: 'other', tables: [
    { name: 'g', columns: [{ name: 'id', type: 'int' }] },
    { name: 'p', columns: [{ name: 'id', type: 'int' }, { name: 'g_id', type: 'int' }], primaryKey: ['id'], foreignKeys: [{ columns: ['g_id'], references: 'g', onDelete: 'CASCADE' }] }] });
  var issues = M.issues(M.build(other)).list;
  ok(issues.length > 0 && issues.every(function (i) { return i.sql == null; }), JSON.stringify(issues.map(function (i) { return i.sql; })));
});

test('pasted JSON that is the wrong shape is cleaned, never stored broken', function () {
  var m = J.toModel({ format: 'joinscope-schema', version: 1, tables: [{ name: '__proto__', columns: 'nope' }, { name: 't', columns: [{ name: 'a' }, null, 5], primaryKey: 'a' }],
    views: [{ name: 'v', refs: 'a', sql: 'SELECT * FROM t' }] });
  eq(Object.keys(m.tables).sort(), ['__proto__', 't']);
  eq(m.tables.t.columns.length, 1);
  eq(m.views.v.refs, ['t']);
  M.build(m);
});

// ---------- fixes in each database's own SQL ----------

test('fix scripts are written in the loaded database\'s SQL', function () {
  var mk = function (sql) { var m = P.parse(sql); return M.fixScript(M.issues(M.build(m)).list, 'x', m.dialect); };
  var my = mk('CREATE TABLE `u` (`id` int NOT NULL, PRIMARY KEY (`id`)); CREATE TABLE `o` (`id` int NOT NULL, `u_id` bigint NOT NULL, PRIMARY KEY (`id`));');
  ok(/ALTER TABLE `o` MODIFY `u_id` INT NOT NULL;/.test(my), my);
  ok(/ALTER TABLE `o` ADD CONSTRAINT `o_u_id_foreign` FOREIGN KEY \(`u_id`\) REFERENCES `u` \(`id`\) ON DELETE RESTRICT;/.test(my), my);
  var pg = mk("SET search_path = '';\nCREATE TABLE public.u (id integer PRIMARY KEY); CREATE TABLE public.o (id integer PRIMARY KEY, u_id integer NOT NULL REFERENCES public.u(id) ON DELETE CASCADE, paid_amount numeric);" +
    "CREATE TABLE public.payments (id integer PRIMARY KEY, o_id integer REFERENCES public.o(id) ON DELETE CASCADE);");
  ok(/ALTER TABLE "payments" DROP CONSTRAINT/.test(pg) && /CREATE INDEX "o_u_id_index" ON "o" \("u_id"\);/.test(pg), pg);
  var lite = mk('PRAGMA foreign_keys=ON;\nCREATE TABLE u (id INTEGER PRIMARY KEY); CREATE TABLE payments (id INTEGER PRIMARY KEY, u_id INTEGER REFERENCES u ON DELETE CASCADE); CREATE TABLE loose (x TEXT, u_id INTEGER);');
  ok(/SQLite cannot add a primary key/.test(lite) && /CREATE INDEX "payments_u_id_index" ON "payments" \("u_id"\);/.test(lite), lite);
});

// ---------- Joinscope's own JSON ----------

test('a schema exported as JSON comes back the same', function () {
  ['pagila-pg18-dump.sql', 'sakila-mariadb-dump.sql', 'chinook-sqlite-script.sql'].forEach(function (f) {
    var a = P.parse(fixture(f));
    var doc = J.fromModel(a, f);
    eq(doc.format, 'joinscope-schema');
    var b = J.toModel(JSON.parse(JSON.stringify(doc)));
    eq(b.dialect, a.dialect, f);
    sameDatabase(a, b);
  });
});

test('a pasted query result is read with its heading or quotes still around it', function () {
  var text = fixture('sakila-mariadb-catalogue.json').trim();
  eq(count(J.parseText('joinscope\n' + text)).tables, 16);
  eq(count(J.parseText(JSON.stringify(text))).tables, 16);
  ok(J.looksLikeJson('joinscope\n{"format":1}') && !J.looksLikeJson('CREATE TABLE a (id int);'));
});

test('the page carries the same queries as queries/*.sql', function () {
  fs.readdirSync(path.join(root, 'queries')).forEach(function (f) {
    eq(Q[f.replace(/\.sql$/, '')], fs.readFileSync(path.join(root, 'queries', f), 'utf8').replace(/\r\n/g, '\n'), f + ' (run node tools/build-queries.js)');
  });
});

// ---------- SQLite files, with the bundled engine ----------

test('a SQLite file is read in the browser engine: views, triggers, composite keys, row counts', function () {
  var src = fs.readFileSync(path.join(root, 'vendor', 'sql-wasm-binary.js'), 'utf8');
  var b64 = src.match(/"([A-Za-z0-9+/=]+)"/)[1];
  var initSqlJs = require('../vendor/sql-wasm.js');
  return initSqlJs({ wasmBinary: Buffer.from(b64, 'base64') }).then(function (SQL) {
    var db = new SQL.Database();
    db.run('PRAGMA foreign_keys = ON;' +
      'CREATE TABLE country (code TEXT, region INTEGER, name TEXT, PRIMARY KEY (code, region));' +
      'CREATE TABLE city (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT, region INTEGER, ' +
      '  FOREIGN KEY (code, region) REFERENCES country (code, region) ON DELETE SET NULL);' +
      'CREATE INDEX city_name ON city (name);' +
      'CREATE VIEW big_cities AS SELECT c.name FROM city c JOIN country k ON k.code = c.code;' +
      'CREATE TRIGGER city_touch AFTER INSERT ON city BEGIN SELECT 1; END;' +
      "INSERT INTO country VALUES ('CM', 1, 'Cameroon'); INSERT INTO city (name, code, region) VALUES ('Douala', 'CM', 1), ('Yaounde', 'CM', 1);");
    var bytes = db.export();
    db.close();
    ok(F.isSqlite(bytes) && !F.isSqlite(new Uint8Array([67, 82, 69])), 'file signature');
    return F.read(bytes, SQL).then(function (m) {
      eq(m.dialect, 'sqlite');
      eq(m.tables.city.fks[0], { name: null, columns: ['code', 'region'], refTable: 'country', refColumns: ['code', 'region'], onDelete: 'SET NULL', onUpdate: 'RESTRICT' });
      eq(m.tables.country.primaryKey, ['code', 'region']);
      eq([m.tables.city.columns[0].autoIncrement, m.tables.country.columns[0].autoIncrement], [true, false]);
      eq(m.tables.city.indexes.map(function (i) { return i.name; }), ['city_name']);
      eq(m.views.big_cities.refs.slice().sort(), ['city', 'country']);
      eq(m.triggers.map(function (t) { return t.name; }), ['city_touch']);
      eq([m.tables.city.rows, m.tables.country.rows], [2, 1]);
    });
  });
});

// ---------- run ----------

(function next(i) {
  if (i >= queue.length) {
    console.log('\n' + passed + ' passed' + (failed.length ? ', ' + failed.length + ' failed' : ''));
    failed.forEach(function (f) { console.log('\nFAIL ' + f.name + '\n  ' + f.error); });
    process.exit(failed.length ? 1 : 0);
  }
  var t = queue[i];
  var done = function (err) {
    if (err) { failed.push({ name: t.name, error: err.message || String(err) }); process.stdout.write('F'); } else { passed++; process.stdout.write('.'); }
    next(i + 1);
  };
  try {
    var r = t.fn();
    if (r && typeof r.then === 'function') r.then(function () { done(); }, done); else done();
  } catch (e) { done(e); }
})(0);
