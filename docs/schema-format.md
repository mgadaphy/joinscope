# The Joinscope schema format

Joinscope reads SQL dumps and SQLite files directly. For anything else, it reads a small JSON format: write an exporter for your database that produces it, and Joinscope can show that database.

**Export > Schema as JSON** writes this format too, so a schema can be saved, shared and imported again without the original dump.

There are two flavours. Both are imported the same way: drop the `.json` file, or paste it.

## 1. A whole schema: `joinscope-schema`

```json
{
  "format": "joinscope-schema",
  "version": 1,
  "name": "shop",
  "dialect": "postgres",
  "tables": [
    {
      "name": "orders",
      "comment": "One row per order",
      "rows": 1520,
      "columns": [
        { "name": "id", "type": "bigint", "nullable": false, "autoIncrement": true },
        { "name": "user_id", "type": "bigint", "nullable": false },
        { "name": "status", "type": "text", "nullable": false, "default": "pending", "comment": "pending, paid or sent" }
      ],
      "primaryKey": ["id"],
      "indexes": [
        { "name": "orders_user_id_index", "unique": false, "columns": ["user_id"] }
      ],
      "foreignKeys": [
        { "name": "orders_user_id_fkey", "columns": ["user_id"], "references": "users", "referencedColumns": ["id"], "onDelete": "CASCADE", "onUpdate": "NO ACTION" }
      ]
    }
  ],
  "views": [
    { "name": "big_orders", "sql": "SELECT * FROM orders WHERE total > 100000" }
  ],
  "triggers": [
    { "name": "orders_touch", "table": "orders", "timing": "BEFORE", "event": "UPDATE" }
  ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | `joinscope-schema` |
| `version` | yes | `1` |
| `dialect` | no | `mysql`, `postgres`, `sqlite`, `sqlserver`, `oracle` or `other`. It decides the SQL the fixes are written in. For `other`, Health explains each problem but writes no fix statement, since it cannot be sure of your database's SQL. |
| `tables[].name` | yes | A table name. Use `schema.table` when the table is not in the default schema. |
| `tables[].columns` | yes | In order. `type` as the database names it. `nullable` defaults to true. |
| `tables[].primaryKey` | no | Column names, in key order. |
| `tables[].indexes` | no | `unique: true` for a unique index. `type: "FULLTEXT"` or `"SPATIAL"` where it applies. |
| `tables[].foreignKeys` | no | `references` is the parent table. When `referencedColumns` is empty, the parent's primary key is meant. `onDelete` is `CASCADE`, `SET NULL`, `SET DEFAULT`, `RESTRICT` or `NO ACTION` (read as `RESTRICT`). |
| `tables[].rows` | no | A row count, exact or estimated. |
| `views[]` | no | `sql` is the view's query. Joinscope finds the tables it reads from it; or give `refs`, a list of table names. |
| `triggers[]` | no | Shown on their table. |

## 2. A catalogue query's result: `joinscope-catalogue`

The queries in [`queries/`](../queries) read a database's own catalogue and return this flatter shape in one cell: one row per column, per key column and per index column, which is easy to produce in SQL. Composite keys and indexes are put back together by `name` and `position`.

```json
{
  "format": "joinscope-catalogue",
  "version": 1,
  "dialect": "postgres",
  "database": "shop",
  "tables":       [{ "schema": "public", "table": "orders", "rows": 1520, "comment": null }],
  "columns":      [{ "schema": "public", "table": "orders", "column": "id", "position": 1, "type": "bigint", "nullable": false, "default": null, "auto": true }],
  "primary_keys": [{ "schema": "public", "table": "orders", "column": "id", "position": 1 }],
  "foreign_keys": [{ "name": "orders_user_id_fkey", "schema": "public", "table": "orders", "column": "user_id", "position": 1,
                     "ref_schema": "public", "ref_table": "users", "ref_column": "id", "on_delete": "CASCADE", "on_update": "NO ACTION" }],
  "indexes":      [{ "schema": "public", "table": "orders", "name": "orders_user_id_index", "unique": false, "column": "user_id", "position": 1 }],
  "views":        [{ "schema": "public", "name": "big_orders", "sql": "SELECT ..." }],
  "triggers":     [{ "schema": "public", "table": "orders", "name": "orders_touch", "timing": "BEFORE", "event": "UPDATE" }]
}
```

`schema` is optional. A table in `public`, `dbo` or `main` is named without it; any other schema stays in the name (`auth.users`). A foreign key without a `name` (SQLite) is grouped by `id`.

Writing a catalogue query for another database is the quickest way to add it to Joinscope. See [CONTRIBUTING.md](../CONTRIBUTING.md).

Next: [Back to the guide](README.md)
