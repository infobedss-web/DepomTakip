import 'dotenv/config';
import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://depomtakip:depomtakip_local@127.0.0.1:55432/depomtakip',
});
export async function transaction<T>(fn: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await fn(db);
    await db.query('COMMIT');
    return result;
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  } finally {
    db.release();
  }
}
export async function migrate() {
  const db = await pool.connect();
  try {
    // Session lock survives legacy files that own their transaction (including 018).
    await db.query('SELECT pg_advisory_lock(982341)');
    const directory = fileURLToPath(new URL('../../database/', import.meta.url));
    const exists = await db.query("SELECT to_regclass('public.schema_versions') as table_name");
    const version = exists.rows[0].table_name
      ? Number((await db.query('SELECT max(version) version FROM schema_versions')).rows[0].version)
      : 0;
    for (const file of (await readdir(directory)).filter((f) => /^\d+.*\.sql$/.test(f)).sort()) {
      const next = Number(file.split('_')[0]);
      if (next <= version) continue;
      const sql = await readFile(directory + file, 'utf8');
      const ownsTransaction = /^\s*BEGIN\s*;/im.test(sql);
      if (next >= 19 && /^\s*(?:BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION)\s*;/im.test(sql))
        throw new Error('Migration 019+ transactions belong to the runner.');
      try {
        if (!ownsTransaction) await db.query('BEGIN');
        await db.query(sql);
        if (!ownsTransaction) await db.query('COMMIT');
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
    }
    console.log('DepomTakip şeması güncel.');
  } finally {
    try {
      await db.query('SELECT pg_advisory_unlock(982341)');
    } finally {
      db.release();
    }
  }
}


