# Joinscope

**See how the tables in your database join, what one delete would really wipe, and what is wrong with it. One folder, works offline, nothing to install, nothing uploaded.**

[Live demo](https://mgadaphy.github.io/joinscope/) · [Download](https://github.com/mgadaphy/joinscope/releases/latest) · [User guide](docs/README.md)

![Spotlight on the orders table: the tables it points to on the left, the tables pointing to it on the right, every column explained, and what deleting one row would take with it](docs/images/spotlight.png)

## One click from losing 605 records

Joinscope started inside a school management system: 134 tables, 209 foreign keys, real schools using it every day. Before a cleanup, we drew the database to see what we were about to touch. The map showed something no one on the team knew.

**Deleting one entry from the "gender" dropdown would have erased 605 pupils and 50 staff members.** The foreign keys were set to `ON DELETE CASCADE`, so the database would have removed every person linked to that gender, then their payments, marks and enrolments through the next cascades. No warning, no undo, and it bypassed the archive feature built to prevent exactly this. Purging one staff account would likewise have deleted every payment that person had ever recorded.

Nobody wrote that on purpose. It came from years of migrations, framework defaults and copy-paste, and the code looked fine. Only the database told the truth, and only once someone could see it.

We fixed it. The tool we built to find it became Joinscope.

## Why another schema tool

Because the usual situation looks like this:

- **You inherited the database.** Or an AI wrote it for you. Either way there are 80 tables, half the links are `*_id` columns with no foreign key, and nobody can say what depends on what.
- **The ER diagram is spaghetti.** A wall of 100 boxes and crossing lines tells you nothing about the one table you care about.
- **"What happens if I delete this?"** has no quick answer, until it is too late.
- **The tools ask too much.** A server, Docker, Java, a database connection with a password, an account, or uploading your schema to someone else's cloud. Many companies forbid that last one, and they are right.

Joinscope is a web page that runs from your disk. You give it an export of your database structure; it never connects to your database and never sends anything anywhere. Switch your internet off and it still works.

## What it shows you

**The map.** Every table as a dot, coloured by area (people, sales, catalogue...), sized by how connected it is. Dashed lines are links your database does not protect.

**Spotlight** (picture above). One table in the middle with every column explained in plain words. What it points to on the left, what points to it on the right, wired column to column and coloured by what happens on delete.

**Delete impact.** Pick a table: see every table that loses rows, every column that gets emptied, every delete that will be refused.

![Delete impact for users: five tables lose rows](docs/images/impact.png)

**Health.** Problems found in the structure, each explained, with a query to check your data first and the exact SQL to fix it: money or history records wiped by cascades, links without a foreign key, columns of different types, missing primary keys and indexes, redundant indexes. **Download fix script** puts every fix in one file to review.

![Health on the Webshop sample: 14 problems found, tables with problems ringed on the map](docs/images/health.png)

**Compare.** Two exports side by side: production against staging, before against after a migration. Below, the Webshop sample against itself after running the fix script Joinscope wrote: 14 problems down to 1.

![Compare: the five tables the fixes changed are ringed on the map](docs/images/compare.png)

**Also:** the shortest join path between two tables with the ready `JOIN`, insights (most referenced tables, deletes that spread furthest, largest tables), ER mode, exports to PNG, Mermaid, Markdown, CSV and JSON, a command bar (`Ctrl+K`), and a full-screen mode for a projector.

## It works out what it is looking at

No setup needed. From table and column names alone, Joinscope recognises:

- **The framework:** Laravel, Django, Ruby on Rails, Prisma, Sequelize, Knex, TypeORM, Doctrine, Alembic, Flyway, Liquibase, WordPress, Strapi, Directus, Magento, Drupal, Moodle, Odoo. Their bookkeeping tables are grouped as "framework" and kept out of the problem list. For Laravel, each fix also comes as a migration line.
- **People tables** such as `users`, `customers`, `employees`, `patients`, so a cascade that would erase people is reported as high.
- **Areas** such as people, access, sales, catalogue, content, messaging, lookups and activity, used to colour the map when tables do not share a prefix.

A [profile](docs/profiles.md) can correct any of it for your project. See [automatic detection](docs/detection.md).

## Use it in one minute

1. [Download the latest release](https://github.com/mgadaphy/joinscope/releases/latest) (or **Code > Download ZIP**) and unzip it.
2. Double-click `index.html`.
3. Drop your database on the page: a dump, or a SQLite file.

```
mysqldump --no-data -u USER -p DATABASE > schema.sql        # MySQL, MariaDB
pg_dump --schema-only -U USER DATABASE > schema.sql         # PostgreSQL
```

A SQLite `.db` file is opened as it is, in your browser. No dump to hand? **Import > From a query** gives a read-only query to run in the console you already use (phpMyAdmin, pgAdmin, DBeaver, Supabase or Neon's SQL editor); paste its one-cell result. Dumps with data work too (rows are counted, never kept), plain or `.sql.gz`. More in [exporting your schema](docs/exporting-your-schema.md).

If the live demo does not open on your network (some networks block github.io), the download works the same.

## Who it is for

- **Developers** joining a project, reviewing a migration, or about to delete something.
- **People who built an app with AI help** and want to understand the database it made.
- **Tech leads and auditors** who need a picture of the risks, with fixes, in minutes.
- **Teachers and students** learning how relational databases fit together.

## Databases

| Database | Ways in |
|---|---|
| MySQL, MariaDB | Any dump or `SHOW CREATE TABLE` output, or the catalogue query |
| PostgreSQL, Supabase, Neon | `pg_dump` (schemas and partitions included), or the catalogue query |
| SQLite, D1, Turso | The database file itself, a `.schema` or `.dump`, or the catalogue query |
| SQL Server, Oracle | Planned |
| Anything else | Joinscope's own [JSON format](docs/schema-format.md): write an exporter, or a catalogue query, for your database |

Fixes are written in the loaded database's own SQL. Every way in is tested against real servers: the dump and the catalogue query of the same database must give the same picture ([tests](tests/run.js)).

The aim is every relational database, with nothing to install and no password ever given to Joinscope.

## Privacy

Joinscope is static HTML, CSS and JavaScript, with its libraries in `vendor/`. It loads nothing from the internet and sends nothing anywhere. Schemas you import are remembered only in your browser, and **Forget this imported schema** removes them. Read every line, or open it offline and see for yourself. More in [privacy](docs/privacy.md).

The health checks are rules applied to the structure, not an AI and not a guess about your data. Read every fix before you run it, and take a backup first.

## Roadmap

- A guided tour of an unfamiliar database, in plain words
- SQL Server and Oracle
- The whole tool in a single `.html` file, to email or put on a USB stick

## Contributing

Issues and pull requests are welcome, especially new databases, framework signatures and better plain-language descriptions. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits and licence

[MIT](LICENSE). Graphs by [Cytoscape.js](https://js.cytoscape.org/) with the fCoSE layout; bundled libraries keep their licences ([vendor/LICENSES.md](vendor/LICENSES.md)). SQLite files are read by [sql.js](https://github.com/sql-js/sql.js) (MIT). Samples: Webshop (written for Joinscope), [Chinook](https://github.com/lerocha/chinook-database) by Luis Rocha (MIT), Sakila by MySQL AB (BSD), [Pagila](https://github.com/devrimgunduz/pagila) by Devrim Gunduz (PostgreSQL licence).
