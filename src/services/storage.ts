export const REFERENCE_DATE = new Date('2026-08-14T09:00:00');

export const LEGACY_STORAGE_KEYS = {
  V1_BLOB: 'vetosuite:data:v1',
  APPOINTMENTS: 'vetosuite_appointments',
  TASKS: 'vetosuite_tasks',
  PATIENTS: 'vetosuite_patients',
  CLIENTS: 'vetosuite_clients',
  COMMUNICATIONS: 'vetosuite_communications',
  VITALS: 'vetosuite_vitals',
  CONSULTATIONS: 'vetosuite_consultations',
  DOCUMENTS: 'vetosuite_documents',
  NOTES: 'vetosuite_notes',
  REMINDERS: 'vetosuite_reminders',
  TREATMENTS: 'vetosuite_treatments',
  STOCKS: 'vetosuite_stocks',
  VACCINATIONS: 'vetosuite_vaccinations',
} as const;

export interface LegacyLocalStorageSnapshot {
  hasAnyLegacyData: boolean;
  foundKeys: string[];
  clients: any[];
  patients: any[];
  appointments: any[];
  tasks: any[];
  stocks: any[];
  vaccinations: any[];
  consultations: any[];
  vitals: any[];
  notes: any[];
  documents: any[];
  treatments: any[];
  reminders: any[];
  communications: any[];
  legacyV1Blob: Record<string, unknown> | null;
}

function safeReadJson<T>(key: string): T | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Non-destructive inspector for existing browser localStorage keys (both vetosuite:data:v1 and vetosuite_*).
 * Never mutates or deletes localStorage so users can export backups and verify database counts first.
 */
export function inspectLegacyLocalStorage(): LegacyLocalStorageSnapshot {
  const foundKeys: string[] = [];
  const v1 = safeReadJson<Record<string, any>>(LEGACY_STORAGE_KEYS.V1_BLOB);
  if (v1) foundKeys.push(LEGACY_STORAGE_KEYS.V1_BLOB);

  const readArr = (key: string): any[] => {
    const val = safeReadJson<any>(key);
    if (Array.isArray(val) && val.length > 0) {
      foundKeys.push(key);
      return val;
    }
    return [];
  };

  const clients = readArr(LEGACY_STORAGE_KEYS.CLIENTS);
  const patients = readArr(LEGACY_STORAGE_KEYS.PATIENTS);
  const appointments = readArr(LEGACY_STORAGE_KEYS.APPOINTMENTS);
  const tasks = readArr(LEGACY_STORAGE_KEYS.TASKS);
  const stocks = readArr(LEGACY_STORAGE_KEYS.STOCKS);
  const vaccinations = readArr(LEGACY_STORAGE_KEYS.VACCINATIONS);
  const consultations = readArr(LEGACY_STORAGE_KEYS.CONSULTATIONS);
  const vitals = readArr(LEGACY_STORAGE_KEYS.VITALS);
  const notes = readArr(LEGACY_STORAGE_KEYS.NOTES);
  const documents = readArr(LEGACY_STORAGE_KEYS.DOCUMENTS);
  const treatments = readArr(LEGACY_STORAGE_KEYS.TREATMENTS);
  const reminders = readArr(LEGACY_STORAGE_KEYS.REMINDERS);
  const communications = readArr(LEGACY_STORAGE_KEYS.COMMUNICATIONS);

  // Merge vetosuite:data:v1 arrays if individual keys were empty
  const mergedClients = clients.length > 0 ? clients : Array.isArray(v1?.clients) ? v1.clients : [];
  const mergedPatients = patients.length > 0 ? patients : Array.isArray(v1?.patients) ? v1.patients : [];
  const mergedAppointments =
    appointments.length > 0 ? appointments : Array.isArray(v1?.appointments) ? v1.appointments : [];
  const mergedTasks = tasks.length > 0 ? tasks : Array.isArray(v1?.tasks) ? v1.tasks : [];
  const mergedStocks = stocks.length > 0 ? stocks : Array.isArray(v1?.stocks) ? v1.stocks : [];

  return {
    hasAnyLegacyData: foundKeys.length > 0,
    foundKeys,
    clients: mergedClients,
    patients: mergedPatients,
    appointments: mergedAppointments,
    tasks: mergedTasks,
    stocks: mergedStocks,
    vaccinations,
    consultations,
    vitals,
    notes,
    documents,
    treatments,
    reminders,
    communications,
    legacyV1Blob: v1,
  };
}

export function downloadLegacyLocalStorageBackup(): void {
  const snapshot = inspectLegacyLocalStorage();
  const payload = {
    exportedAt: new Date().toISOString(),
    application: 'MyVet',
    currency: 'DZD',
    snapshot,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `myvet-backup-localstorage-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
