# Changelog

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
