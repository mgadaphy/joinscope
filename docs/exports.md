# Exports

Joinscope can save what it shows as files you can share, print or put in your project's documentation. Everything is made in your browser and saved through your browser's normal download. Nothing is sent anywhere.

Open the **Export** menu in the top bar. Each file name starts with the name of the current schema, with spaces and punctuation replaced by `_`.

## Picture of the graph (PNG)

Saves the map as a PNG image, `<schema>-graph.png`.

- It includes the whole map as currently drawn, not just the part on screen: hidden groups, hidden hub links and tables outside the current focus are left out, and highlights and problem rings are kept.
- It is drawn at twice the screen resolution, up to 12,000 pixels on each side, so it stays sharp when printed.
- The background follows the theme. Switch to the light theme first for a printable picture.

The command bar's `png`, `picture` or `export` does the same.

## Mermaid ER diagram of what is shown

Saves a Markdown file, `<schema>-erd.md`, containing a Mermaid entity-relationship diagram of the tables and links currently on the map. Mermaid is a text format for diagrams that GitHub, GitLab and many documentation tools draw automatically. You can also paste it into the Mermaid live editor.

- The heading is the schema name, or the focus label (for example "Around orders") when you have focused on part of the map. Focus first to get a small, readable diagram.
- Each table lists its primary key and link columns only, with `PK` and `FK` marks.
- Each link shows its column. A link whose column can be empty starts with `|o` (zero or one), otherwise `||` (exactly one). A link whose column is unique ends with `o|` (one-to-one), otherwise `o{` (one-to-many). Guessed links are labelled "(guessed)".
- Views are left out.

For example, `orders`, `users` and `order_items` from Webshop give:

```
erDiagram
    orders {
        bigint id PK
        bigint user_id FK
    }
    users {
        bigint id PK
    }
    order_items {
        bigint id PK
        bigint order_id FK
    }
    orders ||--o{ order_items : "order_id"
    users ||--o{ orders : "user_id"
```

**Copy Mermaid** in a table's details panel copies a diagram of that table and its direct neighbours to the clipboard, ready to paste.

## Data dictionary (Markdown)

Saves `<schema>-data-dictionary.md`: one section per table with its comment (if any), its number of columns and rows, and a table of its columns:

| Column | Type | Null | Default | Key | References |
|---|---|---|---|---|---|
| `id` | bigint unsigned | no | | PK | |
| `user_id` | bigint unsigned | no | | FK | users.id on delete cascade |
| `address_id` | bigint unsigned | yes | NULL | FK | addresses.id (guessed) |
| `status` | varchar(20) | no | pending | | |

(This is Webshop's `orders`, shortened.)

**Key** can hold `PK`, `FK` and `UNIQUE` (a unique index on that column alone). Guessed links count as `FK` and are marked "(guessed)" in **References**. The last column, **Comment**, holds the column's `COMMENT` when it has one.

## Data dictionary (CSV, opens in Excel)

Saves `<schema>-data-dictionary.csv` with one row per column and these headings: `table`, `column`, `type`, `nullable`, `default`, `key`, `references`, `comment`. The file is UTF-8 with a byte-order mark, so Excel shows accented names correctly when you double-click it.

## Suggested fixes (SQL script)

Saves `<schema>-suggested-fixes.sql`, every fix from the health checks in one file. The same as **Download fix script** in the Health tab. See [Health checks](health-checks.md#the-fix-script), and review every line before running any of it.

## Parsed schema (JSON)

Saves `<schema>-schema.json`: everything Joinscope read from the export, as JSON. It holds:

- `tables`: for each table, its `columns` (name, type, nullable, default, auto increment, comment and so on), `primaryKey`, `indexes`, `fks` (with `onDelete` and `onUpdate`), `triggers`, `engine`, `comment`, `autoIncrement` and `rows`,
- `views`: each view's name, the tables it reads, and its SQL,
- `triggers`: each trigger's name, timing, event, table and body,
- `warnings`, and counts of statements and inserted rows.

Useful for scripts of your own, or to keep a record of the structure. It never contains your data rows.

## Copy buttons

Several places copy text to the clipboard instead of saving a file. A short message confirms the copy.

| Button | Where | What it copies |
|---|---|---|
| Copy SQL | Path tab | The `JOIN` query for the chosen route ([Path and joins](path-and-joins.md)) |
| Copy SELECT | Details panel, Spotlight | A `SELECT` with a `LEFT JOIN` to every parent table ([Path and joins](path-and-joins.md#copy-select)) |
| Copy Mermaid | Details panel | A Mermaid diagram of the table and its neighbours |
| Copy fix | Each health finding | The fix, with its check query above it as a comment ([Health checks](health-checks.md)) |

Next: [Command bar and keys](command-bar-and-keys.md)
