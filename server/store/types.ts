import type {
  Appointment,
  AuthUser,
  CashClosingSummary,
  Client,
  Clinic,
  ClinicMembership,
  HospitalizationBox,
  InventoryMovement,
  Invoice,
  MigrationReport,
  Patient,
  ReportsOverview,
  SmsConfig,
  SmsDeliveryStatus,
  SmsLog,
  SmsReminder,
  SmsTemplate,
  StockItem,
  Task,
  VaccinationRecord,
} from '../../shared/types/domain.ts';

export interface ClaimedReminder extends SmsReminder {
  clinic_id: string;
  preferred_language: 'fr' | 'ar';
  sms_consent: boolean;
  vaccination_id?: string | null;
  appointment_id?: string | null;
  vaccine_name?: string | null;
  due_date?: string | null;
  appointment_date?: string | null;
  appointment_time?: string | null;
  owner_email?: string | null;
}

export interface ClinicStore {
  readonly engineName: 'PostgreSQL (Supabase)' | 'DevSandboxStore (Non-Production)';
  readonly isPostgres: boolean;

  // Auth & Tenant
  findUserByIdentifier(
    identifier: string
  ): Promise<(AuthUser & { passwordHash: string; isActive: boolean }) | null>;
  findUserById(userId: string): Promise<(AuthUser & { isActive: boolean }) | null>;
  getUserMemberships(userId: string): Promise<ClinicMembership[]>;
  getClinicById(clinicId: string): Promise<Clinic | null>;
  updateClinic(clinicId: string, data: Partial<Clinic>): Promise<Clinic>;
  checkAndRecordLoginAttempt(
    key: string,
    maxAttempts: number,
    windowMs: number,
    lockMs: number
  ): Promise<{ allowed: boolean; retryAfterSec?: number }>;
  clearLoginAttempts(key: string): Promise<void>;

  // Owners / Clients
  listOwners(clinicId: string, includeArchived?: boolean): Promise<Client[]>;
  getOwnerById(clinicId: string, id: string): Promise<Client | null>;
  createOwner(clinicId: string, input: any): Promise<Client>;
  updateOwner(clinicId: string, id: string, updates: any): Promise<Client | null>;
  archiveOrDeleteOwner(
    clinicId: string,
    id: string
  ): Promise<{ action: 'deleted' | 'archived'; reason?: string } | null>;

  // Animals / Patients
  listAnimals(clinicId: string, includeArchived?: boolean): Promise<Patient[]>;
  getAnimalById(clinicId: string, id: string): Promise<Patient | null>;
  createAnimal(clinicId: string, input: any): Promise<Patient>;
  updateAnimal(clinicId: string, id: string, updates: any): Promise<Patient | null>;
  archiveOrDeleteAnimal(
    clinicId: string,
    id: string
  ): Promise<{ action: 'deleted' | 'archived'; reason?: string } | null>;

  // Medical Records
  listMedicalRecords(clinicId: string, animalId?: string): Promise<any[]>;
  createMedicalRecord(clinicId: string, input: any): Promise<any>;
  toggleMedicalReminder(clinicId: string, id: string): Promise<any | null>;
  deleteMedicalDocument(clinicId: string, id: string): Promise<boolean>;

  // Vaccinations
  listVaccinations(clinicId: string, animalId?: string): Promise<VaccinationRecord[]>;
  getVaccinationById(clinicId: string, id: string): Promise<VaccinationRecord | null>;
  createVaccination(clinicId: string, input: any): Promise<VaccinationRecord>;
  updateVaccination(clinicId: string, id: string, updates: any): Promise<VaccinationRecord | null>;
  deleteVaccination(clinicId: string, id: string): Promise<boolean>;

  // Appointments
  listAppointments(clinicId: string): Promise<Appointment[]>;
  getAppointmentById(clinicId: string, id: string): Promise<Appointment | null>;
  createAppointment(clinicId: string, input: any): Promise<Appointment>;
  updateAppointment(clinicId: string, id: string, updates: any): Promise<Appointment | null>;
  deleteAppointment(clinicId: string, id: string): Promise<boolean>;

  // Tasks
  listTasks(clinicId: string): Promise<Task[]>;
  createTask(clinicId: string, input: any): Promise<Task>;
  updateTask(clinicId: string, id: string, updates: any): Promise<Task | null>;
  addTaskComment(
    clinicId: string,
    taskId: string,
    comment: { author: string; avatar: string; text: string; date: string }
  ): Promise<Task | null>;
  deleteTask(clinicId: string, id: string): Promise<boolean>;

  // Inventory
  listStocks(clinicId: string): Promise<StockItem[]>;
  listInventoryMovements(clinicId: string, itemId?: string): Promise<InventoryMovement[]>;
  createStock(clinicId: string, input: any): Promise<StockItem>;
  adjustStock(clinicId: string, id: string, updates: any): Promise<StockItem | null>;

  // Finance (DZD)
  listInvoices(clinicId: string): Promise<Invoice[]>;
  createInvoice(clinicId: string, input: any, createdBy: string): Promise<Invoice>;
  updateInvoice(clinicId: string, id: string, updates: any, recordedBy: string): Promise<Invoice | null>;
  getCashClosingSummary(clinicId: string, date: string): Promise<CashClosingSummary>;
  closeCashDay(
    clinicId: string,
    input: {
      closingDate: string;
      countedCashDzd?: number;
      countedCbDzd?: number;
      countedCheckTransferDzd?: number;
      notes?: string;
      operatorName: string;
    }
  ): Promise<CashClosingSummary>;

  // Hospitalization
  listHospitalizations(clinicId: string): Promise<HospitalizationBox[]>;
  createHospitalization(clinicId: string, input: any): Promise<HospitalizationBox>;
  updateHospitalization(
    clinicId: string,
    id: string,
    updates: any,
    author: string
  ): Promise<HospitalizationBox | null>;

  // Reports
  getReportsOverview(clinicId: string): Promise<ReportsOverview>;

  // SMS
  getSmsConfig(clinicId: string): Promise<SmsConfig>;
  updateSmsConfig(clinicId: string, updates: Partial<SmsConfig>): Promise<SmsConfig>;
  listSmsTemplates(clinicId: string): Promise<SmsTemplate[]>;
  upsertSmsTemplate(clinicId: string, input: any): Promise<SmsTemplate>;
  listSmsReminders(clinicId: string): Promise<SmsReminder[]>;
  getSmsReminderById(clinicId: string, id: string): Promise<ClaimedReminder | null>;
  scheduleReminders(
    clinicId: string,
    reminders: Array<{
      id?: string;
      ownerId: string;
      animalId: string;
      vaccinationId?: string | null;
      appointmentId?: string | null;
      reminderType: string;
      scheduledAt: string;
      idempotencyKey: string;
    }>
  ): Promise<number>;
  cancelPendingRemindersForTarget(
    clinicId: string,
    target: { vaccinationId?: string; appointmentId?: string }
  ): Promise<number>;
  claimDueReminders(
    workerId: string,
    limit: number,
    now: Date,
    clinicId?: string
  ): Promise<ClaimedReminder[]>;
  updateReminderDispatchState(
    id: string,
    patch: {
      status: SmsDeliveryStatus;
      attempts?: number;
      scheduledAt?: string;
      lockedAt?: string | null;
      leaseExpiresAt?: string | null;
      workerId?: string | null;
      providerId?: string | null;
      providerMessageId?: string | null;
      failureType?: string | null;
      isAmbiguous?: boolean;
      isSimulated?: boolean;
      lastError?: string | null;
      sentAt?: string | null;
      deliveredAt?: string | null;
    }
  ): Promise<void>;
  listSmsLogs(clinicId: string): Promise<SmsLog[]>;
  createSmsLog(clinicId: string, log: Omit<SmsLog, 'id' | 'created_at'>): Promise<SmsLog>;
  updateSmsStatusByProviderMessageId(
    providerMessageId: string,
    status: SmsDeliveryStatus,
    errorDetail?: string,
    rawPayload?: Record<string, unknown>
  ): Promise<boolean>;

  // Audit & Migration
  writeAuditLog(
    clinicId: string,
    entry: {
      userId?: string;
      userName: string;
      action: string;
      entityType: string;
      entityId?: string;
      details?: Record<string, unknown>;
    }
  ): Promise<void>;
  getTableCounts(clinicId: string): Promise<Record<string, number>>;
  runMigration(clinicId: string, payload: any, importedBy: string): Promise<MigrationReport>;
}
