-- Joinscope catalogue query for MySQL 5.7+ and MariaDB 10.2+
--
-- Read-only: it reads the database's catalogue (information_schema), never your data.
-- Run it on the database you want to explore, copy the one cell it returns, and paste
-- it into Joinscope (Import, "From a query"). Both statements are needed: the first lets
-- the result be longer than 1 KB.

SET SESSION group_concat_max_len = 1073741824;

SELECT CONCAT(
  '{"format":"joinscope-catalogue","version":1,"dialect":"mysql","database":', JSON_QUOTE(DATABASE()),
  ',"tables":[', IFNULL((
    SELECT GROUP_CONCAT(JSON_OBJECT('table', t.TABLE_NAME, 'rows', t.TABLE_ROWS, 'comment', t.TABLE_COMMENT, 'engine', t.ENGINE) SEPARATOR ',')
    FROM information_schema.TABLES t
    WHERE t.TABLE_SCHEMA = DATABASE() AND t.TABLE_TYPE = 'BASE TABLE'), ''),
  '],"columns":[', IFNULL((
    SELECT GROUP_CONCAT(JSON_OBJECT('table', c.TABLE_NAME, 'column', c.COLUMN_NAME, 'position', c.ORDINAL_POSITION,
      'type', c.COLUMN_TYPE, 'nullable', c.IS_NULLABLE = 'YES', 'default', c.COLUMN_DEFAULT, 'comment', c.COLUMN_COMMENT,
      'auto', c.EXTRA LIKE '%auto_increment%', 'generated', IFNULL(c.GENERATION_EXPRESSION, '') <> '') SEPARATOR ',')
    FROM information_schema.COLUMNS c
    JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME AND t.TABLE_TYPE = 'BASE TABLE'
    WHERE c.TABLE_SCHEMA = DATABASE()), ''),
  '],"primary_keys":[', IFNULL((
    SELECT GROUP_CONCAT(JSON_OBJECT('table', k.TABLE_NAME, 'column', k.COLUMN_NAME, 'position', k.ORDINAL_POSITION) SEPARATOR ',')
    FROM information_schema.KEY_COLUMN_USAGE k
    WHERE k.TABLE_SCHEMA = DATABASE() AND k.CONSTRAINT_NAME = 'PRIMARY'), ''),
  '],"foreign_keys":[', IFNULL((
    SELECT GROUP_CONCAT(JSON_OBJECT('name', k.CONSTRAINT_NAME, 'table', k.TABLE_NAME, 'column', k.COLUMN_NAME, 'position', k.ORDINAL_POSITION,
      'ref_table', k.REFERENCED_TABLE_NAME, 'ref_column', k.REFERENCED_COLUMN_NAME,
      'on_delete', (SELECT r.DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS r
                    WHERE r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.TABLE_NAME = k.TABLE_NAME AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME),
      'on_update', (SELECT r.UPDATE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS r
                    WHERE r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.TABLE_NAME = k.TABLE_NAME AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME)) SEPARATOR ',')
    FROM information_schema.KEY_COLUMN_USAGE k
    WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL), ''),
  '],"indexes":[', IFNULL((
    SELECT GROUP_CONCAT(JSON_OBJECT('table', s.TABLE_NAME, 'name', s.INDEX_NAME, 'unique', s.NON_UNIQUE = 0, 'type', s.INDEX_TYPE,
      'column', s.COLUMN_NAME, 'position', s.SEQ_IN_INDEX) SEPARATOR ',')
    FROM information_schema.STATISTICS s
    WHERE s.TABLE_SCHEMA = DATABASE() AND s.INDEX_NAME <> 'PRIMARY'), ''),
  '],"views":[', IFNULL((
    SELECT GROUP_CONCAT(JSON_OBJECT('name', v.TABLE_NAME, 'sql', v.VIEW_DEFINITION) SEPARATOR ',')
    FROM information_schema.VIEWS v
    WHERE v.TABLE_SCHEMA = DATABASE()), ''),
  '],"triggers":[', IFNULL((
    SELECT GROUP_CONCAT(JSON_OBJECT('name', g.TRIGGER_NAME, 'table', g.EVENT_OBJECT_TABLE, 'timing', g.ACTION_TIMING,
      'event', g.EVENT_MANIPULATION, 'body', g.ACTION_STATEMENT) SEPARATOR ',')
    FROM information_schema.TRIGGERS g
    WHERE g.TRIGGER_SCHEMA = DATABASE()), ''),
  ']}') AS joinscope;
