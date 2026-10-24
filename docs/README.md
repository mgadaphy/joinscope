# Joinscope user guide

Joinscope turns a database export into an interactive map. It shows every table, every link between tables, and the problems in the structure, with the SQL to fix them. It is a web page that runs from your disk: nothing to install, no account, and nothing is uploaded.

This guide explains every part of it. Today Joinscope reads MySQL and MariaDB exports. Other databases are on the roadmap (see [Exporting your schema](exporting-your-schema.md)).

## Pages

| Page | What it covers |
|---|---|
| [Getting started](getting-started.md) | Download, unzip, double-click, and a five-minute tour of the Webshop sample. |
| [Exporting your schema](exporting-your-schema.md) | How to get a structure export from MySQL or MariaDB with mysqldump, phpMyAdmin, HeidiSQL, Adminer, MySQL Workbench, a hosting panel or Docker. |
| [The map](the-map.md) | The graph of tables: layouts, colours, hub tables, guessed links, views, group map, ER mode, focus, and the details panel. |
| [Spotlight](spotlight.md) | One table in the middle with every column described, wired column to column to the tables around it. |
| [Path and joins](path-and-joins.md) | The shortest chain of links between two tables, alternative routes, and the ready-made `JOIN`. |
| [Delete impact](delete-impact.md) | What deleting one row really does: which tables lose rows, which get a column emptied, which block the delete. |
| [Health checks](health-checks.md) | Every problem Joinscope looks for, why it matters, how to read the check query and the fix, and the fix script. |
| [Insights](insights.md) | Counts and lists about the structure: most referenced tables, widest-reaching deletes, largest tables, parser warnings. |
| [Compare](compare.md) | What differs between two exports, as a list and on the map. |
| [Exports](exports.md) | PNG picture, Mermaid ER diagram, data dictionary (Markdown and CSV), fix script, parsed schema as JSON, and the copy buttons. |
| [Command bar and keys](command-bar-and-keys.md) | Every command the command bar (`Ctrl+K`) understands, links that open a view, and every keyboard and mouse shortcut. |
| [Automatic detection](detection.md) | How Joinscope recognises frameworks, people tables and areas of an application from table names alone. |
| [Profiles](profiles.md) | Optional project rules: people tables, findings accepted on purpose, framework. With worked examples. |
| [Privacy](privacy.md) | What is stored in your browser, what is never sent, and how to check it yourself offline. |
| [FAQ and troubleshooting](faq.md) | File too big, parse warnings, an empty map, missing links, browser support, opening from disk. |

Each page ends with a "Next:" link. The links follow the order of the table above, which is the full guide from start to end.

## Suggested reading order

### New to databases

You built an app (maybe with help from an AI assistant) and want to understand what its database looks like and whether anything is risky. Start with pictures, then move to the problems.

1. [Getting started](getting-started.md)
2. [The map](the-map.md)
3. [Spotlight](spotlight.md)
4. [Health checks](health-checks.md)
5. [Delete impact](delete-impact.md)
6. [Exporting your schema](exporting-your-schema.md), then load your own database
7. [Path and joins](path-and-joins.md)
8. [Privacy](privacy.md)
9. [FAQ and troubleshooting](faq.md)

Read the [words used in this guide](#words-used-in-this-guide) below first if terms like "foreign key" are new to you.

### I know SQL

You want the facts quickly: what is parsed, which rules fire, what the fix scripts contain.

1. [Getting started](getting-started.md) (skim the tour)
2. [Exporting your schema](exporting-your-schema.md) (what the parser reads and ignores)
3. [Health checks](health-checks.md) (every rule, its severity and its exact fix)
4. [Delete impact](delete-impact.md) and [Path and joins](path-and-joins.md)
5. [Compare](compare.md) and [Exports](exports.md)
6. [Command bar and keys](command-bar-and-keys.md)
7. [Automatic detection](detection.md) and [Profiles](profiles.md)
8. [Privacy](privacy.md) and [FAQ](faq.md)

## Words used in this guide

| Word | Meaning |
|---|---|
| Schema | The structure of a database: its tables, columns, keys and links. Not the data inside. |
| Table | A list of records of one kind, such as `orders`. Shown as a dot on the map. |
| Column | One field of a table, such as `orders.total`. |
| Row | One record in a table. |
| Primary key | The column (or columns) that uniquely identifies each row, usually `id`. |
| Foreign key | A rule in the database saying "this column holds the primary key of a row in that other table". `orders.user_id` pointing to `users.id` is one. The database then refuses values that point to nothing. |
| Guessed link | A column that looks like a link, such as `product_id`, but has no foreign key. Joinscope draws it dashed. |
| `ON DELETE` rule | What the database does to linked rows when the row they point to is deleted: `CASCADE` (delete them too), `SET NULL` (empty the link), or `RESTRICT` (refuse the delete). |
| Index | A lookup structure that lets the database find rows by a column without reading the whole table. |
| View | A saved query that behaves like a read-only table. |
| Dump or export | A `.sql` file that contains the statements to rebuild a database, such as `CREATE TABLE`. |
| Join | Combining rows from two tables in one query by matching a link column, for example `orders.user_id = users.id`. |

Next: [Getting started](getting-started.md)
