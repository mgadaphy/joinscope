# Changelog

## 0.4.0 (October 2026)

- **SQL Server:** scripts as SSMS writes them (**Generate Scripts**): `GO` batches, statements without semicolons, `[bracketed names]`, `IDENTITY`, `CLUSTERED` keys, `DEFAULT ... FOR`, computed columns, filtered indexes, T-SQL triggers and procedure bodies, descriptions from `sp_addextendedproperty`. Every schema is read (`sales.Promotions`); `dbo` is left off.
- **Oracle:** Data Pump SQL files, `DBMS_METADATA` and SQL Developer DDL, and Oracle's own install scripts: SQL*Plus lines, PL/SQL blocks ended by `/`, `ADD ( ... )` constraint lists, `REFERENCES` without columns, identity and virtual columns, function-based and bitmap indexes. Names are upper case, as Oracle folds them, and a single owner is left off.
- **Catalogue queries** for SQL Server 2016+ / Azure SQL and Oracle 18c+. Each was run on a real server (SQL Server 2022, Oracle 23ai) and gives the same picture as that server's own script of the database. A long Oracle result printed by SQL*Plus over several lines is joined again.
- **Fixes in T-SQL and Oracle SQL:** `NO ACTION` for SQL Server where MySQL says `RESTRICT` (Oracle has no clause for it), `ALTER COLUMN` / `MODIFY (...)`, identity primary keys. Each T-SQL fix is one transaction in its own `GO` batch (with `XACT_ABORT`), so a refused statement undoes its fix and the next fix still runs. Plain indexes on a column that must change are dropped and made again around it; a unique key, filtered index or default in the way is named in the script. Oracle's fixes leave a column alone when it is at least as large as the one it points at, and say when a change needs an empty column. Fix scripts were run on both servers and clear their findings.
- Dialect detection looks at the code only: a comment or a text that mentions `NUMBER(10)` or `IDENTITY(1,1)` no longer makes a MySQL dump read as Oracle or SQL Server.
- **New samples:** Northwind (SQL Server) and HR (Oracle), both MIT.
- Links are guessed whatever the case: `EMPLOYEE_ID` finds `EMPLOYEES`, `CustomerID` finds `Customers`.
- A primary key added by `ALTER TABLE` makes its columns NOT NULL. `decimal(5, 2)` is read as `decimal(5,2)`. A trigger's event is `UPDATE` whether or not it names columns (`UPDATE OF ...`).

## 0.3.0 (October 2026)

- **PostgreSQL:** `pg_dump` files, with or without data: every schema (a table outside `public` keeps its schema name), partitions shown as their parent with their keys, `ALTER TABLE ONLY`, `CREATE INDEX`, `COMMENT ON`, identity and serial columns, multi-word types, `$$` function bodies, `COPY` rows counted.
- **SQLite:** drop the `.sqlite` or `.db` file and it is opened in the page (sql.js, bundled; nothing uploaded), rows counted. `.schema` and `.dump` text too: bracketed names, trigger bodies, `REFERENCES` without columns, row-id keys.
- **Catalogue queries** for MySQL / MariaDB, PostgreSQL and SQLite (**Import > From a query**): one read-only query, one cell to paste. Each is tested against a dump of the same database on a real server.
- **Joinscope's JSON format** ([docs/schema-format.md](docs/schema-format.md)): **Export > Schema as JSON** writes it, and it imports again; any database can produce it.
- **Fixes in the loaded database's own SQL:** PostgreSQL gets `ALTER COLUMN ... TYPE`, `DROP CONSTRAINT`, identity keys and an index for every foreign key (PostgreSQL does not make one); SQLite gets the table rebuild it needs where it cannot alter a table. Fix scripts were run on MariaDB and PostgreSQL 18 and clear their findings.
- A column comment saying "not null" no longer makes the column NOT NULL (found comparing a real dump with its catalogue).
- Tests: `node tests/run.js`.

## 0.2.1 (October 2026)

- Views that join tables with commas (`FROM a, b AS x, c`, also mixed with `JOIN`) now link to every table, not only the first.
- The differences map in Compare shows tables with no links without changing your **Show tables with no links** setting.
- "Show the table with no links" when there is only one.

## 0.2.0 (October 2026)

- **Automatic detection:** 18 frameworks recognised from their own tables (Laravel, Django, Rails, Prisma, WordPress and more); their bookkeeping tables grouped and kept out of the problem list; people tables found by name; tables grouped by area (people, sales, catalogue...) when they do not share a prefix. Shown under Health > Detected.
- **Fix scripts that run:** a missing foreign key between columns of different types now changes the column first (MySQL refuses the key otherwise), and no duplicate index is added next to a new foreign key.
- `ALTER TABLE ... DROP INDEX` and `DROP PRIMARY KEY` are read.
- New sample: Webshop after the fixes, to see Compare at work.
- Links that open a view: `#view=health`, `#view=impact&table=...`, `#view=path&from=...&to=...`, `#view=compare&a=...&b=...`.
- User guide in `docs/`.

## 0.1.0 (October 2026)

First public version.

- MySQL and MariaDB dumps: map, Spotlight, delete impact, path finder, health checks with fix scripts, insights, compare, exports.
- Samples: Webshop, Chinook, Sakila.
- Optional project profiles.
