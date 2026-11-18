import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getPool, closePool } from '../database/pool.ts';

export async function runMigrations(): Promise<string[]> {
  const pool = getPool();
  const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied: string[] = [];
  for (const file of files) {
    const existing = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
    if (existing.rowCount && existing.rowCount > 0) {
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  return applied;
}

const isCli = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isCli) {
  runMigrations()
    .then(async (applied) => {
      console.log(
        applied.length > 0
          ? `[MyVet DB] Applied migrations: ${applied.join(', ')}`
          : '[MyVet DB] Database schema is already up to date.'
      );
      await closePool();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[MyVet DB Migration Failed]', err.message);
      await closePool().catch(() => {});
      process.exit(1);
    });
}
