-- Joinscope catalogue query for Oracle Database 18c+ (19c, 21c, 23ai, Autonomous Database)
--
-- Read-only: it reads the catalogue of the schema you are logged in as (the USER_ views),
-- never your data. Run it, copy the one cell it returns, and paste it into Joinscope
-- (Import, "From a query"). In SQL Developer, double-click the cell to see all of it.
-- In SQL*Plus or SQLcl, run this first so the whole result is printed:
--   SET LONG 100000000 LONGCHUNKSIZE 100000000 PAGESIZE 0 LINESIZE 32767 TRIMOUT OFF FEEDBACK OFF
-- A long result comes out on several lines; paste them all, Joinscope joins them again.
-- Row counts come from the optimizer statistics, so they are estimates (empty until
-- statistics have been gathered). Defaults, index expressions and view texts are kept by
-- Oracle as LONG values, which SQL cannot read: the three functions declared here read
-- them. They live only while the query runs; nothing is created in your database.
-- In SQL*Plus and SQLcl a query that declares functions ends with the / line below.

WITH
  FUNCTION js_default(t VARCHAR2, c VARCHAR2) RETURN VARCHAR2 IS
    v LONG;
  BEGIN
    SELECT data_default INTO v FROM user_tab_cols WHERE table_name = t AND column_name = c;
    RETURN SUBSTRB(v, 1, 4000);
  END;
  FUNCTION js_index_expression(i VARCHAR2, p NUMBER) RETURN VARCHAR2 IS
    v LONG;
  BEGIN
    SELECT column_expression INTO v FROM user_ind_expressions WHERE index_name = i AND column_position = p;
    RETURN SUBSTRB(v, 1, 4000);
  END;
  -- a view's whole text, up to the 32,760 bytes PL/SQL can hold (TEXT_VC stops at 4,000)
  FUNCTION js_view_text(n VARCHAR2) RETURN CLOB IS
    v LONG;
    len NUMBER;
  BEGIN
    SELECT text_length INTO len FROM user_views WHERE view_name = n;
    IF len > 32760 THEN
      SELECT text_vc INTO v FROM user_views WHERE view_name = n;
    ELSE
      SELECT text INTO v FROM user_views WHERE view_name = n;
    END IF;
    RETURN TO_CLOB(v);
  END;
SELECT JSON_OBJECT(
  'format' VALUE 'joinscope-catalogue',
  'version' VALUE 1,
  'dialect' VALUE 'oracle',
  'database' VALUE SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA'),
  'tables' VALUE (
    SELECT JSON_ARRAYAGG(JSON_OBJECT('table' VALUE t.table_name, 'rows' VALUE t.num_rows, 'comment' VALUE c.comments RETURNING CLOB) RETURNING CLOB)
    FROM user_tables t
    LEFT JOIN user_tab_comments c ON c.table_name = t.table_name
    WHERE t.dropped = 'NO' AND t.nested = 'NO' AND t.secondary = 'N' AND (t.iot_type IS NULL OR t.iot_type = 'IOT')
      AND t.table_name NOT IN (SELECT mview_name FROM user_mviews)
  ) FORMAT JSON,
  'columns' VALUE (
    SELECT JSON_ARRAYAGG(JSON_OBJECT(
      'table' VALUE k.table_name, 'column' VALUE k.column_name, 'position' VALUE k.column_id,
      'type' VALUE CASE
        WHEN k.data_type IN ('VARCHAR2', 'NVARCHAR2', 'CHAR', 'NCHAR') THEN k.data_type || '(' || k.char_length || ')'
        WHEN k.data_type = 'RAW' THEN 'RAW(' || k.data_length || ')'
        WHEN k.data_type = 'NUMBER' AND k.data_precision IS NOT NULL THEN 'NUMBER(' || k.data_precision || ',' || k.data_scale || ')'
        WHEN k.data_type = 'NUMBER' AND k.data_scale = 0 THEN 'NUMBER(*,0)'
        WHEN k.data_type = 'FLOAT' THEN 'FLOAT(' || k.data_precision || ')'
        ELSE k.data_type
      END,
      'nullable' VALUE CASE k.nullable WHEN 'Y' THEN 'true' ELSE 'false' END FORMAT JSON,
      'default' VALUE CASE WHEN k.default_length > 0 AND k.identity_column = 'NO' AND k.virtual_column = 'NO'
        THEN js_default(k.table_name, k.column_name) END,
      'auto' VALUE CASE k.identity_column WHEN 'YES' THEN 'true' ELSE 'false' END FORMAT JSON,
      'generated' VALUE CASE k.virtual_column WHEN 'YES' THEN 'true' ELSE 'false' END FORMAT JSON,
      'comment' VALUE cc.comments RETURNING CLOB) RETURNING CLOB)
    FROM user_tab_cols k
    JOIN user_tables t ON t.table_name = k.table_name
    LEFT JOIN user_col_comments cc ON cc.table_name = k.table_name AND cc.column_name = k.column_name
    WHERE k.hidden_column = 'NO' AND t.dropped = 'NO' AND t.nested = 'NO' AND t.secondary = 'N'
      AND (t.iot_type IS NULL OR t.iot_type = 'IOT') AND t.table_name NOT IN (SELECT mview_name FROM user_mviews)
  ) FORMAT JSON,
  'primary_keys' VALUE (
    SELECT JSON_ARRAYAGG(JSON_OBJECT('table' VALUE cc.table_name, 'column' VALUE cc.column_name, 'position' VALUE cc.position) RETURNING CLOB)
    FROM user_constraints c
    JOIN user_cons_columns cc ON cc.constraint_name = c.constraint_name
    WHERE c.constraint_type = 'P' AND c.table_name NOT LIKE 'BIN$%'
  ) FORMAT JSON,
  'foreign_keys' VALUE (
    SELECT JSON_ARRAYAGG(JSON_OBJECT(
      'name' VALUE c.constraint_name, 'table' VALUE cc.table_name, 'column' VALUE cc.column_name, 'position' VALUE cc.position,
      'ref_schema' VALUE CASE WHEN c.r_owner <> USER THEN c.r_owner END,
      'ref_table' VALUE rc.table_name, 'ref_column' VALUE rc.column_name,
      'on_delete' VALUE c.delete_rule, 'on_update' VALUE 'NO ACTION') RETURNING CLOB)
    FROM user_constraints c
    JOIN user_cons_columns cc ON cc.constraint_name = c.constraint_name
    JOIN all_cons_columns rc ON rc.owner = c.r_owner AND rc.constraint_name = c.r_constraint_name AND rc.position = cc.position
    WHERE c.constraint_type = 'R' AND c.table_name NOT LIKE 'BIN$%'
  ) FORMAT JSON,
  'indexes' VALUE (
    SELECT JSON_ARRAYAGG(JSON_OBJECT(
      'table' VALUE i.table_name, 'name' VALUE i.index_name,
      'unique' VALUE CASE i.uniqueness WHEN 'UNIQUE' THEN 'true' ELSE 'false' END FORMAT JSON,
      'type' VALUE i.index_type, 'position' VALUE ic.column_position,
      -- a function-based index names a hidden column; the expression is what it indexes
      'column' VALUE CASE WHEN i.index_type LIKE 'FUNCTION-BASED%' AND ic.column_name LIKE 'SYS\_NC%$' ESCAPE '\'
        THEN js_index_expression(i.index_name, ic.column_position) ELSE ic.column_name END RETURNING CLOB) RETURNING CLOB)
    FROM user_indexes i
    JOIN user_ind_columns ic ON ic.index_name = i.index_name
    WHERE i.index_type NOT IN ('LOB', 'IOT - TOP') AND i.table_type = 'TABLE' AND i.table_name NOT LIKE 'BIN$%'
      AND i.index_name NOT IN (SELECT index_name FROM user_constraints WHERE constraint_type = 'P' AND index_name IS NOT NULL)
  ) FORMAT JSON,
  'views' VALUE (
    SELECT JSON_ARRAYAGG(JSON_OBJECT('name' VALUE v.view_name, 'sql' VALUE js_view_text(v.view_name) RETURNING CLOB) RETURNING CLOB)
    FROM user_views v
  ) FORMAT JSON,
  'triggers' VALUE (
    SELECT JSON_ARRAYAGG(JSON_OBJECT(
      'name' VALUE g.trigger_name, 'table' VALUE g.table_name,
      'timing' VALUE REGEXP_SUBSTR(g.trigger_type, '^(BEFORE|AFTER|INSTEAD OF)'), 'event' VALUE g.triggering_event) RETURNING CLOB)
    FROM user_triggers g
    WHERE g.base_object_type = 'TABLE' AND g.table_name NOT LIKE 'BIN$%'
  ) FORMAT JSON
  RETURNING CLOB) AS joinscope
FROM dual
/
