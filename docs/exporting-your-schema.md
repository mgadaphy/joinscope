# Exporting your schema

Joinscope reads a database export: a `.sql` file full of statements such as `CREATE TABLE`. This page shows how to get one from MySQL or MariaDB with the tools people use most.

Joinscope never connects to your database and never asks for a password. You make the export with your own tools, then give Joinscope the file.

## Which databases work today

| Database | Status |
|---|---|
| MySQL, MariaDB | Works today, from any dump or `SHOW CREATE TABLE` output |
| PostgreSQL | In progress, not available yet |
| SQLite | In progress, not available yet |
| SQL Server, Oracle | Planned |
| Others with a catalogue | Planned: one read-only query whose result you paste in |

Only MySQL and MariaDB are supported in this version. A PostgreSQL, SQLite or SQL Server file may load partly or not at all, and what you see would not be reliable. Watch the project README roadmap for news.

## Structure only, or with data?

A dump can hold just the structure (the `CREATE TABLE` statements) or the structure plus every row (`INSERT` statements).

| | Structure only | With data |
|---|---|---|
| Size | Small, usually kilobytes | Can be gigabytes |
| What Joinscope shows | Everything except row counts | Everything, plus a row count for each table that has `INSERT` statements |
| Speed | Instant | Slower to read, and very large files can exhaust the browser's memory |
| Remembered after closing the page | Usually | Only the structure is remembered; the rows are never kept |

**Use structure only** unless you want row counts. Row counts help with the "Largest tables" list and show up on the map, but nothing else needs them.

With data, Joinscope counts the rows in each `INSERT` and then throws the statement away. It never keeps or shows your data. The whole file is still read into your browser's memory while it is processed, so a structure-only export is kinder on large databases.

## Compressed files

`.sql.gz` files (gzip) are fine. Joinscope unpacks them in the browser. `.zip` files are not read: unzip them first and import the `.sql` inside.

## mysqldump (command line)

`mysqldump` comes with MySQL. On MariaDB the same tool is called `mariadb-dump` (older versions also install it as `mysqldump`). The options are the same.

Structure only:

```
mysqldump --no-data -u USER -p DATABASE > schema.sql
```

Replace `USER` with your database user and `DATABASE` with the database name. `-p` makes it ask for the password. For a database on another machine, add `-h HOST` and, if needed, `-P PORT`.

On Windows, prefer `--result-file` over `>`. In Windows PowerShell, `>` writes the file as UTF-16, which Joinscope cannot read (it reports "No CREATE TABLE statements found").

```
mysqldump --no-data -u USER -p --result-file=schema.sql DATABASE
```

Compressed, on Linux or macOS:

```
mysqldump --no-data -u USER -p DATABASE | gzip > schema.sql.gz
```

With data (for row counts), simply leave out `--no-data`. Triggers are included by default; Joinscope reads them and shows them in the details panel.

Export one database per file. Joinscope drops database names from table names (`shop.orders` becomes `orders`), so two databases with a table of the same name in one file would collide.

## phpMyAdmin

1. Select your database in the list on the left.
2. Open the **Export** tab.
3. Choose the **Custom** export method so you can see all the options.
4. Keep the format as **SQL**.
5. In the format-specific options, choose to dump the **structure** only. "Structure and data" also works if you want row counts.
6. Optionally choose gzip compression.
7. Press **Export** (or **Go**) and save the file.

The labels move a little between phpMyAdmin versions, but the choices are the same.

## HeidiSQL

1. Right-click the database in the tree and choose **Export database as SQL** (also in the **Tools** menu).
2. Tick the database and its tables.
3. Under **Create**, tick the tables option.
4. Set **Data** to **No data**, or to an insert option if you want row counts.
5. Set **Output** to a single `.sql` file and choose where to save it.
6. Press **Export**.

## Adminer

1. Log in and select the database.
2. Click **Export**.
3. Set **Output** to save, and **Format** to SQL.
4. For **Tables**, choose `CREATE` (or `DROP+CREATE`).
5. For **Data**, choose nothing to get structure only, or an `INSERT` option for row counts.
6. Press **Export**.

## MySQL Workbench

1. Connect to your server and open **Server > Data Export**.
2. Tick the schema you want.
3. In the drop-down, choose **Dump Structure Only** (or **Dump Structure and Data**).
4. Choose **Export to Self-Contained File** and pick a file name.
5. Press **Start Export**.

## Hosting panels (cPanel and similar)

Most shared hosting panels include phpMyAdmin.

1. In the panel, open **phpMyAdmin** from the Databases section.
2. Follow the [phpMyAdmin steps](#phpmyadmin) above.

Some panels also offer a database backup download, which usually gives a `.sql.gz` file with data. That works too: Joinscope reads the structure and counts the rows.

## Docker

If MySQL or MariaDB runs in a container, run the dump inside it and write the file outside it. Use the official images' environment variable so the password is not typed on the command line:

```
docker exec CONTAINER sh -c 'exec mysqldump --no-data -u root -p"$MYSQL_ROOT_PASSWORD" DATABASE' > schema.sql
```

Replace `CONTAINER` with the container name and `DATABASE` with the database. For a MariaDB image, use `mariadb-dump` and `$MARIADB_ROOT_PASSWORD`. With Docker Compose, `docker compose exec -T SERVICE ...` works the same way.

## `SHOW CREATE TABLE` output

You can also paste statements straight into the import dialog. Run `SHOW CREATE TABLE orders;` for each table in any SQL client, copy the `CREATE TABLE` text into the box under the drop zone, and press **Load pasted SQL**. End each statement with a semicolon, otherwise several pasted tables run together and only the first is read.

## What Joinscope reads from the file

| Statement | What it takes |
|---|---|
| `CREATE TABLE` | Columns (type, `NULL` or `NOT NULL`, default, `AUTO_INCREMENT`, comment), primary key, unique, plain, fulltext and spatial indexes, foreign keys with their `ON DELETE` and `ON UPDATE` rules, and the table's engine, comment and next `AUTO_INCREMENT` value. `CREATE TABLE ... LIKE` copies another table's structure without its foreign keys. |
| `ALTER TABLE` | Added columns, indexes and foreign keys; `MODIFY` and `CHANGE` of a column; `DROP COLUMN`, `DROP INDEX` (or `DROP KEY`), `DROP PRIMARY KEY` and `DROP FOREIGN KEY`. This is how phpMyAdmin exports usually add keys. Table renames are not followed. |
| `CREATE VIEW` | The view, and the tables named after `FROM` and `JOIN` in it. |
| `CREATE TRIGGER` | The trigger, its timing, event and body. |
| `DROP TABLE`, `DROP VIEW` | Removes the table or view from what was read so far. |
| `INSERT`, `REPLACE` | Only counted, then discarded. |

Everything else (`CHECK` constraints, stored procedures, `SET` statements, `USE`, comments) is ignored. MySQL's `/*!40101 ... */` version comments are read as code, the way MySQL runs them, and `DELIMITER` changes are understood.

A foreign key with `NO ACTION`, or with no `ON DELETE` clause at all, is treated as `RESTRICT`, because MySQL and MariaDB behave the same way for both.

## Check the file before importing

Open the file in a text editor. Near the top you should see `CREATE TABLE` statements. If you only see `INSERT INTO`, the export was data only: export again with the structure included.

Next: [The map](the-map.md)
