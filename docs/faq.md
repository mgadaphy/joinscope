# FAQ and troubleshooting

## Importing

### My file is too big

Joinscope reads the whole file into your browser's memory. A structure-only export is tiny, but a dump with all the data can be gigabytes, and the browser may slow down, stop responding or run out of memory.

- Export the **structure only** (see [Exporting your schema](exporting-your-schema.md)). You lose only the row counts.
- Compressing the file (`.sql.gz`) makes the download smaller, but the browser still has to hold the unpacked text.

If Joinscope says "Loaded, but too big to remember after closing the page.", the schema works now but could not be saved in the browser's local storage. You will need to import it again next time. A structure-only export almost always fits.

### "No CREATE TABLE statements found. Export with structure included."

The file has no table definitions. Common causes:

- It is a **data-only** export (only `INSERT` statements). Export again with the structure included.
- It was saved as **UTF-16**, which happens with `mysqldump ... > file.sql` in Windows PowerShell. Use `mysqldump --result-file=schema.sql ...` instead.
- It is not a MySQL or MariaDB export.

### I dropped a file on the page and nothing happened

When a file is dropped outside the import dialog and cannot be read, the message is written inside the import dialog, which is closed. Press **Import .sql** and drop the file onto the dialog's drop zone to see the message.

### Can I import a `.zip`?

No. Unzip it first and import the `.sql` inside. `.sql.gz` (gzip) files are read directly.

### "This browser cannot open .gz files. Unzip it first."

Your browser is too old to unpack gzip by itself. Update it, or unpack the file (for example with `gunzip` or 7-Zip) and import the `.sql`.

### Parse warnings

After an import, the message at the bottom of the screen may say "with N warnings (see the bottom of Health)". The warnings are listed at the end of the **Health** tab, under **Parser warnings**. There are two kinds:

- **"Could not read foreign key on ..."**: a foreign key was written in a form the parser did not understand. That link is missing from the map and from every check. Look at the statement in your file. If it is unusual, `SHOW CREATE TABLE` for that table usually gives a cleaner version you can import instead.
- **"Rows found for ... but no CREATE TABLE statement."**: the file inserts into a table it never creates. The export is probably data only or incomplete.

### Does it read PostgreSQL, SQLite or SQL Server?

Not yet. Only MySQL and MariaDB work in this version. PostgreSQL and SQLite are in progress, and SQL Server and Oracle are planned. See the roadmap in the project README.

### My file replays a long history of `ALTER TABLE` statements

Joinscope works best with an export of the current structure, like `mysqldump` makes. It applies `ALTER TABLE ... ADD`, `MODIFY`, `CHANGE` and the `DROP` of a column, index, primary key or foreign key, but it does not follow table renames (`RENAME TABLE` or `ALTER TABLE ... RENAME`). A file built from many migrations may therefore show tables under their old names. Export the live database instead.

## The map

### Nothing shows, or the map is empty

Check these in order:

- **A focus is active.** If a bar at the top left says "Around ...", "Path: ..." or "Delete impact: ...", press **Show everything** or `Esc`.
- **Groups are hidden.** In the Explore tab, greyed-out groups in the legend are hidden. Click them to show them again. Changing **Colour by** shows all groups.
- **Only tables with no links.** Such tables are hidden at first. The status bar offers "Show the N tables with no links"; or tick **Show tables with no links**.
- **The Spotlight is open.** Press `Esc` to return to the map.
- **The map is off screen.** Press `F` or the fit button to bring everything back into view.
- **The folder is incomplete.** If even the samples do not appear, make sure `index.html` sits next to the `js`, `css`, `vendor` and `samples` folders. Copying `index.html` alone does not work.
- **JavaScript is blocked.** Some locked-down computers block scripts on pages opened from disk. Try another browser, or ask your administrator.

### My tables have no links, or few links

Joinscope draws a solid link only where the export has a foreign key. Many databases have none, or few:

- Tables using the **MyISAM** engine cannot have foreign keys at all. The details panel shows each table's engine.
- Many applications never declare foreign keys and keep the links in their code only.
- Some exports leave the keys out, or add them in `ALTER TABLE` statements at the end of the file. Joinscope reads those, so make sure the file is complete.

Turn on **Show guessed links** (it is on by default) to see dashed links for columns named like `customer_id` when a `customers` table exists. Columns named differently (`owner`, `parent`, `buyer_ref`) are not guessed. The [health checks](health-checks.md#links-without-a-foreign-key) list each guessed link with the SQL to make it a real foreign key.

### A guessed link is wrong

Guesses come from names only. If `country_id` is really an external code and not a link to `countries`, untick **Show guessed links** to hide all guesses, or accept that finding in a [profile](profiles.md) so it leaves the problem list.

### The map is a tangle

- Under **Hub tables**, choose a lower number (such as 10+), so more central tables hide their incoming links.
- Use **Group map** to see the areas of the app as separate boxes.
- [Focus](the-map.md#focus-on-a-table) on one table and its neighbours.
- Hide groups you are not interested in, or double-click one group to see only it.
- Increase **Spacing**, or press the **lay out again** button for a fresh arrangement.

### The colours and groups look odd

**Colour by: Domain** guesses areas from table names. If your names follow no pattern, try **Connected clusters**, which groups by links instead. See [automatic detection](detection.md) for how areas are found.

### Row counts are missing or wrong

Row counts come only from `INSERT ... VALUES` statements in the file. A structure-only export has none. A table with no `INSERT` in the dump shows no count at all, not zero. Each `(...)` group of values counts as one row.

### My view has no line to one of its tables

View links come from the table names right after `FROM` and `JOIN` in the view's SQL. In an old-style comma join (`FROM a, b`), only the first table is seen.

## Browsers and opening from disk

### Which browsers work?

Current versions of Chrome, Edge, Firefox and Safari. Very old versions may not unpack `.gz` files. Below 900 pixels wide (a phone or a narrow window), the panels slide over the map.

### Notes on opening from disk (`file://`)

Joinscope is made to run straight from your disk, with no web server. A few browser behaviours differ there:

- **Remembered schemas and settings** are kept per browser. Opening the same folder in another browser starts fresh.
- **The address bar** may not update with `#table=...` in some browsers. Nothing else depends on it.
- **Copy buttons** use the clipboard. If the browser refuses, Joinscope falls back to an older copy method, and says "Copy failed" if that fails too.
- **Full screen** may be refused by the browser. The panels are still hidden, and a message says to press `P` or `Esc` to bring them back.
- **The profile** (`profiles/profile.js`) is loaded from disk like the rest. If it is missing, nothing happens, which is normal.

You can also put the folder on any static web server, or open the live demo linked from the project README. It behaves the same.

### Is anything sent anywhere?

No. See [Privacy](privacy.md) for what is stored and how to check it yourself.

## Other questions

### Does Joinscope change my database?

No. It has no connection to your database. The fixes are SQL text for you to review and run yourself, after taking a backup.

### Can I remove the samples?

They are part of the folder and cannot be forgotten from the schema list. To drop one for good, delete its `<script src="samples/...">` line from `index.html`. Your own imports can be removed with **Forget this imported schema**.

### Why does the problems button count a finding I accepted?

Accepted findings leave the list, but one summary finding, "N findings reviewed and kept on purpose", names them with their reasons. That summary counts as one low finding. See [Profiles](profiles.md#accepting-findings).

### The descriptions in the Spotlight are wrong

When a column has no `COMMENT`, Joinscope writes a description from its name. Add `COMMENT` to your columns in the database and export again; comments always take priority. See [Spotlight](spotlight.md#the-middle-the-table-itself).

Next: [Back to the guide index](README.md)
