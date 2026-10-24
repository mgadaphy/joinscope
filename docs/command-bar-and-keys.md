# Command bar and keys

The command bar lets you type what you want instead of clicking through panels. This page lists every command it understands, then every keyboard and mouse shortcut.

## Opening the command bar

- Press `Ctrl+K` (or `Cmd+K` on a Mac). This works everywhere, even inside the Spotlight.
- Click **Ask** `Ctrl K` in the top bar, or in the small bar shown in full screen.

Type, then press `Enter` to run the highlighted suggestion. `Up` and `Down` move between suggestions, a click runs one, and `Esc` (or a click outside) closes the bar. Up to 12 suggestions are shown.

## How table names are matched

Wherever a command takes a table name:

- capitals do not matter, and spaces count as underscores (`order items` finds `order_items`),
- an exact name comes first, then names that start with what you typed (shortest first), then names that contain it, with a final `s` dropped (`user` and `users` both find `users`),
- views are included.

## Commands

### Find a path between two tables

Two table names joined by `to`, `and`, `with` or `->`, optionally starting with `path`, `route`, `join`, `from` or `how is`, `how are`, `how do`, `how does`, and optionally ending with `connected` and a question mark.

| You type | Suggestion |
|---|---|
| `payments to products` | Path from payments to products |
| `path from payments to products` | the same |
| `how are users and products connected?` | Path from users to products |
| `orders -> countries` | Path from orders to countries |

It opens the Path tab and finds the path. See [Path and joins](path-and-joins.md).

### Delete impact

`impact`, `delete`, or `what happens if (or when) I delete a (an, one)`, followed by a table name. Up to three matching tables are offered.

| You type | Suggestion |
|---|---|
| `delete users` | Delete impact of users |
| `impact order` | Delete impact of orders, Delete impact of order_items |
| `what happens if I delete a user?` | Delete impact of users |

See [Delete impact](delete-impact.md).

### Focus on a table's neighbours

`focus`, `neighbours`, `neighbors`, `neighbours of` or `around`, followed by a table name. Up to three tables are offered, each as "Neighbours of ...". See [The map](the-map.md#focus-on-a-table).

### Find a column

`column`, `find column` or `where is`, followed by one word. Every column whose name contains that word is listed as `table.column` with its type. Choosing one opens the Spotlight of its table.

For example, `where is order_id` lists `coupon_redemptions.order_id`, `order_items.order_id` and `payments.order_id`.

Your text is lowercased before matching, so this does not find columns whose names contain capital letters (such as `CustomerId` in the Chinook sample). Use the search box in the top bar for those.

### Actions

These match when your text **starts with** one of the words listed.

| Starts with | Suggestion | What it does |
|---|---|---|
| `problem`, `problems`, `issue`, `issues`, `health`, `check` | Show problems and fixes | Opens the Health tab and marks problems on the map |
| `fix`, `fixes`, `fix script` | Download the fix script | Saves the suggested fixes as `.sql` |
| `full`, `present`, `big`, `screen` | Full-screen presentation | Same as `P` |
| `map`, `group` | Group map on or off | Toggles **Group map** in the Explore tab |
| `er`, `columns`, `diagram` | ER diagram mode on or off | Toggles **ER diagram mode** |
| `jarvis`, `stark` | Jarvis: effects on with the HUD look | Turns effects on and switches to the HUD theme |
| `effects`, `motion`, `animat` | Effects on (or off) | Toggles effects |
| `hud` | HUD theme | |
| `dark` | Dark theme | |
| `light` | Light theme | |
| `all`, `everything`, `reset`, `home` | Show everything | Closes the Spotlight and leaves any focus, path or impact view |
| `spread`, `space`, `wider` | Spread the graph out more | Adds 40% to **Spacing**, up to 300% |
| `import`, `load` | Import a .sql file | Opens the import dialog |
| `png`, `picture`, `export` | Save a picture of the graph | Saves the map as PNG |

### Open a table

If nothing above matches, the text is treated as a table name. You get up to six "Spotlight ..." suggestions (with each table's number of columns), then "Delete impact of ..." and "Neighbours of ..." for the best match.

A table whose name starts with what you typed is offered first, before any action, so `errors` offers the `errors` table as well as ER diagram mode. Starting with `spotlight`, `show`, `open` or `table` and a space always gives table suggestions.

### With nothing typed

The bar suggests: Show problems and fixes (try: problems), Full-screen presentation (try: present), HUD theme (try: jarvis), and the Spotlight of the most connected table.

## Links that open a view

The end of the address (after `#`) can tell Joinscope what to open when the page loads. This lets you bookmark a view, or share a link to a view of a sample or of the live demo. Parts are joined with `&`.

| Ending | Opens |
|---|---|
| `#schema=default` | A given schema. `default` is the Webshop sample; the other samples are `extra:webshop-fixed`, `extra:chinook` and `extra:sakila`. Imported schemas have ids starting with `imp-` and exist only in the browser that imported them. |
| `#table=orders` | The map with that table selected. Joinscope adds this ending itself when you click a table. |
| `#spot=orders` | The Spotlight of that table. Added when you open a Spotlight. |
| `#view=health` | The Health tab, with problems marked on the map |
| `#view=impact&table=users` | Delete impact of a table |
| `#view=path&from=payments&to=products` | The path between two tables |
| `#view=compare&a=default&b=extra:webshop-fixed` | Compare two schemas by id. Add `&map=1` to go straight to the differences map. |

For example, `index.html#view=compare&a=default&b=extra:webshop-fixed&map=1` opens the Webshop before-and-after comparison on the map. `index.html#schema=extra:sakila&view=impact&table=film` opens Sakila's delete impact for `film`.

A schema given with `schema=` is opened instead of the one you looked at last.

## Keyboard shortcuts

### Anywhere

| Key | Action |
|---|---|
| `Ctrl+K` or `Cmd+K` | Open the command bar |

### On the map

These work when you are not typing in a box and the Spotlight is closed.

| Key | Action |
|---|---|
| `/` | Jump to the search box |
| `P` | Full-screen presentation on or off |
| `F` | Fit the whole map on screen |
| `Esc` | Clear the selected table; if none, leave focus (or the path or impact view); if none, leave full screen |

### In the search box

| Key | Action |
|---|---|
| `Up`, `Down` | Move through the results |
| `Enter` | Go to the highlighted table |
| `Esc` | Leave the search box |

### In the Path and Impact tabs

| Key | Action |
|---|---|
| `Enter` in From or To | Find path |
| `Enter` in Table | Show impact |

### In the Spotlight

| Key | Action |
|---|---|
| `Esc` | Close the Spotlight |
| `Backspace` or `Alt+Left` | Back to the previous table (closes the Spotlight from the first one) |
| `P` | Full screen on or off |
| `+` or `=` | Zoom in |
| `-` | Zoom out |
| `0` | Fit everything |
| `1` | Actual size (100%) |

### In the command bar

| Key | Action |
|---|---|
| `Up`, `Down` | Choose a suggestion |
| `Enter` | Run it |
| `Esc` | Close |

## Mouse and touch

### On the map

| Action | Result |
|---|---|
| Click a table | Select it and open its details |
| Double-click a table | Open its Spotlight |
| Click an arrow | Show the link in full at the bottom of the screen |
| Hover a table | Small card with columns, rows and link counts |
| Hover an arrow | Show its column name |
| Click the background | Clear the selection |
| Scroll | Zoom |
| Drag the background | Move the map |
| Drag a table | Move the table |
| Double-click a group box (group map) | Show only that group |

### In the Groups legend

| Action | Result |
|---|---|
| Click a group | Hide or show it |
| Double-click a group | Show only that group; again to show all |

### In the Spotlight

| Action | Result |
|---|---|
| Hover a column of the middle table | Light up its links |
| Click a column | Keep it lit; click again to release |
| Hover or click a side card | Light up (or keep lit) that table's links |
| Click a side card's name | Step into that table |
| `Ctrl` + wheel, or pinch | Zoom |
| Drag the background | Move |

### Anywhere

Click a table name in any panel to go to it. Drop a `.sql` or `.sql.gz` file anywhere on the page to import it.

Next: [Automatic detection](detection.md)
