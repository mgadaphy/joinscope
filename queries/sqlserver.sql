-- Joinscope catalogue query for SQL Server 2016+ and Azure SQL
--
-- Read-only: it reads the database's catalogue (sys views), never your data.
-- Run it on the database you want to explore, copy the one cell it returns, and paste
-- it into Joinscope (Import, "From a query").
--
-- SSMS copies at most 65,535 characters of a cell (Results to Text and Results to File
-- cut it shorter): enough for a few dozen tables. For a bigger database, run it with
-- sqlcmd, which prints the whole cell, or script the database instead (Generate Scripts):
--   sqlcmd -S server -d database -E -y 0 -f 65001 -i sqlserver.sql -o schema.json
-- (-E signs in as you; use -U user instead to be asked for a password. -f 65001 writes UTF-8.)

SET NOCOUNT ON;

SELECT (
  SELECT 'joinscope-catalogue' AS [format], 1 AS [version], 'sqlserver' AS [dialect], DB_NAME() AS [database],
    (SELECT s.name AS [schema], t.name AS [table],
        (SELECT SUM(p.rows) FROM sys.partitions p WHERE p.object_id = t.object_id AND p.index_id IN (0, 1)) AS [rows],
        CAST(ep.value AS nvarchar(max)) AS [comment]
      FROM sys.tables t
      JOIN sys.schemas s ON s.schema_id = t.schema_id
      LEFT JOIN sys.extended_properties ep ON ep.class = 1 AND ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
      WHERE t.is_ms_shipped = 0 AND t.name <> 'sysdiagrams'
      FOR JSON PATH) AS [tables],
    (SELECT s.name AS [schema], t.name AS [table], c.name AS [column], c.column_id AS [position],
        CASE
          WHEN ty.is_user_defined = 1 THEN ty.name
          WHEN ty.name IN ('varchar', 'char', 'varbinary', 'binary')
            THEN ty.name + '(' + CASE WHEN c.max_length = -1 THEN 'max' ELSE CAST(c.max_length AS varchar(10)) END + ')'
          WHEN ty.name IN ('nvarchar', 'nchar')
            THEN ty.name + '(' + CASE WHEN c.max_length = -1 THEN 'max' ELSE CAST(c.max_length / 2 AS varchar(10)) END + ')'
          WHEN ty.name IN ('decimal', 'numeric')
            THEN ty.name + '(' + CAST(c.precision AS varchar(10)) + ',' + CAST(c.scale AS varchar(10)) + ')'
          WHEN ty.name IN ('datetime2', 'time', 'datetimeoffset')
            THEN ty.name + '(' + CAST(c.scale AS varchar(10)) + ')'
          ELSE ty.name
        END AS [type],
        c.is_nullable AS [nullable], dc.definition AS [default], CAST(ep.value AS nvarchar(max)) AS [comment],
        c.is_identity AS [auto], c.is_computed AS [generated]
      FROM sys.columns c
      JOIN sys.tables t ON t.object_id = c.object_id
      JOIN sys.schemas s ON s.schema_id = t.schema_id
      JOIN sys.types ty ON ty.user_type_id = c.user_type_id
      LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
      LEFT JOIN sys.extended_properties ep ON ep.class = 1 AND ep.major_id = c.object_id AND ep.minor_id = c.column_id AND ep.name = 'MS_Description'
      WHERE t.is_ms_shipped = 0 AND t.name <> 'sysdiagrams'
      FOR JSON PATH) AS [columns],
    (SELECT s.name AS [schema], t.name AS [table], c.name AS [column], ic.key_ordinal AS [position]
      FROM sys.indexes i
      JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.key_ordinal > 0
      JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
      JOIN sys.tables t ON t.object_id = i.object_id
      JOIN sys.schemas s ON s.schema_id = t.schema_id
      WHERE i.is_primary_key = 1 AND t.is_ms_shipped = 0 AND t.name <> 'sysdiagrams'
      FOR JSON PATH) AS [primary_keys],
    (SELECT fk.name AS [name], s.name AS [schema], t.name AS [table], c.name AS [column], fkc.constraint_column_id AS [position],
        rs.name AS [ref_schema], rt.name AS [ref_table], rc.name AS [ref_column],
        fk.delete_referential_action_desc AS [on_delete], fk.update_referential_action_desc AS [on_update]
      FROM sys.foreign_keys fk
      JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
      JOIN sys.tables t ON t.object_id = fk.parent_object_id
      JOIN sys.schemas s ON s.schema_id = t.schema_id
      JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
      JOIN sys.tables rt ON rt.object_id = fk.referenced_object_id
      JOIN sys.schemas rs ON rs.schema_id = rt.schema_id
      JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
      WHERE t.is_ms_shipped = 0 AND t.name <> 'sysdiagrams'
      FOR JSON PATH) AS [foreign_keys],
    (SELECT s.name AS [schema], t.name AS [table], i.name AS [name], i.is_unique AS [unique], i.type_desc AS [type],
        i.has_filter AS [partial], c.name AS [column], ic.key_ordinal AS [position]
      FROM sys.indexes i
      JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.key_ordinal > 0
      JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
      JOIN sys.tables t ON t.object_id = i.object_id
      JOIN sys.schemas s ON s.schema_id = t.schema_id
      WHERE i.is_primary_key = 0 AND i.is_hypothetical = 0 AND i.type IN (1, 2, 4) AND t.is_ms_shipped = 0 AND t.name <> 'sysdiagrams'
      FOR JSON PATH) AS [indexes],
    (SELECT s.name AS [schema], v.name AS [name], OBJECT_DEFINITION(v.object_id) AS [sql]
      FROM sys.views v
      JOIN sys.schemas s ON s.schema_id = v.schema_id
      WHERE v.is_ms_shipped = 0
      FOR JSON PATH) AS [views],
    (SELECT s.name AS [schema], t.name AS [table], tr.name AS [name],
        CASE WHEN tr.is_instead_of_trigger = 1 THEN 'INSTEAD OF' ELSE 'AFTER' END AS [timing],
        STUFF((SELECT ' OR ' + te.type_desc FROM sys.trigger_events te WHERE te.object_id = tr.object_id ORDER BY te.type FOR XML PATH('')), 1, 4, '') AS [event],
        OBJECT_DEFINITION(tr.object_id) AS [body]
      FROM sys.triggers tr
      JOIN sys.tables t ON t.object_id = tr.parent_id
      JOIN sys.schemas s ON s.schema_id = t.schema_id
      WHERE tr.parent_class = 1 AND tr.is_ms_shipped = 0
      FOR JSON PATH) AS [triggers]
  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
) AS joinscope;
