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
| `js/parser.js` | Reads SQL dumps into the schema model (MySQL and MariaDB today) |
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

Each database gets a parser that produces the same model as `js/parser.js`: tables with columns, primary key, indexes, foreign keys (with `ON DELETE`), views and triggers. Test it by loading the same schema from MySQL and from the new database: the map should be the same.

## Pull requests

- Keep changes focused, and describe what you tested.
- Never commit a real company's or person's schema, data, passwords or server addresses.
