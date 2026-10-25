# Contributing to Joinscope

Thank you for helping. A few rules keep Joinscope what it is.

## The three rules

1. **Offline.** No request to any server, ever: no CDN, no fonts from the web, no analytics. Libraries go in `vendor/` with their licence listed in `vendor/LICENSES.md`.
2. **Nothing to install for users.** Opening `index.html` from disk must work in a current Chrome, Edge, Firefox or Safari. No build step is needed to run it. Plain JavaScript, no framework.
3. **It reads the database, not the code.** Everything comes from the schema the user gives it.

## Layout

| Path | What it holds |
|---|---|
| `index.html` | The page and its styles |
| `js/parser.js` | Reads SQL dumps into the schema model: MySQL and MariaDB, PostgreSQL, SQLite (the dialect is detected) |
| `js/schema-json.js` | Joinscope's JSON formats: the schema format and catalogue query results ([docs/schema-format.md](docs/schema-format.md)) |
| `js/sqlite-file.js` | Opens a SQLite file in the page with sql.js |
| `queries/` | One read-only catalogue query per database; `js/queries.js` is made from them by `node tools/build-queries.js` |
| `tests/` | `node tests/run.js`, with fixtures made from real servers |
| `js/schema-model.js` | Relations, groups, paths, delete impact, insights, health checks, diff, exports, plain-language descriptions |
| `js/app.js` | Graph, panels, command bar |
| `js/spotlight.js`, `css/spotlight.css` | Table Spotlight |
| `samples/` | Demo schemas; sources in `samples/src/` |
| `profiles/` | Optional per-project rules |
| `tools/` | Maintainer scripts (Node), never needed by users |

## Adding a sample

```
node tools/make-sample.js path/to/dump.sql myid "My sample: what it is"
```

Then add `<script src="samples/myid.js"></script>` to `index.html`. Only public schemas with a licence that allows redistribution, and say where they come from in the README.

## Adding a database

The quickest way is a catalogue query: one read-only `SELECT` that returns the [catalogue format](docs/schema-format.md#2-a-catalogue-querys-result-joinscope-catalogue) in a single cell. Put it in `queries/`, run `node tools/build-queries.js`, and add it to the list in the import dialog (`index.html`).

Then prove it: on a real server, load a known schema (Sakila, Pagila or Chinook all exist for many databases), save a dump and the query's result in `tests/fixtures/`, and add a test that both give the same picture (see the existing ones in `tests/run.js`). A dump parser for the new SQL dialect can follow in `js/parser.js`.

## Tests

```
node tests/run.js
```

Plain Node, nothing to install. Run them before every pull request. Also open `index.html` and load each sample: the page must show no error.

## Pull requests

- Keep changes focused, and describe what you tested.
- Never commit a real company's or person's schema, data, passwords or server addresses.
