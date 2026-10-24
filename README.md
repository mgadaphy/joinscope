# Joinscope

**See how the tables in your database join, and what is wrong with them. One folder, works offline, nothing to install, nothing uploaded.**

Joinscope turns a database export into an interactive map. You can see every table and every link, step into a single table to read what each column is for, and find out what one `DELETE` would really wipe. It also lists the problems in your schema and gives the SQL to fix each one.

It is a web page that runs from your disk. There is no server, no account, no Docker, no Node and no browser extension. Switch your internet off and it still works.

**[Try the live demo](https://mgadaphy.github.io/joinscope/)**: it opens on a sample shop database with deliberate mistakes.

## Use it in one minute

1. Download the [latest release](https://github.com/mgadaphy/joinscope/releases) (or **Code > Download ZIP**) and unzip it.
2. Double-click `index.html`.
3. Drop your database export on the page.

To get an export from MySQL or MariaDB, structure only:

```
mysqldump --no-data -u USER -p DATABASE > schema.sql
```

phpMyAdmin (Export, SQL), HeidiSQL and Adminer exports work too, with or without data. With data, rows are counted, never kept. `.sql.gz` files are fine.

Your file is read by your browser and stays on your machine. Joinscope makes no network requests.

## What you get

| | |
|---|---|
| **Map** | Every table as a dot, sized by how connected it is and coloured by area. Arrows go from the table holding the foreign key to the table it points to. Tables used by almost everything have their links hidden so the picture stays readable. |
| **Guessed links** | `*_id` columns with no foreign key are drawn dashed when the target table can be found by name. These are the links your database does not protect. |
| **Spotlight** | Double-click a table: every column with a plain-language description, the tables it points to on the left, the tables pointing to it on the right, wired column to column and coloured by delete rule. |
| **Delete impact** | What deleting one row does: which tables lose rows (cascade), which get a column emptied (set null), which block the delete (restrict). |
| **Path** | The shortest chain of links between two tables, alternatives, and the ready-made `JOIN`. |
| **Health** | Problems found in the structure, each explained, with a query to check your data first and the SQL fix: money or history records wiped by cascades, links without a foreign key, missing indexes, missing primary keys, type mismatches, redundant indexes. **Download fix script** collects every fix in one file to review. |
| **Insights** | Most referenced tables, deletes that spread furthest, largest and empty tables, polymorphic columns. |
| **Compare** | What differs between two exports: tables, columns, types and foreign keys. Production against staging, before against after a migration. |
| **Export** | PNG, Mermaid ER diagram, data dictionary as Markdown or CSV, the parsed schema as JSON. |
| **Also** | ER mode with columns, group map, focus on a table's neighbours, command bar (`Ctrl+K`), full screen for a projector, light, dark and HUD themes. |

The health checks are rules applied to the structure, not an AI, and not a guess about your data. Read every fix before you run it, and take a backup first.

## Databases

| Database | Status |
|---|---|
| MySQL, MariaDB | Works today, from any dump or `SHOW CREATE TABLE` output |
| PostgreSQL | In progress: `pg_dump --schema-only` and a catalogue query |
| SQLite | In progress: open the `.sqlite` / `.db` file directly, or a `.schema` dump |
| SQL Server, Oracle | Planned: scripted schemas and a catalogue query |
| Anything else with a catalogue | Planned: one read-only query you run in the tool you already use (pgAdmin, DBeaver, SSMS, your host's SQL editor), whose JSON result you paste in |

The aim is every relational database, with nothing to install and no password ever given to Joinscope. See the [roadmap](#roadmap).

## Samples in the demo

- **Webshop**: a small shop written for Joinscope, with the mistakes real apps tend to have. Open **Health**.
- **Chinook**: a digital music store, by Luis Rocha ([MIT](https://github.com/lerocha/chinook-database)).
- **Sakila**: a DVD rental shop, by MySQL AB (BSD licence, notice kept in the sample).

## Keyboard

`Ctrl+K` command bar, `/` search, `P` full screen, `F` fit, `Esc` close or clear, in Spotlight `+` `-` `0` `1` zoom and `Backspace` back.

## Privacy

Joinscope is static files: HTML, CSS and JavaScript, with its libraries in `vendor/`. It loads nothing from the internet and sends nothing anywhere. Schemas you import are remembered only in your browser's local storage, and **Forget this imported schema** removes them. You can read every line, and you can check it by opening it offline.

## Project rules (optional)

A profile can tell Joinscope about one project: which tables hold people, which findings are accepted on purpose, which tables are empty by design. See [profiles/README.md](profiles/README.md). Without one, sensible general rules apply.

## Roadmap

- PostgreSQL and SQLite (open the database file in the browser)
- A catalogue query for each database, giving one JSON format any database can produce
- Fixes written in the loaded database's own SQL
- A guided tour of an unfamiliar database, in plain words
- SQL Server and Oracle scripts
- One-file build: the whole tool in a single `.html` to email or put on a USB stick

## Contributing

Issues and pull requests are welcome, especially new databases and better plain-language descriptions. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[MIT](LICENSE). Bundled libraries keep their own licences, listed in [vendor/LICENSES.md](vendor/LICENSES.md).
