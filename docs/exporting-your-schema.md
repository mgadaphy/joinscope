# Exporting your schema

Joinscope reads your database's structure in one of four ways. This page shows each, with the tools people use most.

Joinscope never connects to your database and never asks for a password. You make the export with your own tools, then give Joinscope the file or the text.

## Which databases work today

| Database | Ways in |
|---|---|
| MySQL, MariaDB | A dump (`mysqldump`, phpMyAdmin, HeidiSQL, Adminer, Workbench, `SHOW CREATE TABLE`), or the catalogue query |
| PostgreSQL (and Supabase, Neon) | A dump (`pg_dump`), or the catalogue query |
| SQLite (and D1, Turso) | The database file itself (`.sqlite`, `.db`), a `.schema` or `.dump`, or the catalogue query |
| SQL Server (and Azure SQL) | A script from SSMS (**Generate Scripts**), or the catalogue query |
| Oracle (and Autonomous Database) | A Data Pump SQL file, a DDL export (SQL Developer, `DBMS_METADATA`), or the catalogue query |
| Anything else | Joinscope's own JSON format ([schema format](schema-format.md)) |

The type of database is recognised from the file; the header of the page then names it, and the fixes in Health are written in that database's own SQL.

## The quickest way: one query

For a database you reach through a SQL console (phpMyAdmin, pgAdmin, DBeaver, psql, SSMS, SQL Developer, the SQL editor of Supabase, Neon or your host), open **Import**, then **From a query**:

1. Choose your database. Joinscope shows a read-only query: it reads the database's catalogue, never your data.
2. Copy it and run it in your console, on the database you want to see.
3. It returns one cell. Copy that cell, paste it into the box under the query, and press **Load what is pasted**.

The queries are in the [`queries/`](../queries) folder too. In phpMyAdmin the cell can be cut short on screen, and SSMS copies at most 65,535 characters of it: use a dump instead, or a command-line client (see [SQL Server](#sql-server) and [Oracle](#oracle) below).

## PostgreSQL: pg_dump

```
pg_dump --schema-only --no-owner -h HOST -U USER DATABASE > schema.sql
```

Leave out `--schema-only` to have the rows counted as well (the data is counted, never kept). Every schema in the dump is read; a table outside `public` keeps its schema in its name (`auth.users`). Partitions are shown as their parent table.

With Docker: `docker exec CONTAINER pg_dump -U USER --schema-only DATABASE > schema.sql`.

## SQLite: the file itself

Drop the `.sqlite` or `.db` file on Joinscope. SQLite itself runs inside the page to read it (the engine is in `vendor/`), every table's rows are counted, and nothing is uploaded. A file of a few hundred megabytes takes a moment, since the browser holds it in memory.

Or export the structure: `sqlite3 app.db .schema > schema.sql` (or `.dump` for structure and data).

## SQL Server

Every schema of the database is read. Tables in `dbo` keep their plain name; a table in another schema keeps it in its name (`sales.Promotions`).

**A script from SSMS** works as SSMS writes it:

1. In Object Explorer, right-click the database, then **Tasks > Generate Scripts**.
2. Choose **Script entire database and all database objects** (or pick the tables and views).
3. Under **Advanced**, keep **Types of data to script** on **Schema only**. **Schema and data** also works if you want row counts. Set **Script Triggers** to **True** to see triggers too.
4. Save to a single file, and press **Next** until it is done.

`GO` lines, `[bracketed names]`, `IDENTITY`, `CLUSTERED` keys, defaults, computed columns and descriptions (`MS_Description` extended properties) are all read. A computed column shows no type, since the script gives none; the catalogue query knows it.

**The catalogue query** ([`queries/sqlserver.sql`](../queries/sqlserver.sql), SQL Server 2016 or later, and Azure SQL) returns one cell. SSMS copies at most 65,535 characters of a cell, enough for a few dozen tables. For a bigger database, run it with `sqlcmd`, which prints all of it:

```
sqlcmd -S SERVER -d DATABASE -E -y 0 -f 65001 -i sqlserver.sql -o schema.json
```

`-E` signs in with your Windows account; use `-U USER` instead to be asked for a password. Then drop `schema.json` on Joinscope.

The fixes in Health are written in T-SQL. The script starts with `SET XACT_ABORT ON`, and each fix is one transaction in its own `GO` batch: if a statement is refused, its whole fix is undone (a foreign key dropped to be replaced comes back) and the next fix still runs. SQL Server will not change a column that an index, a key or a default uses: a plain index is dropped and made again around the change (without any `INCLUDE` columns or `CLUSTERED` it had, which the script reminds you of); a unique key, a filtered index, the primary key or a default is named in the script for you to drop first, and until then that fix is refused and undone. Where MySQL says `ON DELETE RESTRICT`, SQL Server says `NO ACTION`.

## Oracle

Joinscope reads one schema (one user's tables) at a time. When every name in the file carries the same owner (`"HR"."EMPLOYEES"`), the owner is left off; unquoted names are upper case, as Oracle stores them.

**The catalogue query** is the simplest. Log in as the schema's owner and run [`queries/oracle.sql`](../queries/oracle.sql) (Oracle 18c or later). It declares three small functions inside the query to read what Oracle keeps as `LONG` (defaults, index expressions, view texts); nothing is created in your database. In SQL Developer, double-click the cell to copy all of it. In SQL*Plus or SQLcl, run this first, so the whole result is printed, then the query, which ends with a `/` line:

```
SET LONG 100000000 LONGCHUNKSIZE 100000000 PAGESIZE 0 LINESIZE 32767 TRIMOUT OFF FEEDBACK OFF
```

A large schema comes out on several lines: copy them all, Joinscope joins them again. Row counts come from the optimizer statistics, so they are empty until statistics have been gathered.

**A Data Pump SQL file** holds the DDL of an export, without importing anything. If you already make Data Pump exports, write the file from one:

```
expdp USER@DB schemas=USER directory=DATA_PUMP_DIR dumpfile=app.dmp
impdp USER@DB directory=DATA_PUMP_DIR dumpfile=app.dmp sqlfile=schema.sql
```

`schema.sql` is written in the database server's `DATA_PUMP_DIR` folder. Your user needs read and write access to that directory object.

**A DDL export** from SQL Developer (**Tools > Database Export**, with **Export Data** unticked) or from `DBMS_METADATA` also works. This script, run in SQL*Plus or SQLcl as the schema's owner, writes one:

```
SET LONG 100000000 LONGCHUNKSIZE 100000000 PAGESIZE 0 LINESIZE 32767 TRIMSPOOL ON FEEDBACK OFF HEADING OFF
EXEC DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'SQLTERMINATOR', TRUE);
SPOOL schema.sql
SELECT DBMS_METADATA.GET_DDL(object_type, object_name) FROM user_objects
 WHERE object_type IN ('TABLE', 'VIEW', 'TRIGGER') AND object_name NOT LIKE 'BIN$%'
 ORDER BY DECODE(object_type, 'TABLE', 1, 'VIEW', 2, 3), object_name;
SELECT DBMS_METADATA.GET_DDL('INDEX', index_name) FROM user_indexes
 WHERE index_type <> 'LOB' AND index_name NOT LIKE 'BIN$%'
   AND index_name NOT IN (SELECT index_name FROM user_constraints WHERE index_name IS NOT NULL);
SELECT DBMS_METADATA.GET_DEPENDENT_DDL('COMMENT', table_name) FROM user_tables
 WHERE dropped = 'NO' AND table_name IN (SELECT table_name FROM user_tab_comments WHERE comments IS NOT NULL
                      UNION SELECT table_name FROM user_col_comments WHERE comments IS NOT NULL);
SPOOL OFF
```

Each statement must end with `;` (or `/` after PL/SQL), which is why the script turns `SQLTERMINATOR` on: DDL copied from a results grid without terminators reads as one long statement.

Oracle's own install scripts (`REM` and `PROMPT` lines, PL/SQL blocks ended by `/`) are read as they are.

The fixes in Health are written in Oracle's SQL: `MODIFY (...)`, identity columns for a missing primary key, and new names in upper case. Oracle has no `ON DELETE RESTRICT`; refusing the delete is what it does when the clause is left out, so it is. A column at least as large as the one it points at (`NUMBER(10)` pointing at `NUMBER(9)`, or `NUMBER` with no size) is not changed: Oracle accepts the foreign key as it is. A fix that would change a column to another type, or make it smaller, says that Oracle only does so while the column is empty.

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

You can also paste statements straight into the import dialog. Run `SHOW CREATE TABLE orders;` for each table in any SQL client, copy the `CREATE TABLE` text into the box under the drop zone, and press **Load what is pasted**. End each statement with a semicolon, otherwise several pasted tables run together and only the first is read.

## What Joinscope reads from the file

| Statement | What it takes |
|---|---|
| `CREATE TABLE` | Columns (type, `NULL` or `NOT NULL`, default, `AUTO_INCREMENT`, comment), primary key, unique, plain, fulltext and spatial indexes, foreign keys with their `ON DELETE` and `ON UPDATE` rules, and the table's engine, comment and next `AUTO_INCREMENT` value. `CREATE TABLE ... LIKE` copies another table's structure without its foreign keys. |
| `ALTER TABLE` | Added columns, indexes and foreign keys; `MODIFY` and `CHANGE` of a column; `DROP COLUMN`, `DROP INDEX` (or `DROP KEY`), `DROP PRIMARY KEY` and `DROP FOREIGN KEY`. This is how phpMyAdmin exports usually add keys. Table renames are not followed. |
| `CREATE INDEX` | The index on its table (PostgreSQL and SQLite write indexes this way). |
| `CREATE VIEW` | The view (materialized ones too), and the tables named after `FROM` and `JOIN` in it, comma joins and bracketed joins included. |
| `COMMENT ON` | PostgreSQL and Oracle comments on tables and columns. |
| `EXEC sp_addextendedproperty` | SQL Server descriptions (`MS_Description`) of tables and columns. |
| `CREATE TRIGGER` | The trigger, its timing, event and body. |
| `DROP TABLE`, `DROP VIEW` | Removes the table or view from what was read so far. |
| `INSERT`, `REPLACE`, PostgreSQL `COPY` | Only counted, then discarded. |

Everything else (`CHECK` constraints, functions and procedures, sequences, `SET` statements, `USE`, comments) is ignored. MySQL's `/*!40101 ... */` version comments are read as code, the way MySQL runs them, and `DELIMITER` changes are understood. PostgreSQL's `$$` function bodies, `E'...'` strings and psql lines such as `\connect`, and SQLite's `BEGIN ... END` trigger bodies (with any `CASE ... END` inside), are read as they are meant. PostgreSQL folds unquoted names to lower case, and so does Joinscope. PostgreSQL's `ALTER TABLE ONLY`, `ALTER COLUMN ... SET DEFAULT nextval(...)` and `ATTACH PARTITION` are followed. SQL Server's `GO` batches, statements without semicolons and procedure bodies, and Oracle's `/` after a PL/SQL block, SQL*Plus lines and `ALTER TABLE ... ADD ( ... )` lists, are read the same way. Oracle folds unquoted names to upper case, and so does Joinscope.

A primary key column is never empty, also when the key is added later by `ALTER TABLE` (SQLite, which allows it, is the exception).

A foreign key with `NO ACTION`, or with no `ON DELETE` clause at all, is treated as `RESTRICT`: the delete is refused either way (PostgreSQL only checks `NO ACTION` at the end of the statement, which makes no difference here).

A quoted text never counts as a keyword: a column comment that says "not null" does not make the column `NOT NULL`.

## Check the file before importing

Open the file in a text editor. Near the top you should see `CREATE TABLE` statements. If you only see `INSERT INTO`, the export was data only: export again with the structure included.

Next: [The map](the-map.md)
