import '../src/loadEnv';
import { Client } from 'pg';

type TableDependency = {
  table_name: string;
  depends_on: string | null;
};

const DEFAULT_LOCAL_DATABASE_URL =
  'postgresql://admin:adminpassword@127.0.0.1:5435/placement_db?schema=public';

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function getPublicTables(client: Client): Promise<string[]> {
  const result = await client.query<{ tablename: string }>(
    `
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename <> '_prisma_migrations'
      ORDER BY tablename;
    `
  );
  return result.rows.map((row: { tablename: string }) => row.tablename);
}

async function getDependencies(client: Client): Promise<TableDependency[]> {
  const result = await client.query<TableDependency>(
    `
      SELECT
        tc.table_name,
        ccu.table_name AS depends_on
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public';
    `
  );
  return result.rows;
}

function topologicalSortTables(tables: string[], deps: TableDependency[]): string[] {
  const tableSet = new Set(tables);
  const inDegree = new Map<string, number>();
  const graph = new Map<string, Set<string>>();

  for (const table of tables) {
    inDegree.set(table, 0);
    graph.set(table, new Set());
  }

  for (const dep of deps) {
    if (!dep.depends_on) continue;
    if (!tableSet.has(dep.table_name) || !tableSet.has(dep.depends_on)) continue;
    if (dep.table_name === dep.depends_on) continue;
    if (!graph.get(dep.depends_on)!.has(dep.table_name)) {
      graph.get(dep.depends_on)!.add(dep.table_name);
      inDegree.set(dep.table_name, (inDegree.get(dep.table_name) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [table, degree] of inDegree.entries()) {
    if (degree === 0) queue.push(table);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const next of graph.get(current) ?? []) {
      const nextDegree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextDegree);
      if (nextDegree === 0) queue.push(next);
    }
  }

  // For cycles (unlikely except unusual FK setups), append remaining tables.
  if (order.length < tables.length) {
    for (const table of tables) {
      if (!order.includes(table)) order.push(table);
    }
  }

  return order;
}

async function insertBatch(
  target: Client,
  table: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const quotedColumns = columns.map(quoteIdent).join(', ');

  const values: unknown[] = [];
  const valueChunks: string[] = [];
  let placeholder = 1;

  for (const row of rows) {
    const tuple: string[] = [];
    for (const column of columns) {
      values.push((row as Record<string, unknown>)[column]);
      tuple.push(`$${placeholder++}`);
    }
    valueChunks.push(`(${tuple.join(', ')})`);
  }

  const sql = `INSERT INTO ${quoteIdent(table)} (${quotedColumns}) VALUES ${valueChunks.join(', ')}`;
  await target.query(sql, values);
}

async function migrateTable(source: Client, target: Client, table: string): Promise<number> {
  const result = await source.query(`SELECT * FROM ${quoteIdent(table)}`);
  const rows = result.rows as Record<string, unknown>[];
  if (rows.length === 0) return 0;

  // User table has a self-reference (verifiedById -> User.id). Insert root rows first.
  if (table === 'User') {
    const noVerifier = rows.filter((row) => row.verifiedById == null);
    const withVerifier = rows.filter((row) => row.verifiedById != null);

    const chunkSize = 200;
    for (let i = 0; i < noVerifier.length; i += chunkSize) {
      await insertBatch(target, table, noVerifier.slice(i, i + chunkSize));
    }
    for (let i = 0; i < withVerifier.length; i += chunkSize) {
      await insertBatch(target, table, withVerifier.slice(i, i + chunkSize));
    }
    return rows.length;
  }

  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    await insertBatch(target, table, rows.slice(i, i + chunkSize));
  }
  return rows.length;
}

async function countRows(client: Client, tables: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const table of tables) {
    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${quoteIdent(table)}`
    );
    counts.set(table, Number(result.rows[0]?.count ?? '0'));
  }
  return counts;
}

async function main() {
  const sourceUrl = process.env.LOCAL_DATABASE_URL?.trim() || DEFAULT_LOCAL_DATABASE_URL;
  const targetUrl = process.env.DATABASE_URL?.trim();

  if (!targetUrl) {
    throw new Error('Missing DATABASE_URL for target Supabase database');
  }

  const targetUrlWithNoVerify = targetUrl.includes('?')
    ? `${targetUrl}&sslmode=no-verify`
    : `${targetUrl}?sslmode=no-verify`;

  const source = new Client({ connectionString: sourceUrl });
  const target = new Client({
    connectionString: targetUrlWithNoVerify,
  });

  await source.connect();
  await target.connect();

  try {
    const sourceTables = await getPublicTables(source);
    if (sourceTables.length === 0) {
      console.log('[migrate] No tables found in source database.');
      return;
    }

    const deps = await getDependencies(source);
    const orderedTables = topologicalSortTables(sourceTables, deps);

    console.log(`[migrate] Source tables: ${orderedTables.length}`);
    console.log(`[migrate] Order: ${orderedTables.join(', ')}`);

    // Clear destination first to avoid duplicates/conflicts.
    await target.query('BEGIN');
    await target.query(
      `TRUNCATE TABLE ${orderedTables.map((table) => quoteIdent(table)).join(', ')} RESTART IDENTITY CASCADE`
    );

    for (const table of orderedTables) {
      const inserted = await migrateTable(source, target, table);
      console.log(`[migrate] ${table}: ${inserted} rows`);
    }
    await target.query('COMMIT');

    const sourceCounts = await countRows(source, orderedTables);
    const targetCounts = await countRows(target, orderedTables);

    let mismatch = false;
    console.log('\n[migrate] Verification (source -> target):');
    for (const table of orderedTables) {
      const s = sourceCounts.get(table) ?? 0;
      const t = targetCounts.get(table) ?? 0;
      const ok = s === t;
      if (!ok) mismatch = true;
      console.log(`  - ${table}: ${s} -> ${t} ${ok ? 'OK' : 'MISMATCH'}`);
    }

    if (mismatch) {
      throw new Error('Row count verification failed for one or more tables.');
    }

    console.log('\n[migrate] Migration completed successfully.');
  } catch (error) {
    await target.query('ROLLBACK');
    throw error;
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((error) => {
  console.error('[migrate] Failed:', error);
  process.exit(1);
});
