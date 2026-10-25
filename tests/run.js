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
      // a script gives a SQL Server computed column no type (x AS (a * b)); the catalogue knows it
      var untyped = c.generated && d.generated && (!c.type || !d.type);
      if (norm(c.type) !== norm(d.type) && !untyped) out.push(n + '.' + c.name + ' type ' + c.type + ' / ' + d.type);
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

test('SQL Server: the catalogue query and an SSMS script agree (Northwind, SQL Server 2022)', function () {
  // scripted by SMO, as SSMS Generate Scripts does: byte order mark, [brackets], GO, extended properties
  var a = P.parse(fixture('northwind-mssql2022-ssms.sql'));
  var b = J.parseText(fixture('northwind-mssql2022-catalogue.json'));
  eq([a.dialect, b.dialect], ['sqlserver', 'sqlserver']);
  eq(count(a), { tables: 17, columns: 108, fks: 17, views: 17, triggers: 1 }, 'dump');
  sameDatabase(a, b);
  // dbo is left off, another schema stays in the name
  ok(a.tables['Order Details'] && a.tables['sales.Promotion Usage'], 'names');
  var cols = function (m) { return m.tables['sales.Promotions'].columns.map(function (x) { return [x.name, x.type, x.nullable, x.autoIncrement, x.default]; }); };
  var promotions = [['PromotionID', 'int', false, true, null], ['Code', 'varchar(20)', false, false, null], ['Starts', 'datetime2(3)', false, false, 'sysdatetime()'],
    ['Percentage', 'decimal(5,2)', false, false, '0'], ['Label', 'nvarchar(max)', true, false, null], ['Token', 'uniqueidentifier', false, false, 'newid()']];
  eq(cols(a), promotions, 'script');
  eq(cols(b), promotions, 'catalogue');
  var p = a.tables['sales.Promotions'];
  eq([p.comment, p.columns[3].comment], ['Discounts on products; one row per code', "Percent off, 0 to 100 (it's not null)"]);
  eq(a.tables['sales.PromotionProducts'].indexes.map(function (i) { return [i.name, i.columns.join(), !!i.partial]; }), [['IX_PromotionProducts_Note', 'Note', true]]);
  eq(a.views['sales.ActivePromotions'].refs.slice().sort(), ['Products', 'sales.PromotionProducts', 'sales.Promotions']);
  eq(b.tables.Orders.rows, 830);
});

test('Oracle: the catalogue query, Data Pump and DBMS_METADATA agree (HR, Oracle 23ai)', function () {
  var a = P.parse(fixture('hr-oracle23-datapump.sql'));
  var c = P.parse(fixture('hr-oracle23-metadata.sql'));
  // SQL*Plus printed this as Oracle wrote it, with a tab left unescaped in a view's text
  var b = J.parseText(fixture('hr-oracle23-catalogue.json'));
  eq([a.dialect, c.dialect, b.dialect], ['oracle', 'oracle', 'oracle']);
  eq(count(a), { tables: 10, columns: 49, fks: 14, views: 2, triggers: 3 }, 'dump');
  sameDatabase(a, b);
  sameDatabase(c, b);
  // Data Pump writes the virtual column without its type, then gives it in an ALTER TABLE at the end
  var cols = function (m) { return m.tables.PROJECTS.columns.map(function (x) { return [x.name, x.type, x.default, x.autoIncrement, !!x.generated]; }); };
  var projects = [['PROJECT_ID', 'number', null, true, false], ['NAME', 'varchar2(100)', null, false, false], ['BUDGET', 'number(12,2)', '0', false, false],
    ['STARTED', 'date', 'SYSDATE', false, false], ['BUDGET_K', 'number', null, false, true], ['DEPARTMENT_ID', 'number(4,0)', null, false, false]];
  eq(cols(a), projects, 'dump');
  eq(cols(b), projects, 'catalogue');
  // a primary key added by ALTER TABLE makes its column NOT NULL; the function index keeps its expression
  eq([a.tables.JOBS.columns[0].nullable, b.tables.PROJECT_NOTES.indexes[0].columns], [false, ['UPPER(TO_CHAR(SUBSTR("BODY",1,50)))']]);
  eq(a.tables.PROJECT_NOTES.indexes[0].columns, b.tables.PROJECT_NOTES.indexes[0].columns);
  eq(b.tables.EMPLOYEES.rows, 107);
  // SQL*Plus cuts a long result into lines of 32767 characters, wherever they fall: inside a name,
  // a number or just after a backslash. Cut every 97 characters here, it reads the same.
  var text = fixture('hr-oracle23-catalogue.json').trim(), cut = '';
  for (var i = 0; i < text.length; i += 97) cut += text.slice(i, i + 97) + '\n';
  var w = J.parseText(cut);
  sameDatabase(w, b);
  eq(w.views.EMP_DETAILS_VIEW.sql, b.views.EMP_DETAILS_VIEW.sql);
  eq(w.tables.LOCATIONS.comment, b.tables.LOCATIONS.comment);
});

// ---------- parser details found on real dumps ----------

test('found in review: detection, array defaults, odd constraint names, sqlcmd headings', function () {
  // a comment or text that mentions another database's words decides nothing
  var sakila = fixture('sakila-mariadb-dump.sql').replace('CREATE TABLE `actor` (', "CREATE TABLE `actor` (\n  `legacy` int COMMENT 'was NUMBER(10), IDENTITY(1,1) NONCLUSTERED [dbo].x',");
  eq(P.detectDialect(sakila), 'mysql');
  eq(P.detectDialect('PRAGMA foreign_keys=ON;\nCREATE TABLE a (id INTEGER PRIMARY KEY AUTOINCREMENT, p NUMBER(10,2));'), 'sqlite');
  eq(P.detectDialect('-- moved from Oracle, where this was VARCHAR2(20)\nCREATE TABLE a (id integer GENERATED ALWAYS AS IDENTITY);'), 'postgres');
  eq(P.detectDialect("CREATE TABLE a (id NUMBER(10) PRIMARY KEY, n VARCHAR2(20));\nCOMMENT ON COLUMN a.id IS 'replaces AUTOINCREMENT';"), 'oracle');
  // a backslash ends no string outside MySQL: 'C:\' is whole, and the text after it stays text
  eq(P.detectDialect("CREATE TABLE a (id NUMBER(10) PRIMARY KEY, p VARCHAR2(9) DEFAULT 'C:\\');\nCOMMENT ON TABLE a IS 'see `docs`';"), 'oracle');
  eq(P.detectDialect("CREATE TABLE [dbo].[a] ([p] nvarchar(10) DEFAULT ('\\'))\nGO\nEXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'use `x` here'"), 'sqlserver');
  // constraints with such names are read as constraints, keys included
  var named = P.parse('CREATE TABLE b (id integer PRIMARY KEY);\nCREATE TABLE a (id integer, b_id integer, CONSTRAINT clé_pk PRIMARY KEY (id), CONSTRAINT clé_uq UNIQUE (b_id),\n' +
    '  CONSTRAINT clé_fk FOREIGN KEY (b_id) REFERENCES b (id));\nALTER TABLE public.a OWNER TO x;');
  eq([named.tables.a.columns.length, named.tables.a.primaryKey, named.tables.a.indexes[0].name, named.tables.a.fks[0].name], [2, ['id'], 'clé_uq', 'clé_fk']);
  // PostgreSQL's ARRAY['...'] holds texts, not keywords
  var pg = P.parse("CREATE TABLE public.u (id integer NOT NULL, roles text[] DEFAULT ARRAY['primary key'::text, 'unique'::text]);\nALTER TABLE public.u OWNER TO x;");
  eq([pg.tables.u.columns[1].type, pg.tables.u.columns[1].unique, pg.tables.u.primaryKey], ['text[]', false, []]);
  // an unquoted constraint name with letters \w does not know is not a column
  var odd = P.parse('CREATE TABLE p (id int PRIMARY KEY);\nCREATE TABLE c (id int PRIMARY KEY, p_id int, n int, CONSTRAINT vérif CHECK (n > 0));');
  eq(odd.tables.c.columns.map(function (c) { return c.name; }), ['id', 'p_id', 'n']);
  // sqlcmd may print the heading and a line of dashes above the cell
  var cat = 'joinscope\r\n' + new Array(60).join('-') + '\r\n' + fixture('northwind-mssql2022-catalogue.json');
  ok(J.looksLikeJson(cat), 'looks like JSON');
  eq(Object.keys(J.parseText(cat).tables).length, 17);
});

test('found in review: type changes the servers accept', function () {
  var mk = function (sql) { var m = P.parse(sql); return M.fixScript(M.issues(M.build(m)).list, 'x', m.dialect); };
  // SQL Server will not change a column an index uses: the index is dropped and made again, in the fix's transaction
  var ms = mk('CREATE TABLE [dbo].[products]([id] bigint NOT NULL PRIMARY KEY)\nGO\nCREATE TABLE [dbo].[order_items]([id] int NOT NULL PRIMARY KEY, [product_id] int NOT NULL)\nGO\n' +
    'CREATE INDEX [IX_pid] ON [dbo].[order_items] ([product_id], [id])\nGO\n');
  ok(/BEGIN TRANSACTION;\n-- The indexes are made again as read here[^\n]*\nDROP INDEX \[IX_pid\] ON \[order_items\];\nALTER TABLE \[order_items\] ALTER COLUMN \[product_id\] BIGINT NOT NULL;\nCREATE INDEX \[IX_pid\] ON \[order_items\] \(\[product_id\], \[id\]\);\nALTER TABLE \[order_items\] ADD CONSTRAINT/.test(ms), ms);
  // Oracle: NUMBER with no size holds NUMBER(6,0), so nothing is narrowed; a change of type says it needs an empty column
  var ora = mk('CREATE TABLE DEPTS (ID NUMBER(6,0) PRIMARY KEY);\nCREATE TABLE EMPS (ID NUMBER PRIMARY KEY, DEPT_ID NUMBER, CONSTRAINT F FOREIGN KEY (DEPT_ID) REFERENCES DEPTS (ID));\n' +
    'CREATE TABLE X (ID NUMBER(10) PRIMARY KEY, DEPTS_ID VARCHAR2(10));\n');
  ok(!/MODIFY \("DEPT_ID"/.test(ora), ora);
  ok(/-- Oracle changes a column to another type \(VARCHAR2 to NUMBER\) only while every value in it is empty:\n.*\nALTER TABLE "X" MODIFY \("DEPTS_ID" NUMBER\(6,0\)\);/.test(ora), ora);
  // NUMBER(10,0) is NUMBER(10); making a column smaller says it needs an empty column
  var sizes = mk('CREATE TABLE Q (ID NUMBER(10) PRIMARY KEY);\nCREATE TABLE C (ID NUMBER(10) PRIMARY KEY, Q_ID NUMBER(10,0), CONSTRAINT F FOREIGN KEY (Q_ID) REFERENCES Q (ID));\n' +
    'CREATE TABLE D (ID NUMBER(10) PRIMARY KEY, Q_ID NUMBER(12,2), CONSTRAINT G FOREIGN KEY (Q_ID) REFERENCES Q (ID));\n' +
    'CREATE TABLE E (ID NUMBER(10) PRIMARY KEY, Q_ID NUMBER(5,0));\n');
  ok(!/ALTER TABLE "C" MODIFY/.test(sizes), sizes);
  // a smaller column is made larger before its new foreign key, which Oracle does with data in it
  ok(/\nALTER TABLE "E" MODIFY \("Q_ID" NUMBER\(10\)\);\nALTER TABLE "E" ADD CONSTRAINT "E_Q_ID_FOREIGN"/.test(sizes), sizes);
  ok(/-- This makes Q_ID smaller \(NUMBER\(12,2\) to NUMBER\(10\)\), which Oracle does only while every value in it is empty\.\nALTER TABLE "D" MODIFY/.test(sizes), sizes);
  // SQL Server: a cascading NOT NULL key made SET NULL drops the old key before changing the column it uses
  var people = mk('CREATE TABLE [dbo].[classes]([id] int NOT NULL PRIMARY KEY)\nGO\nCREATE TABLE [dbo].[students]([id] int NOT NULL PRIMARY KEY, [class_id] int NOT NULL, ' +
    'CONSTRAINT [FK_st_class] FOREIGN KEY ([class_id]) REFERENCES [dbo].[classes] ([id]) ON DELETE CASCADE)\nGO\nCREATE INDEX [IX_st_class] ON [dbo].[students] ([class_id])\nGO\n');
  ok(/DROP CONSTRAINT \[FK_st_class\];\n[^\n]*\nDROP INDEX \[IX_st_class\] ON \[students\];\nALTER TABLE \[students\] ALTER COLUMN \[class_id\] INT NULL;\nCREATE INDEX \[IX_st_class\][^\n]*\nALTER TABLE \[students\] ADD CONSTRAINT \[FK_st_class\]/.test(people), people);
  // a key without a name cannot be dropped by the script: THROW stops the fix before a second key is added
  var unnamed = mk('CREATE TABLE [dbo].[students]([id] int NOT NULL PRIMARY KEY)\nGO\nCREATE TABLE [dbo].[payments]([id] int NOT NULL PRIMARY KEY, [students_id] int NOT NULL, ' +
    'FOREIGN KEY ([students_id]) REFERENCES [dbo].[students] ([id]) ON DELETE CASCADE)\nGO\n');
  ok(/\nTHROW 50000, N'Drop the existing foreign key on \(students_id\) first, then run this fix again\.', 1;\nALTER TABLE \[payments\] ADD CONSTRAINT/.test(unnamed), unnamed);
});

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

// ---------- SQL Server and Oracle scripts ----------

test('SQL Server: GO lines, no semicolons, [names] holding ; and ], procedure bodies, CLUSTERED keys', function () {
  var m = P.parse('/****** Object:  Table [dbo].[a;b]    Script Date: 25/10/2026 ******/\nSET ANSI_NULLS ON\nGO\n' +
    'CREATE TABLE [dbo].[a;b](\n\t[id] [int] IDENTITY(1,1) NOT NULL,\n\t[odd]]name] [nvarchar](40) NULL,\n\t[price] [decimal](10, 2) NOT NULL,\n\t[total]  AS ([price]*(2)),\n' +
    ' CONSTRAINT [PK_ab] PRIMARY KEY CLUSTERED \n(\n\t[id] ASC\n)WITH (PAD_INDEX = OFF) ON [PRIMARY]\n) ON [PRIMARY]\nGO\n' +
    'CREATE PROCEDURE [dbo].[p] AS\nBEGIN\n  SET NOCOUNT ON;\n  CREATE TABLE #fake (x int);\n  SELECT 1;\nEND\nGO\n' +
    'CREATE TABLE [sales].[orders]([id] [bigint] NOT NULL, [ab_id] [int] NULL, [note] [varchar](max) NULL, CONSTRAINT [UQ_note] UNIQUE NONCLUSTERED ([ab_id] ASC))\n' +
    'INSERT [sales].[orders] ([id], [ab_id]) VALUES (1, 1)\nINSERT [sales].[orders] ([id], [ab_id]) VALUES (2, NULL)\nGO\n' +
    'ALTER TABLE [dbo].[a;b] ADD  CONSTRAINT [DF_ab_price]  DEFAULT ((0)) FOR [price]\nGO\n' +
    'ALTER TABLE [sales].[orders]  WITH CHECK ADD  CONSTRAINT [FK_orders_ab] FOREIGN KEY([ab_id])\nREFERENCES [dbo].[a;b] ([id])\nON DELETE SET NULL\nGO\n' +
    'ALTER TABLE [sales].[orders] CHECK CONSTRAINT [FK_orders_ab]\nGO\n' +
    "CREATE NONCLUSTERED INDEX [IX_note] ON [sales].[orders]\n(\n\t[id] ASC\n)\nINCLUDE([note]) WHERE ([note] IS NOT NULL)\nGO\n" +
    "EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'What it''s worth' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'a;b', @level2type=N'COLUMN',@level2name=N'price'\nGO\n" +
    "EXEC sp_addextendedproperty N'MS_Description', N'One row per order', N'SCHEMA', N'sales', N'TABLE', N'orders'\nGO\n" +
    'CREATE TRIGGER [sales].[orders_touch] ON [sales].[orders] AFTER INSERT, UPDATE AS\nBEGIN\n  UPDATE [sales].[orders] SET [note] = NULL WHERE 1 = 0;\nEND\nGO\n' +
    'CREATE VIEW [dbo].[v] WITH SCHEMABINDING\nAS\nSELECT o.[id] FROM [sales].[orders] o INNER JOIN [dbo].[a;b] a ON a.[id] = o.[ab_id]\nGO\n');
  eq(m.dialect, 'sqlserver');
  eq(Object.keys(m.tables).sort(), ['a;b', 'sales.orders']);
  var ab = m.tables['a;b'], o = m.tables['sales.orders'];
  eq(ab.columns.map(function (c) { return [c.name, c.type, c.nullable, c.autoIncrement, c.default, !!c.generated]; }),
    [['id', 'int', false, true, null, false], ['odd]name', 'nvarchar(40)', true, false, null, false], ['price', 'decimal(10,2)', false, false, '0', false], ['total', '', true, false, null, true]]);
  eq([ab.primaryKey, ab.columns[2].comment, o.comment], [['id'], "What it's worth", 'One row per order']);
  eq(o.fks, [{ name: 'FK_orders_ab', columns: ['ab_id'], refTable: 'a;b', refColumns: ['id'], onDelete: 'SET NULL', onUpdate: 'RESTRICT' }]);
  eq(o.indexes.map(function (i) { return [i.type, i.name, i.columns.join(), !!i.partial]; }), [['UNIQUE', 'UQ_note', 'ab_id', false], ['INDEX', 'IX_note', 'id', true]]);
  eq([o.rows, m.triggers.map(function (t) { return t.table + ':' + t.timing + ' ' + t.event; }), m.views.v.refs.slice().sort()], [2, ['sales.orders:AFTER INSERT OR UPDATE'], ['a;b', 'sales.orders']]);
});

test('Oracle: SQL*Plus lines, PL/SQL blocks, ADD ( ... ) lists, REFERENCES without columns, owner left off', function () {
  var m = P.parse('REM the HR sample, abridged\nSET ECHO OFF\nPROMPT creating tables\n' +
    'CREATE TABLE "HR"."DEPTS" ("DEPT_ID" NUMBER(4,0) NOT NULL ENABLE, "NAME" VARCHAR2(30 BYTE) CONSTRAINT "D_NN" NOT NULL ENABLE,\n' +
    '  CONSTRAINT "DEPT_PK" PRIMARY KEY ("DEPT_ID") USING INDEX PCTFREE 10 TABLESPACE "USERS" ENABLE) SEGMENT CREATION IMMEDIATE TABLESPACE "USERS";\n' +
    'CREATE TABLE emps (emp_id NUMBER GENERATED BY DEFAULT ON NULL AS IDENTITY, dept_id NUMBER(4), email VARCHAR2(25), hired DATE DEFAULT SYSDATE,\n' +
    '  bonus NUMBER AS (1 * 2) VIRTUAL, CONSTRAINT emp_email_uk UNIQUE (email));\n' +
    'CREATE UNIQUE INDEX "HR"."EMP_PK" ON "HR"."EMPS" ("EMP_ID");\nCREATE UNIQUE INDEX "HR"."EMP_EMAIL_UK" ON "HR"."EMPS" ("EMAIL");\n' +
    'ALTER TABLE emps ADD ( CONSTRAINT emp_pk PRIMARY KEY (emp_id)\n  , CONSTRAINT emp_dept_fk FOREIGN KEY (dept_id) REFERENCES depts ON DELETE SET NULL ) ;\n' +
    'ALTER TABLE emps MODIFY (email NOT NULL ENABLE);\n' +
    'COMMENT ON COLUMN "HR"."EMPS"."EMAIL" IS \'Work address; not null\';\n' +
    'CREATE OR REPLACE EDITIONABLE TRIGGER "HR"."EMPS_BI" BEFORE INSERT OR UPDATE OF dept_id ON "HR"."EMPS" FOR EACH ROW\nBEGIN\n  :new.email := lower(:new.email);\n  NULL;\nEND;\n/\n' +
    'ALTER TRIGGER "HR"."EMPS_BI" ENABLE;\n' +
    'CREATE OR REPLACE FORCE EDITIONABLE VIEW "HR"."EMP_V" ("EMP_ID", "NAME") DEFAULT COLLATION "USING_NLS_COMP" AS\n  SELECT e.emp_id, d.name FROM emps e, depts d WHERE d.dept_id = e.dept_id;\n' +
    'BEGIN\n  DBMS_STATS.GATHER_SCHEMA_STATS(\'HR\');\nEND;\n/\nCREATE TABLE after_block (x NUMBER);\n');
  eq(m.dialect, 'oracle');
  eq(Object.keys(m.tables).sort(), ['AFTER_BLOCK', 'DEPTS', 'EMPS']);
  var e = m.tables.EMPS;
  eq(e.columns.map(function (c) { return [c.name, c.type, c.nullable, c.autoIncrement, c.default, !!c.generated]; }),
    [['EMP_ID', 'number', false, true, null, false], ['DEPT_ID', 'number(4)', true, false, null, false], ['EMAIL', 'varchar2(25)', false, false, null, false],
     ['HIRED', 'date', true, false, 'SYSDATE', false], ['BONUS', 'number', true, false, null, true]]);
  eq([m.tables.DEPTS.columns[1].type, m.tables.DEPTS.columns[1].nullable, e.columns[2].comment], ['varchar2(30)', false, 'Work address; not null']);
  eq([e.primaryKey, e.fks.map(function (f) { return f.columns + '>' + f.refTable + '(' + f.refColumns + ') ' + f.onDelete; })], [['EMP_ID'], ['DEPT_ID>DEPTS(DEPT_ID) SET NULL']]);
  // the primary key's own index is the key; the unique constraint's index is listed once
  eq(e.indexes.map(function (i) { return i.type + ':' + i.columns; }), ['UNIQUE:EMAIL']);
  eq([m.triggers.map(function (t) { return t.table + ':' + t.timing + ' ' + t.event; }), m.views.EMP_V.refs.slice().sort()], [['EMPS:BEFORE INSERT OR UPDATE'], ['DEPTS', 'EMPS']]);
});

test('SQL Server and Oracle get fixes in their own SQL', function () {
  var mk = function (sql) { var m = P.parse(sql); return M.fixScript(M.issues(M.build(m)).list, 'x', m.dialect); };
  var ms = mk('SET ANSI_NULLS ON\nGO\nCREATE TABLE [dbo].[users]([id] [int] NOT NULL, CONSTRAINT [PK_users] PRIMARY KEY CLUSTERED ([id] ASC))\nGO\n' +
    'CREATE TABLE [dbo].[orders]([id] [int] NOT NULL PRIMARY KEY, [users_id] [bigint] NOT NULL)\nGO\n' +
    'CREATE TABLE [dbo].[payments]([id] [int] NOT NULL PRIMARY KEY, [users_id] [int] NULL, CONSTRAINT [FK_pay_users] FOREIGN KEY ([users_id]) REFERENCES [dbo].[users] ([id]) ON DELETE CASCADE)\nGO\n' +
    'CREATE TABLE [dbo].[loose]([x] [int] NULL)\nGO\n');
  ok(/ALTER TABLE \[orders\] ALTER COLUMN \[users_id\] INT NOT NULL;/.test(ms), ms);
  ok(/REFERENCES \[users\] \(\[id\]\) ON DELETE NO ACTION;/.test(ms), ms);
  ok(/ALTER TABLE \[payments\] DROP CONSTRAINT \[FK_pay_users\];\nALTER TABLE \[payments\] ADD CONSTRAINT \[FK_pay_users\] FOREIGN KEY \(\[users_id\]\) REFERENCES \[users\] \(\[id\]\) ON DELETE NO ACTION;/.test(ms), ms);
  ok(/CREATE INDEX \[payments_users_id_index\] ON \[payments\] \(\[users_id\]\);/.test(ms) && /ADD \[id\] BIGINT IDENTITY\(1,1\) NOT NULL CONSTRAINT \[PK_loose\] PRIMARY KEY;/.test(ms), ms);
  // each fix is one transaction in its own batch: a refused statement undoes its fix only
  var fixes = (ms.match(/^-- \[/gm) || []).length;
  ok(/^SET XACT_ABORT ON;\nGO$/m.test(ms), ms);
  ok(fixes > 3 && (ms.match(/^BEGIN TRANSACTION;$/gm) || []).length === fixes && (ms.match(/^COMMIT;\nGO$/gm) || []).length === fixes, ms);
  var ora = mk('CREATE TABLE users (id NUMBER(10,0) PRIMARY KEY);\nCREATE TABLE orders (id NUMBER(10,0) PRIMARY KEY, users_id VARCHAR2(10) NOT NULL);\n' +
    'CREATE TABLE payments (id NUMBER(10,0) PRIMARY KEY, users_id NUMBER(10,0) REFERENCES users ON DELETE CASCADE);\n' +
    'CREATE TABLE notes (id NUMBER(10,0) PRIMARY KEY, orders_id NUMBER(12,0));\n');
  ok(/ALTER TABLE "ORDERS" MODIFY \("USERS_ID" NUMBER\(10,0\)\);/.test(ora), ora);
  // Oracle has no ON DELETE RESTRICT: the clause is left out
  ok(/REFERENCES "USERS" \("ID"\);/.test(ora) && !/RESTRICT;/.test(ora), ora);
  ok(/First drop the existing foreign key on \(USERS_ID\): Oracle named it/.test(ora) && /CREATE INDEX "PAYMENTS_USERS_ID_INDEX" ON "PAYMENTS" \("USERS_ID"\);/.test(ora), ora);
  // a larger column of the same type is enough for Oracle, which will not shrink one holding data; new names are upper case
  ok(!/MODIFY \("ORDERS_ID"/.test(ora) && /ADD CONSTRAINT "NOTES_ORDERS_ID_FOREIGN" FOREIGN KEY \("ORDERS_ID"\) REFERENCES "ORDERS"/.test(ora), ora);
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
