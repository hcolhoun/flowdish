-- Flowdish accesses application data through authenticated Next.js routes and Prisma.
-- Block direct Data API access to every public table, including tables added outside Prisma.
DO $$
DECLARE
  table_record RECORD;
  has_anon BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon');
  has_authenticated BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
BEGIN
  FOR table_record IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      table_record.schemaname,
      table_record.tablename
    );

    IF has_anon THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM anon',
        table_record.schemaname,
        table_record.tablename
      );
    END IF;

    IF has_authenticated THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM authenticated',
        table_record.schemaname,
        table_record.tablename
      );
    END IF;
  END LOOP;

  IF has_anon THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon';
  END IF;

  IF has_authenticated THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated';
  END IF;
END $$;
