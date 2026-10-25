-- Joinscope catalogue query for SQLite 3.38+ (also Cloudflare D1, Turso and other SQLite consoles)
--
-- Read-only: it reads the database's own description (sqlite_master and the pragma
-- functions), never your data. Have the database file? Drop it on Joinscope instead:
-- it is opened in your browser and nothing is uploaded. Use this query when you only
-- have a console, then copy the one cell it returns and paste it into Joinscope
-- (Import, "From a query").

SELECT json_object(
  'format', 'joinscope-catalogue', 'version', 1, 'dialect', 'sqlite',
  'tables', json((SELECT json_group_array(json_object('table', m.name))
    FROM sqlite_master m WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%')),
  'columns', json((SELECT json_group_array(json_object(
      'table', m.name, 'column', p.name, 'position', p.cid + 1, 'type', p.type,
      'nullable', json(CASE WHEN p."notnull" = 0 AND p.pk = 0 THEN 'true' ELSE 'false' END),
      'default', p.dflt_value,
      'auto', json(CASE WHEN p.pk = 1 AND upper(p.type) = 'INTEGER'
                         AND (SELECT COUNT(*) FROM pragma_table_info(m.name) k WHERE k.pk > 0) = 1 THEN 'true' ELSE 'false' END),
      'generated', json(CASE WHEN p.hidden IN (2, 3) THEN 'true' ELSE 'false' END)))
    FROM sqlite_master m, pragma_table_xinfo(m.name) p
    WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%')),
  'primary_keys', json((SELECT json_group_array(json_object('table', m.name, 'column', p.name, 'position', p.pk))
    FROM sqlite_master m, pragma_table_info(m.name) p
    WHERE m.type = 'table' AND p.pk > 0 AND m.name NOT LIKE 'sqlite_%')),
  'foreign_keys', json((SELECT json_group_array(json_object(
      'id', f.id, 'table', m.name, 'column', f."from", 'position', f.seq + 1,
      'ref_table', f."table", 'ref_column', f."to", 'on_delete', f.on_delete, 'on_update', f.on_update))
    FROM sqlite_master m, pragma_foreign_key_list(m.name) f
    WHERE m.type = 'table')),
  'indexes', json((SELECT json_group_array(json_object(
      'table', m.name, 'name', il.name, 'unique', json(CASE WHEN il."unique" THEN 'true' ELSE 'false' END),
      'column', ii.name, 'position', ii.seqno + 1))
    FROM sqlite_master m, pragma_index_list(m.name) il, pragma_index_info(il.name) ii
    WHERE m.type = 'table' AND il.origin <> 'pk')),
  'views', json((SELECT json_group_array(json_object('name', name, 'sql', sql))
    FROM sqlite_master WHERE type = 'view')),
  'triggers', json((SELECT json_group_array(json_object('name', name, 'table', tbl_name, 'body', sql))
    FROM sqlite_master WHERE type = 'trigger'))
) AS joinscope;
