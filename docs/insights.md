# Insights

Insights are facts about the structure: how big it is, which tables matter most, which deletes spread furthest, and what is worth a second look. They sit in the **Health** tab, below the list of problems.

Unlike [health checks](health-checks.md), insights do not come with fixes. They help you understand a database and decide where to look.

In every list, click a table name to go to it on the map (or in the Spotlight, if it is open).

## The numbers

Under the schema's name, six numbers:

| Number | Meaning |
|---|---|
| tables | Tables in the export (views not included) |
| columns | Columns across all tables |
| foreign keys | Links declared in the database |
| guessed links | Columns that look like links but have no foreign key |
| views | Saved queries that act like tables |
| rows | Total rows counted from the `INSERT` statements, or "-" for a structure-only export |

For Webshop: 11 tables, 49 columns, 7 foreign keys, 5 guessed links, 0 views and 5 rows. The rows are the five countries, the only table the sample fills.

## Detected

What Joinscope worked out by itself from table and column names: the framework that made the schema (if it recognises one), the tables it treats as people tables, and the areas used to colour the map. When a [profile](profiles.md) is loaded, a note says that it overrides what it sets. See [automatic detection](detection.md) for the details.

For Webshop, no framework is found and `users` is the people table.

## Structure

**Most referenced tables** (open by default). The tables with the most links pointing to them, up to 12, with "N tables point here". These are the core of the database: users, products, accounts. Guessed links and self-links count.

In Webshop: `orders` and `users` (3 each), `categories` and `products` (2 each), `addresses` and `countries` (1 each). `categories` counts its own `parent_id` link.

**Tables that depend on the most others**. The tables with the most links pointing out, up to 12, with "points to N". These are usually the busiest records, like order lines that link an order, a product and a warehouse.

**Deletes that spread furthest**. The tables where deleting one row cascades the furthest, up to 10, with the number of cascades. Each cascading foreign key reached counts once, so a table reached by two routes counts twice. See [Delete impact](delete-impact.md) for the full picture of any of them.

In Webshop: `users` (5 cascades) and `orders` (2).

**Largest tables**. Up to 10 tables by row count. Shown only when the export had data. In Webshop, only `countries` (5 rows).

## Worth checking

**Columns that look like links but have no foreign key**. Every guessed link, as `column -> table`. The database does not protect these, so a deleted parent leaves rows pointing at nothing. Each one is also a [health check](health-checks.md#links-without-a-foreign-key) with a fix.

**`*_id` columns with no matching table**. Columns named like a link for which no table of that name exists, with the number of tables that have them. Hover over one to see the table names. See the [health check](health-checks.md) of the same name.

**Guessed links without an index**. Shown when there are any. Joins on these columns read the whole table.

**Foreign keys whose types differ**. Shown when there are any: each column with its type and the type it points to.

**Foreign keys to tables not in this export**. Shown when there are any. Usually a partial export.

**Tables without a primary key**. In Webshop, `coupon_redemptions`.

**Tables with no links at all**. Tables with no foreign key and no guessed link either way. In Webshop, `settings`.

**Polymorphic links**. Shown when there are any. Pairs such as `commentable_type` and `commentable_id`: the `_type` column names which table each row points to, so one column can link to many tables. Databases cannot protect such links with a foreign key.

**Empty tables**. Shown only when row counts are known to be zero. A table that simply has no `INSERT` statements in a dump has no row count at all (not zero), so for files you import this list is usually not shown.

**Parser warnings**. Shown when there are any. Things Joinscope could not read in the file:

- "Could not read foreign key on ...": a foreign key written in a form the parser did not understand. That link is missing from the map.
- "Rows found for ... but no CREATE TABLE statement.": the file inserts rows into a table it never creates, usually a data-only export or a file cut short.

After an import, the message at the bottom of the screen says how many warnings there were. See the [FAQ](faq.md#parse-warnings) for what to do.

Next: [Compare](compare.md)
