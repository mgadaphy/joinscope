# Automatic detection

Joinscope works out what kind of database it is looking at, so you get sensible results with no setup. It reads only table and column names. It never reads your code and never looks at your data.

What it found is shown in the **Health** tab, under **Detected**.

## Frameworks

A framework leaves its own tables behind: a table to track migrations, queues, caches, sessions. Joinscope recognises these signatures:

| Framework | Recognised by |
|---|---|
| Laravel | a `migrations` table with a `batch` column |
| Django | a `django_migrations` table |
| Ruby on Rails | `schema_migrations` and `ar_internal_metadata` tables |
| Prisma | a `_prisma_migrations` table |
| Sequelize | a `SequelizeMeta` table |
| Knex | a `knex_migrations` table |
| TypeORM | a `typeorm_metadata` table |
| Doctrine (Symfony) | a `doctrine_migration_versions` table |
| Alembic (SQLAlchemy) | an `alembic_version` table |
| Flyway | a `flyway_schema_history` table |
| Liquibase | a `databasechangelog` table |
| WordPress | an `options` table with `option_name` and a `posts` table with `post_type` (any prefix, such as `wp_`) |
| Strapi | `strapi_migrations` or `strapi_database_schema` |
| Directus | `directus_collections` |
| Magento | `core_config_data` |
| Drupal | `config` and `key_value` tables |
| Moodle | `mdl_config` |
| Odoo | `ir_model` and `res_partner` tables |

When a framework is found:

- **Its bookkeeping tables are grouped as "framework"** on the map (for Laravel: `migrations`, `jobs`, `failed_jobs`, `cache`, `sessions`, `personal_access_tokens` and the like; for Django: `django_*` and the `auth_*` permission tables).
- **They are kept out of the problem list.** A framework table without a primary key is reported as low, with a note, and framework tables are not reported as "tables with no links". They are built that way on purpose.
- **Laravel only:** each fix in Health also comes as a Laravel migration line, ready to paste into a migration.

## People tables

Some tables hold people: a delete elsewhere must never erase them. Joinscope treats a table as holding people when its whole name is one of these words, singular or plural, in any case: user, customer, client, employee, staff, member, student, patient, person, people, contact, subscriber, account. Framework user tables count too (`auth_user` in Django, `wp_users` in WordPress).

If a foreign key would delete rows in a people table when a row elsewhere is deleted (for example, deleting a country deletes its customers), Health reports it as **high**, with a fix that clears the link instead (`ON DELETE SET NULL`).

## Areas

To colour the map by meaning, each table is matched to a common area of an application by the words in its name (`order_items` gives the words "order" and "item"; `InvoiceLine` gives "invoice" and "line"):

| Area | Example words |
|---|---|
| people | user, customer, member, employee, profile, address, team, company |
| access | role, permission, session, token, password, invitation |
| sales | order, cart, invoice, payment, refund, coupon, subscription, shipment |
| catalogue | product, category, brand, variant, inventory, stock, supplier |
| content | post, page, article, comment, media, file, tag, review |
| messaging | message, notification, email, chat, newsletter |
| lookups | country, currency, language, setting, status, and any name ending in type, status or kind |
| activity | log, audit, event, history, visit, job, report |

The first word decides: `product_reviews` is catalogue, not content.

**Colour by: Domain** combines this with your own naming:

1. Framework tables go to "framework".
2. Tables sharing a first word with at least two others keep that word as their group. A project's own vocabulary (`invoice_*`, `student_*`, `fee_*`) is a better grouping than any general list.
3. Other tables go to their area.
4. Smaller prefixes (two tables) form their own group.
5. Whatever is left joins the group it is linked to most, or "other".

**Colour by: Cluster** ignores names and groups tables purely by how they link.

## When detection is wrong

Detection is a guess from names, and names can mislead. A [profile](profiles.md) overrides it:

- `framework: 'laravel'` forces Laravel migration lines, even without a `migrations` table in the export.
- `peopleTables: [...]` replaces the detected list completely.
- `keep: [...]` adds tables that are quiet on purpose.
- `accepted: [...]` hides findings you have reviewed.

Next: [Profiles](profiles.md)
