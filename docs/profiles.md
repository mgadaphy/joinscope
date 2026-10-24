# Profiles

A profile tells Joinscope about one project: which tables hold people, which findings you have reviewed and keep on purpose, and which framework made the database. It is optional. Without one, Joinscope works out what it can by itself (see [Automatic detection](#automatic-detection)) and applies general rules.

A profile only changes the [health checks](health-checks.md) and the notes about them. It never changes your database, and it never leaves your computer.

## Setting one up

1. In the Joinscope folder, open `profiles`.
2. Copy `example-profile.js` to a new file named exactly `profile.js` in the same folder.
3. Edit `profile.js` in any text editor.
4. Reload Joinscope in the browser.

`index.html` loads `profiles/profile.js` if it exists, and quietly carries on if it does not. The file is listed in `.gitignore`, so if you keep Joinscope in a git repository, your project's rules stay on your machine.

The file is a small piece of JavaScript that sets `window.PROJECT_PROFILE`:

```js
window.PROJECT_PROFILE = {
  name: 'My app',
  peopleTables: ['users', 'customers'],
  keep: ['failed_jobs', 'password_reset_tokens'],
  accepted: [
    { kind: 'missing-fk', table: 'orders', column: 'legacy_id', reason: 'Points to the old system; no table here.' }
  ]
};
```

**One profile applies to every schema you open** while it is there, including the samples. If you look at several projects, keep a profile per project somewhere else and copy the right one to `profile.js` before you start.

## Fields

| Field | What it does |
|---|---|
| `name` | The project's name. It appears in the **Detected** section of the Health tab, in the note saying a profile is loaded. |
| `framework` | The framework that made the database. `'laravel'` shows each fix as a Laravel migration line as well as SQL. Laravel is also detected on its own. |
| `peopleTables` | The tables that hold people. Replaces the list Joinscope detects. A cascade that would erase rows in one of these when a row elsewhere is deleted is reported as high. |
| `accepted` | Findings you have reviewed and keep on purpose, each `{ kind, table, column, reason }`. They leave the list and are named in one summary with your reason. |
| `keep` | Tables that are empty or quiet on purpose. |
| `dormant` | Tables the app reads but nothing writes, each `{ table, note }`. |
| `outOfScope` | Groups of tables the project no longer uses, each `{ pattern, label, reason }`. `pattern` is a regular expression matched against table names. |

**About `keep`, `dormant` and `outOfScope`.** `keep` tables are left out of "Tables with no links" and of [Empty tables the code no longer uses](health-checks.md#empty-tables-the-code-no-longer-uses). `dormant` and `outOfScope` add their own findings ([Tables the app reads but never fills](health-checks.md#tables-the-app-reads-but-never-fills) and [Outside what this project does](health-checks.md#outside-what-this-project-does)) on any schema.

## Accepting findings

`accepted` is the field you will use most. Every schema has findings that are fine for that project: a cascade you really want, a column that only looks like a link, a settings table with no links. Accepting them keeps the list focused on what is left to do.

Each entry has:

| Key | Required | Matches |
|---|---|---|
| `kind` | yes | The kind of finding (see the table below) |
| `table` | no | The table the finding is about |
| `column` | no | The column the finding is about, written exactly as in the finding |
| `reason` | yes, in practice | Shown in the summary. Write it for the next person. |

A finding is accepted when its kind matches, and its table and column match too, for the keys you gave. Leaving out `table` and `column` accepts **every** finding of that kind, so use that with care.

What happens to an accepted finding:

- it leaves the Health list, the table rings on the map, the details panel and the Spotlight,
- it is left out of the fix script,
- one low finding, "N findings reviewed and kept on purpose", lists every accepted finding with its reason, for example `orders.address_id: The address is copied into the order; the link is for information only.` Nothing is hidden without a trace. The summary is not counted in the problems button.

### Kinds you can accept

| `kind` | Health tab name | What `table` and `column` hold |
|---|---|---|
| `cascade-people` | People records erased when a lookup entry is deleted | The people table and its link column |
| `missing-table` | Foreign keys to missing tables | The table holding the foreign key and its column |
| `type-mismatch` | Linked columns with different types | The linking table and column |
| `cascade-money` | Financial records deleted by cascade | The table holding the foreign key and its column |
| `cascade-academic` | History records deleted by cascade | The table holding the foreign key and its column |
| `missing-fk` | Links without a foreign key | The table and the guessed link column |
| `no-index` | Link columns without an index | The table and the column |
| `no-pk` | Tables without a primary key | The table; no column |
| `dup-index` | Redundant indexes | The table, and the index's columns as `a, b` |
| `wide` | Very wide tables | The table; no column |
| `orphan-id` | `*_id` columns with no matching table | The column name; the table only when a single table has it |
| `cascade-wide` | Deletes that reach many tables | The table; no column |
| `isolated` | Tables with no links | No table and no column: one finding covers all such tables |

For multi-column foreign keys, `column` is the columns joined with a comma and a space, such as `'tenant_id, order_id'`.

## Worked example: Webshop

The Webshop sample reports 14 problems. Suppose you own that shop and review them:

- `settings` is a key and value store. Having no links is by design.
- `orders.address_id` has no foreign key on purpose: the address is copied into the order when it is placed, and the link is only for information. You also never look orders up by address, so no index is needed.

Create `profiles/profile.js`:

```js
window.PROJECT_PROFILE = {
  name: 'Webshop',
  accepted: [
    { kind: 'isolated', reason: 'settings is a key and value store; it links to nothing by design.' },
    { kind: 'missing-fk', table: 'orders', column: 'address_id', reason: 'The address is copied into the order; the link is for information only.' },
    { kind: 'no-index', table: 'orders', column: 'address_id', reason: 'Orders are never looked up by address.' }
  ]
};
```

Reload. The three findings leave the list, and a new low finding, "3 findings reviewed and kept on purpose", names them with your reasons. The problems button now shows 11. The map no longer marks `orders` for the address link, and the fix script no longer adds that foreign key or index.

Note the two separate entries for `orders.address_id`: the missing foreign key and the missing index are two findings of different kinds, so each needs its own entry.

Note also that the `isolated` entry has no `table`, so it accepts the whole "Tables with no links" finding. To accept one table and still hear about others, give it a table: `{ kind: 'isolated', table: 'settings', reason: '...' }` leaves `settings` out of the finding (it is then not named in the summary).

## Worked example: people tables with unusual names

Joinscope detects people tables from their names, such as `users`, `customers` or `employees`. If your project calls them something else, say so:

```js
window.PROJECT_PROFILE = {
  name: 'Clinic',
  peopleTables: ['app_users', 'staff_members', 'patients']
};
```

Now a foreign key such as `app_users.clinic_id` pointing to `clinics` with `ON DELETE CASCADE` is reported as high: "Deleting a row in clinics deletes rows in app_users", with a fix that switches it to `SET NULL`. A cascade from one people table to another (for example `staff_members` to `app_users`) is not reported by this check.

`peopleTables` replaces the detected list rather than adding to it, so include every people table you care about.

## Worked example: Laravel

Joinscope recognises a Laravel database from its `migrations` table with a `batch` column. If your export does not include that table, tell it:

```js
window.PROJECT_PROFILE = {
  name: 'Shop API',
  framework: 'laravel'
};
```

Each fix that has one then also shows "Same fix in a Laravel migration", for example:

```php
$table->dropForeign(['user_id']);
$table->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
```

These lines go inside a migration's `Schema::table('orders', function (Blueprint $table) { ... })` callback.

## A complete profile

```js
// profiles/profile.js
window.PROJECT_PROFILE = {
  name: 'Shop API',
  framework: 'laravel',

  // tables holding people: a cascade that would erase one of these is flagged
  peopleTables: ['users', 'customers'],

  // empty or quiet on purpose: not reported as having no links
  keep: ['failed_jobs'],

  // findings reviewed and kept on purpose
  accepted: [
    { kind: 'cascade-money', table: 'charge_attempts', column: 'checkout_session_id', reason: 'Attempts are temporary and go with their checkout session; real payments live in payments.' },
    { kind: 'orphan-id', column: 'stripe_customer_id', reason: 'ID in the payment provider, not a table here.' },
    { kind: 'wide', table: 'products', reason: 'Wide on purpose for the export feed; reviewed.' }
  ]
};
```

The `charge_attempts` entry accepts a finding the money check makes because the table name contains `charge`. Accepting a finding that never appears does no harm, but check the Health tab after reloading: each entry should appear in the "reviewed and kept on purpose" summary. If one does not, its `kind`, `table` or `column` does not match.

## When a profile does not seem to work

- **Name and place**: the file must be `profiles/profile.js`, next to `example-profile.js`.
- **Reload**: changes are read when the page loads.
- **Syntax errors**: a missing comma or quote makes the browser skip the whole file. Open the browser's developer console (`F12`) and look for an error mentioning `profile.js`.
- **Matching**: compare your entry with the finding. The `kind` must be one of those above, and `table` and `column` must be spelled exactly as in the finding.
- **The Detected section** in the Health tab says whether a profile is loaded.

## Automatic detection

See [automatic detection](detection.md).

Next: [Privacy](privacy.md)
