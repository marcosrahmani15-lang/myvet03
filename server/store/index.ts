import { getServerEnv } from '../config/env.ts';
import { DatabaseUnavailableError, isDatabaseConfigured } from '../database/pool.ts';
import { MemoryClinicStore } from './memoryStore.ts';
import { PostgresClinicStore } from './postgresStore.ts';
import type { ClinicStore } from './types.ts';

let postgresInstance: PostgresClinicStore | null = null;
let devSandboxInstance: MemoryClinicStore | null = null;

export function getClinicStore(): ClinicStore {
  const env = getServerEnv();

  if (isDatabaseConfigured()) {
    if (!postgresInstance) {
      postgresInstance = new PostgresClinicStore();
    }
    return postgresInstance;
  }

  // Production must NEVER silently fall back to memory
  if (env.isProduction) {
    throw new DatabaseUnavailableError(
      'Base de données PostgreSQL requise en production (DATABASE_URL manquant).'
    );
  }

  if (!devSandboxInstance) {
    console.warn(
      '[MyVet Dev Sandbox] DATABASE_URL non configuré — utilisation du store sandbox local (non-production uniquement).'
    );
    devSandboxInstance = new MemoryClinicStore();
  }
  return devSandboxInstance;
}

export function resetDevSandboxStoreForTests(): MemoryClinicStore {
  devSandboxInstance = new MemoryClinicStore();
  return devSandboxInstance;
}

export function setTestClinicStore(store: ClinicStore): void {
  if (store instanceof MemoryClinicStore) {
    devSandboxInstance = store;
  }
}

export type { ClinicStore, ClaimedReminder } from './types.ts';
