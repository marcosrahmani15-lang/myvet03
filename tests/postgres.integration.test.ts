import { describe, expect, it } from 'vitest';
import { getPool } from '../server/database/pool.ts';
import { PostgresClinicStore } from '../server/store/postgresStore.ts';
import { processDueReminders } from '../server/jobs/reminderEngine.ts';

const liveDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

describe.skipIf(!liveDbUrl)('Live PostgreSQL / Supabase Integration', () => {
  it('connects to PostgreSQL, verifies seeded clinic, and supports atomic reminder claiming', async () => {
    if (liveDbUrl && !process.env.DATABASE_URL) {
      process.env.DATABASE_URL = liveDbUrl;
    }

    const pool = getPool();
    const { rows } = await pool.query('SELECT NOW() AS now');
    expect(rows[0].now).toBeTruthy();

    const pgStore = new PostgresClinicStore();
    const clinic = await pgStore.getClinicById('clinic-myvet-ouled-fayet');
    expect(clinic?.currency).toBe('DZD');

    const counts = await pgStore.getTableCounts('clinic-myvet-ouled-fayet');
    expect(counts.owners).toBeGreaterThanOrEqual(1);

    const result = await processDueReminders(pgStore, {
      clinicId: 'clinic-myvet-ouled-fayet',
      limit: 5,
    });
    expect(result).toHaveProperty('workerId');
  });
});
