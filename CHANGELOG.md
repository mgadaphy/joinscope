# Changelog

## 0.2.1 (October 2026)

- Views that join tables with commas (`FROM a, b AS x, c`, also mixed with `JOIN`) now link to every table, not only the first.
- The differences map in Compare shows tables with no links without changing your **Show tables with no links** setting.
- "Show the table with no links" when there is only one.

## 0.2.0 (October 2026)

- **Automatic detection:** 18 frameworks recognised from their own tables (Laravel, Django, Rails, Prisma, WordPress and more); their bookkeeping tables grouped and kept out of the problem list; people tables found by name; tables grouped by area (people, sales, catalogue...) when they do not share a prefix. Shown under Health > Detected.
- **Fix scripts that run:** a missing foreign key between columns of different types now changes the column first (MySQL refuses the key otherwise), and no duplicate index is added next to a new foreign key.
- `ALTER TABLE ... DROP INDEX` and `DROP PRIMARY KEY` are read.
- New sample: Webshop after the fixes, to see Compare at work.
- Links that open a view: `#view=health`, `#view=impact&table=...`, `#view=path&from=...&to=...`, `#view=compare&a=...&b=...`.
- User guide in `docs/`.

## 0.1.0 (October 2026)

First public version.

- MySQL and MariaDB dumps: map, Spotlight, delete impact, path finder, health checks with fix scripts, insights, compare, exports.
- Samples: Webshop, Chinook, Sakila.
- Optional project profiles.
