-- Joinscope catalogue query for PostgreSQL 12+ (also Supabase and Neon, which run PostgreSQL)
--
-- Read-only: it reads the database's catalogue (pg_catalog), never your data.
-- Run it in the database you want to explore (psql, pgAdmin, DBeaver, or your host's SQL
-- editor), copy the one cell it returns, and paste it into Joinscope (Import, "From a query").
-- Every schema except PostgreSQL's own is read; tables outside "public" keep their schema name.
-- Partitions are shown as their parent table.

WITH rels AS (
  SELECT c.oid, n.nspname AS schema, c.relname AS name, c.relkind, c.reltuples,
         COALESCE(pg_partition_root(c.oid), c.oid) AS root
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
),
root_names AS (
  SELECT r.oid, rr.schema, rr.name FROM rels r JOIN rels rr ON rr.oid = r.root
)
SELECT json_build_object(
  'format', 'joinscope-catalogue', 'version', 1, 'dialect', 'postgres', 'database', current_database(),
  'tables', (SELECT COALESCE(json_agg(json_build_object(
      'schema', r.schema, 'table', r.name,
      'rows', (SELECT GREATEST(SUM(GREATEST(p.reltuples, 0)), 0)::bigint FROM rels p WHERE p.root = r.oid AND p.relkind = 'r'),
      'comment', obj_description(r.oid, 'pg_class')) ORDER BY r.schema, r.name), '[]')
    FROM rels r WHERE r.relkind IN ('r', 'p') AND r.root = r.oid),
  'columns', (SELECT COALESCE(json_agg(json_build_object(
      'schema', r.schema, 'table', r.name, 'column', a.attname, 'position', a.attnum,
      'type', format_type(a.atttypid, a.atttypmod), 'nullable', NOT a.attnotnull,
      'default', pg_get_expr(d.adbin, d.adrelid), 'comment', col_description(r.oid, a.attnum),
      'auto', a.attidentity <> '' OR COALESCE(pg_get_expr(d.adbin, d.adrelid), '') LIKE 'nextval(%',
      'generated', a.attgenerated <> '') ORDER BY r.schema, r.name, a.attnum), '[]')
    FROM rels r
    JOIN pg_attribute a ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE r.relkind IN ('r', 'p') AND r.root = r.oid),
  'primary_keys', (SELECT COALESCE(json_agg(json_build_object(
      'schema', r.schema, 'table', r.name, 'column', a.attname, 'position', k.pos)), '[]')
    FROM pg_constraint con
    JOIN rels r ON r.oid = con.conrelid AND r.root = r.oid
    CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, pos)
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
    WHERE con.contype = 'p'),
  'foreign_keys', (SELECT COALESCE(json_agg(json_build_object(
      'name', con.conname, 'schema', src.schema, 'table', src.name, 'column', a.attname, 'position', k.pos,
      'ref_schema', dst.schema, 'ref_table', dst.name, 'ref_column', fa.attname,
      'on_delete', CASE con.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' WHEN 'r' THEN 'RESTRICT' ELSE 'NO ACTION' END,
      'on_update', CASE con.confupdtype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' WHEN 'r' THEN 'RESTRICT' ELSE 'NO ACTION' END)), '[]')
    FROM pg_constraint con
    JOIN root_names src ON src.oid = con.conrelid
    JOIN root_names dst ON dst.oid = con.confrelid
    CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS k(attnum, refnum, pos)
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
    JOIN pg_attribute fa ON fa.attrelid = con.confrelid AND fa.attnum = k.refnum
    WHERE con.contype = 'f' AND con.conparentid = 0),
  'indexes', (SELECT COALESCE(json_agg(json_build_object(
      'schema', r.schema, 'table', r.name, 'name', ic.relname, 'unique', i.indisunique, 'partial', i.indpred IS NOT NULL,
      'column', COALESCE(a.attname, pg_get_indexdef(i.indexrelid, k.pos::int, true)), 'position', k.pos)), '[]')
    FROM pg_index i
    JOIN rels r ON r.oid = i.indrelid AND r.root = r.oid
    JOIN pg_class ic ON ic.oid = i.indexrelid
    CROSS JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, pos)
    LEFT JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum AND k.attnum > 0
    WHERE NOT i.indisprimary AND k.pos <= i.indnkeyatts),
  'views', (SELECT COALESCE(json_agg(json_build_object(
      'schema', r.schema, 'name', r.name, 'sql', pg_get_viewdef(r.oid, true)) ORDER BY r.schema, r.name), '[]')
    FROM rels r WHERE r.relkind IN ('v', 'm')),
  'triggers', (SELECT COALESCE(json_agg(json_build_object(
      'schema', r.schema, 'table', r.name, 'name', t.tgname,
      'timing', CASE WHEN t.tgtype & 2 <> 0 THEN 'BEFORE' WHEN t.tgtype & 64 <> 0 THEN 'INSTEAD OF' ELSE 'AFTER' END,
      'event', concat_ws(' OR ', CASE WHEN t.tgtype & 4 <> 0 THEN 'INSERT' END, CASE WHEN t.tgtype & 8 <> 0 THEN 'DELETE' END,
                         CASE WHEN t.tgtype & 16 <> 0 THEN 'UPDATE' END, CASE WHEN t.tgtype & 32 <> 0 THEN 'TRUNCATE' END),
      'body', pg_get_triggerdef(t.oid, true))), '[]')
    FROM pg_trigger t
    JOIN rels r ON r.oid = t.tgrelid AND r.root = r.oid
    WHERE NOT t.tgisinternal)
) AS joinscope;
