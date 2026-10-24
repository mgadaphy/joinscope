# The map

The map is the big picture of your database. Every table is a dot and every link between tables is an arrow. This page explains what you see and every option in the **Explore** tab.

![The map](images/map.png)

## Reading the map

### Tables

Each dot is a table. Its size grows with the number of links it has, so the tables everything depends on stand out. Its colour shows its group (see [Colour by](#colour-by)).

Hover over a table to see a small card with its name, group, number of columns, row count (if the export had data), and how many tables it uses and is used by.

### Arrows

An arrow goes **from the table that holds the link to the table it points to**. In Webshop, `orders.user_id` holds the ID of a user, so the arrow goes from `orders` to `users`.

| Line | Meaning |
|---|---|
| Solid arrow | A real foreign key. A foreign key is a rule in the database: the column must hold the ID of an existing row in the other table. |
| Dashed arrow | A guessed link: a column that looks like a link (it ends in `_id` and a table with a matching name exists) but has no foreign key. The database does not protect it. |
| Dotted line, no arrow head | A view reading from a table (only when views are shown). |

Hover over an arrow to see its column name. Links with a delete rule other than restrict also show it, for example `user_id  on delete cascade`. Click an arrow to see the full link at the bottom of the screen, for example `orders.user_id -> users.id  on delete cascade` or `orders.address_id -> addresses.id (guessed, no foreign key)`.

### Selecting a table

Click a table to select it. It gets a thick border, its neighbours and links stay bright, and the rest fades. If it has 12 links or fewer, their column names are shown. The [details panel](#the-details-panel) opens on the right.

Click an empty spot, or press `Esc`, to clear the selection. Double-click a table to open its [Spotlight](spotlight.md).

### Moving around

- Scroll to zoom, drag the background to move, drag a table to move it.
- The buttons at the bottom right: **+** zoom in, **&minus;** zoom out, **fit** (also `F`), **lay out again**, and **full screen** (also `P`).
- **Lay out again** with the Organic layout gives a different arrangement each time, which sometimes untangles a busy area.

### The status bar

At the bottom left, for example: "Showing 10 of 11 tables, 12 links. Show the 1 tables with no links. Click a table for details, double-click for its Spotlight." It also says when the links of hub tables are hidden.

## The Explore tab

All the settings below are remembered in your browser for next time.

### Layout

| Layout | How tables are placed |
|---|---|
| Organic (force) | Linked tables pull together and unlinked ones push apart. Good for most schemas. This is the default. |
| Rings by connections | The most connected tables in the middle, the least connected on the outside. |
| Tree (parents on top) | Tables that are pointed to but point to nothing (such as `users` or `countries`) at the top, the tables that depend on them below. |
| Grid by group | A tidy grid, sorted by group, then by name. |
| Circle | One circle, sorted by group. |

### Colour by

| Choice | How groups are made |
|---|---|
| Domain (from table names) | Groups by meaning, read from table names: framework tables, a name prefix shared by several tables, or a common area of an application such as people, sales, catalogue, content, messaging, lookups or activity. A table that fits nowhere joins the group it links to most, or **other**. See [automatic detection](detection.md) for the exact rules. |
| Connected clusters | Groups tables that are closely linked to each other, whatever their names. Each cluster is named after its best-connected table, for example "orders cluster". Links to hub tables are ignored so that one central table does not swallow everything. A table with no links is in **no links**. |
| Nothing | Every table in one grey colour. |

In Webshop, **Domain** gives these groups: sales (`orders`, `order_items`, `payments`, `coupon_redemptions`), people (`users`, `addresses`), catalogue (`products`, `categories`), lookups (`countries`, `settings`) and content (`reviews`). **Connected clusters** gives "orders cluster" (7 tables), "products cluster" (`products`, `categories`, `reviews`) and "no links" (`settings`).

The groups **other**, **no links**, **views** and **all tables** are always grey.

### Hub tables

Some tables are linked from almost everywhere: a `users` table in a big app may have 80 tables pointing to it. Drawing all those arrows hides everything else. So when a table has at least the chosen number of links **pointing to it**, those links are hidden and the table gets a double border and a label such as `users  (34 links hidden)`.

| Choice | Effect |
|---|---|
| Hide links of tables with 10+ / 15+ / 20+ / 30+ links | Hides the incoming links of tables that reach that number. 20 is the default. |
| Show every link | Never hides anything. |

When hub tables exist, they are listed under the options as chips with their link counts. Click a chip to show that hub's links again, and click it again to hide them. Webshop is small and has no hub tables.

Hub links are always shown when you [focus](#focus-on-a-table) on a table.

### Spacing

A slider from 60% to 300%. Higher spreads the tables out, lower packs them tight. The map is laid out again when you let go of the slider.

### Effects

Moving links on the highlighted arrows, a gentle glow pulsing on the selected table, and a short zoom-in animation after each layout. It is on by default, unless your computer is set to reduce motion. The **Effects** button in the top bar does the same.

### Mark tables that have problems

Puts a ring around every table with a [health check](health-checks.md) finding: red if any is high, amber if the worst is medium, grey if all are low. The label gains the number of findings, for example `orders  ! 3`. The **Mark problems on the map** button in the Health tab and the problems button in the top bar turn the same option on.

### Show guessed links

Draws the dashed guessed links. On by default. Turning it off leaves only real foreign keys, which shows what your database actually enforces. In Webshop, turning it off removes 5 of the 12 links and leaves `countries` with no links at all.

How a link is guessed: a column ending in `_id` that is not the primary key and is not already part of a foreign key. Joinscope looks for a table named like the start of the column, in plural or singular: `product_id` finds `products`, `category_id` finds `categories`, `address_id` finds `addresses`. `parent_id` points to its own table. If nothing matches, it tries again without the first word, so `billing_address_id` finds `addresses`. A column with a matching `_type` column next to it (such as `commentable_id` and `commentable_type`) is a polymorphic link and is not guessed.

### Show views

Shows each view as a diamond, with a dotted line to every table it reads. On by default. Webshop has no views; the Sakila sample has several.

### Group map (one box per group)

Puts the tables of each group in a dashed box, and packs the boxes in rows like a map of districts. Useful on large schemas to see the areas of an application at a glance. Double-click a box to show only that group.

It needs **Colour by** set to Domain or Connected clusters, and it is not used while you focus on a table.

### ER diagram mode (show columns)

Draws each table as a box listing its columns instead of a dot, like a classic entity-relationship diagram. The box heading has the table name and its row count when known. Each column line is marked:

| Mark | Meaning |
|---|---|
| `#` | Part of the primary key |
| `>` | A foreign key |
| `~` | A guessed link (only when guessed links are shown) |
| `?` after the type | The column can be empty (it allows `NULL`) |

Types are shortened (no display width, no `unsigned`). A box lists at most 40 columns and then says how many more there are.

When ER mode is on, a **Columns** choice appears: **Keys only** (primary key and link columns, the default) or **All columns**.

### Show tables with no links

Tables that link to nothing and that nothing links to are hidden at first, because they add clutter. Tick this to show them. The link in the status bar does the same. In Webshop, this is `settings`.

### Groups legend

Under the options is the list of groups with their colour and number of tables.

- Click a group to hide or show its tables.
- Double-click a group to show only that group. Double-click it again to show all groups.

Changing **Colour by** or **Hub tables** shows all groups again.

## Search

The search box in the top bar finds tables and columns as you type. Tables come first (names starting with your text before names containing it), then columns as `table.column` with their type. Use the arrow keys and `Enter`, or click a result. The map moves to that table and selects it. If the table was hidden (in a hidden group, or outside the current focus), Joinscope shows it with its neighbours.

## Focus on a table

When a schema is large, look at one table and its surroundings only.

- In the details panel, press **Neighbours** (tables one link away) or **2 steps** (two links away).
- A bar appears at the top left of the map, for example "Around orders", with **steps: 1 2 3** to widen or narrow the circle, and **Show everything** to leave.
- `Esc` also leaves focus (after clearing any selection).

The focus does not travel through hub tables. If `users` is a hub, focusing on `orders` includes `users` but not every table that points to `users`. Focusing on `users` itself does include its own neighbours.

With the Organic layout, the focused table sits in the middle with each step in a ring around it.

[Path](path-and-joins.md) and [Delete impact](delete-impact.md) also use the focus bar, with their own label.

## Full screen

**Full screen** in the top bar, the last zoom button, or `P` hides the top bar and side panel, and asks the browser to go full screen. A small bar at the top offers **Ask** (`Ctrl K`) and **Exit full screen**. The details panel floats over the map when you click a table. Press `P` or `Esc` to come back. If the browser refuses to go full screen, the panels are still hidden and a message says so.

## Themes

The &#9680; button cycles through light, dark and HUD (a dark blue "head-up display" look). Until you choose, Joinscope follows your system's light or dark setting. Typing `jarvis` in the command bar switches to HUD with effects on.

## The details panel

Click a table to open its details on the right. Close it with &times; or `Esc`.

**Heading**: the group colour, the table name, then a line with its group (or "view"), number of columns, row count, next ID (the `AUTO_INCREMENT` value in the export) and storage engine. A table comment from the export appears below.

**Buttons**:

| Button | What it does |
|---|---|
| Open Spotlight | Opens the [Spotlight](spotlight.md) for this table. |
| Neighbours, 2 steps | [Focus](#focus-on-a-table) on this table at one or two steps. |
| Path from here, Path to here | Fills the Path tab's **From** or **To** box. When both are filled, the path is found at once. See [Path and joins](path-and-joins.md). |
| Delete impact | Shows what deleting one row does. See [Delete impact](delete-impact.md). |
| Copy SELECT | Copies a `SELECT` of this table with a `LEFT JOIN` to every table it points to. See [Path and joins](path-and-joins.md#copy-select). |
| Copy Mermaid | Copies a Mermaid ER diagram of this table and its direct neighbours. See [Exports](exports.md). |

Delete impact and Copy SELECT are not offered for views.

If the table is not on the map right now, a note offers to **Show it with its neighbours**.

**Problems**: if the table has findings, coloured chips count them by severity, with a link to **see the problems and fixes**. The **Problems and fixes** box below lists each one in full, with its check query, fix and copy button, exactly as in the [Health tab](health-checks.md).

**Summary**: one plain sentence, for example "users has 6 columns. Each row points to 1 table (countries). 3 tables point to it. Deleting one row also deletes rows in 5 tables."

**Columns**: a table of every column with its type, whether it can be empty (Null "yes"), and its default. Tags in front of the name:

| Tag | Meaning |
|---|---|
| `PK` | Primary key |
| `FK` | Foreign key, with an arrow to the table it points to |
| `FK?` | Guessed link, no foreign key |
| `UQ` | Has a unique index of its own |
| `IX` | Starts an index (shown only when no other tag applies) |

Column comments from the export appear under the name. "auto increment" appears under the type when it applies.

**Uses (points to)** and **Used by (points here)**: every link out of and into the table. Each shows the other table (click to go there), the delete rule as a coloured tag (`cascade` red, `set null` amber, `restrict` purple) or `guessed`, the exact columns, and notes such as "optional" (the link column can be empty) and "one-to-one" (the link column is unique). A foreign key to a table that is not in the export is tagged "table missing". For a view, "view uses this table" appears in Used by.

**Polymorphic links**: pairs such as `commentable_type + commentable_id`, where each row can point to a different table.

**Indexes**: each index with its type, name and columns.

**Triggers**: each trigger with its timing and event (for example `BEFORE INSERT`). Click to read its body.

**Definition**: for a view, its SQL.

## Small screens

Below 900 pixels wide, the side panel slides over the map (open it with &#9776;) and the details panel opens at the bottom of the screen.

Next: [Spotlight](spotlight.md)
