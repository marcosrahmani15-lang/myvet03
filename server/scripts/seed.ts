import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getPool, closePool } from '../database/pool.ts';
import { runMigrations } from './migrate.ts';

export async function runSeed(): Promise<void> {
  await runMigrations();
  const pool = getPool();
  const seedsDir = path.resolve(process.cwd(), 'database', 'seeds');
  const files = fs
    .readdirSync(seedsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(seedsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
}

const isCli = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isCli) {
  runSeed()
    .then(async () => {
      console.log('[MyVet DB] Seed data applied idempotently.');
      await closePool();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[MyVet DB Seed Failed]', err.message);
      await closePool().catch(() => {});
      process.exit(1);
    });
}
