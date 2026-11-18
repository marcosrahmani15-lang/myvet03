export type UserRole =
  | 'super_admin'
  | 'clinic_admin'
  | 'veterinarian'
  | 'receptionist'
  | 'assistant';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  fullName: string;
  avatarInitials: string;
}

export interface Clinic {
  id: string;
  name: string;
  slug: string;
  slogan: string;
  address: string;
  phone: string;
  email?: string;
  timezone: string;
  currency: 'DZD';
}

export interface ClinicMembership {
  clinicId: string;
  clinicName: string;
  clinicSlug: string;
  role: UserRole;
  title?: string;
  isDefault: boolean;
}

export interface ClinicSession {
  authenticated: boolean;
  isDevAutoLogin: boolean;
  user: AuthUser | null;
  activeClinic: Clinic | null;
  activeRole: UserRole | null;
  memberships: ClinicMembership[];
}

export type AppointmentType = 'Urgence' | 'Consultation' | 'Vaccin' | 'Contrôle';
export type AppointmentStatus = 'Confirmé' | 'En attente' | 'Terminé' | 'Annulé' | 'Manqué';

export interface Appointment {
  id: string;
  clinicId?: string;
  patientId: string;
  patientName: string;
  clientId: string;
  clientName: string;
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  type: AppointmentType;
  reason: string;
  veterinarian: string;
  status: AppointmentStatus;
  notes?: string;
}

export type TaskPriority = 'Normale' | 'Haute' | 'Urgente';
export type TaskCategory = 'Médicale' | 'Administrative';
export type TeamMember = string;

export interface TaskComment {
  id: string;
  author: string;
  avatar: string;
  text: string;
  date: string;
}

export interface Task {
  id: string;
  clinicId?: string;
  title: string;
  description: string;
  priority: TaskPriority;
  category: TaskCategory;
  assignedTo: TeamMember;
  createdBy: string;
  dueDate: string;
  dueDateFormatted: string;
  completed: boolean;
  comments: TaskComment[];
  relatedPatientId?: string;
  boxNumber?: string;
}

export interface MedicalAlert {
  id: string;
  type: string;
  badge: string;
  description: string;
}

export interface Patient {
  id: string;
  clinicId?: string;
  name: string;
  species: 'Chat' | 'Chien' | 'Autre';
  breed: string;
  color: string;
  gender: 'Femelle' | 'Mâle';
  birthDate: string;
  age: string;
  weight: string;
  microchip: string;
  ownerId: string;
  ownerName: string;
  ownerPhone: string;
  veterinarian: string;
  nextVisit: string;
  status: 'Actif' | 'Inactif';
  avatarEmoji?: string;
  medicalAlerts: MedicalAlert[];
  medicalNotes?: string;
  archivedAt?: string | null;
}

export interface Client {
  id: string;
  clinicId?: string;
  name: string;
  phone: string;
  phoneNormalized?: string;
  email: string;
  address: string;
  preferredLanguage?: 'fr' | 'ar';
  smsConsent?: boolean;
  notes?: string;
  animalsCount: number;
  archivedAt?: string | null;
}

export interface Communication {
  id: string;
  patientId: string;
  channel: 'WhatsApp' | 'SMS' | 'Email';
  date: string;
  recipient: string;
  message: string;
}

export interface VitalSign {
  id: string;
  patientId: string;
  date: string;
  weight: string;
  temperature: string;
  heartRate: string;
  notes?: string;
}

export interface MedicalConsultation {
  id: string;
  patientId: string;
  date: string;
  veterinarian: string;
  type: string;
  diagnosis: string;
  treatment: string;
  notes: string;
}

export interface PatientDocument {
  id: string;
  patientId: string;
  name: string;
  type: string;
  uploadDate: string;
  size: string;
}

export interface PatientNote {
  id: string;
  patientId: string;
  date: string;
  author: string;
  content: string;
}

export interface PatientReminder {
  id: string;
  patientId: string;
  date: string;
  title: string;
  completed: boolean;
}

export interface PatientTreatment {
  id: string;
  patientId: string;
  name: string;
  medication: string;
  dosage: string;
  frequency: string;
  startDate: string;
  endDate: string;
  instructions: string;
  status: 'En cours' | 'Terminé' | 'Suspendu';
}

export interface StockItem {
  id: string;
  clinicId?: string;
  name: string;
  category: 'Vaccin' | 'Antibiotique' | 'Anti-inflammatoire' | 'Matériel' | 'Alimentation';
  supplier: string;
  quantity: number;
  minThreshold: number;
  unit: string;
  unitPriceDzd?: number;
  status: 'Normal' | 'Critique' | 'Commande en cours';
}

export interface InventoryMovement {
  id: string;
  itemId: string;
  itemName?: string;
  delta: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: string;
  performedBy: string;
  createdAt: string;
}

export interface VaccinationRecord {
  id: string;
  animalId: string;
  animalName?: string;
  ownerId: string;
  ownerName?: string;
  vaccineName: string;
  administeredDate: string;
  nextDueDate: string;
  lotNumber?: string;
  veterinarian: string;
  notes?: string;
  status: 'Effectué' | 'À planifier' | 'En retard';
}

export interface InvoiceItemInput {
  id?: string;
  description: string;
  quantity: number;
  unitPriceDzd: number;
  lineTotalDzd?: number;
}

export type InvoiceStatus = 'Payée' | 'Partielle' | 'En attente' | 'Devis' | 'Annulée';
export type PaymentMethod = 'Espèces' | 'Carte Bancaire' | 'Chèque / Virement';

export interface Invoice {
  id: string;
  clinicId?: string;
  number: string;
  ownerId?: string | null;
  clientName: string;
  animalId?: string | null;
  patientName: string;
  issueDate: string; // YYYY-MM-DD
  dateFormatted: string; // DD/MM/YYYY
  currency: 'DZD';
  subtotalDzd: number;
  taxDzd: number;
  amountDzd: number;
  paidDzd: number;
  status: InvoiceStatus;
  paymentMethod?: PaymentMethod;
  notes?: string;
  items: InvoiceItemInput[];
  createdAt?: string;
}

export interface CashJournalEntry {
  id: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  time: string;
  paidAt: string;
  clientName: string;
  patientName: string;
  description: string;
  paymentMethod: PaymentMethod;
  amountDzd: number;
  currency: 'DZD';
  recordedBy: string;
}

export interface CashClosingSummary {
  date: string;
  currency: 'DZD';
  cbDzd: number;
  cashDzd: number;
  checkTransferDzd: number;
  totalDzd: number;
  expectedDzd: number;
  varianceDzd: number;
  isClosed: boolean;
  closedAt?: string | null;
  operatorName?: string | null;
  notes?: string | null;
  entries: CashJournalEntry[];
  history: Array<{
    id: string;
    closingDate: string;
    totalDzd: number;
    varianceDzd: number;
    operatorName: string;
    closedAt: string;
  }>;
}

export type HospitalizationStatus = 'Critique' | 'Stable' | 'En convalescence' | 'Sorti' | 'Disponible';

export interface HospitalizationCareLog {
  id: string;
  timestamp: string;
  note: string;
  author: string;
}

export interface HospitalizationBox {
  id: string;
  boxCode: string;
  animalId?: string | null;
  patientName: string;
  species: string;
  breed: string;
  ownerId?: string | null;
  ownerName: string;
  admissionDate: string;
  reason: string;
  veterinarian: string;
  status: HospitalizationStatus;
  diet: string;
  lastCare: string;
  careLogs?: HospitalizationCareLog[];
}

export type SmsDeliveryStatus =
  | 'Scheduled'
  | 'Processing'
  | 'Accepted'
  | 'Sent'
  | 'Delivered'
  | 'Failed'
  | 'Cancelled'
  | 'Unknown';

export interface SmsReminder {
  id: string;
  owner_id: string;
  owner_name?: string;
  owner_phone?: string;
  phone_normalized?: string;
  animal_id: string;
  animal_name?: string;
  species?: string;
  reminder_type: string;
  scheduled_at: string;
  status: SmsDeliveryStatus;
  idempotency_key: string;
  attempts?: number;
  last_error?: string | null;
  sent_at?: string | null;
  is_simulated?: boolean;
}

export interface SmsLog {
  id: string;
  reminder_id?: string | null;
  recipient_name: string;
  recipient_phone: string;
  animal_name?: string | null;
  category: string;
  message_content: string;
  encoding: string;
  segment_count: number;
  status: string;
  is_simulated?: boolean;
  provider_name?: string | null;
  provider_message_id?: string | null;
  provider_response?: string | null;
  created_at: string;
}

export interface SmsTemplate {
  id: string;
  category: 'VACCINATION' | 'APPOINTMENT' | 'POST_OP' | 'URGENCE';
  title: string;
  content: string;
  language: 'fr' | 'ar';
  is_default?: boolean;
}

export interface SmsConfig {
  id?: string;
  clinic_id?: string;
  provider_mode: 'TEST' | 'PRODUCTION';
  smsProviderMode?: 'test' | 'live';
  active_provider: string;
  api_key_configured: boolean;
  smsApiUrl?: string;
  smsApiKey?: string;
  smsApiKeyMasked?: string;
  smsSenderId?: string;
  simPlanLabel?: string;
  enable_vaccination_reminders: boolean;
  vaccination_intervals: string;
  enable_appointment_reminders: boolean;
  appointment_interval_hours: number;
  sending_start_hour: number;
  sending_end_hour: number;
  timezone: string;
}

export interface ReportsOverview {
  consultationsCount: number;
  newPatientsCount: number;
  vaccinationCompletionRate: number;
  monthlyRevenueDzd: number;
  speciesBreakdown: Array<{ label: string; count: number; percentage: number }>;
  actTypeBreakdown: Array<{ label: string; count: number; percentage: number }>;
}

export interface MigrationReport {
  batchHash: string;
  dryRun: boolean;
  alreadyImported: boolean;
  summary: {
    importedOwners: number;
    skippedOwners: number;
    importedAnimals: number;
    skippedAnimals: number;
    importedAppointments: number;
    skippedAppointments: number;
    importedTasks: number;
    skippedTasks: number;
    importedStocks: number;
    skippedStocks: number;
    importedVaccinations: number;
    skippedVaccinations: number;
    importedMedicalRecords: number;
    skippedMedicalRecords: number;
    importedInvoices: number;
    skippedInvoices: number;
  };
  warnings: string[];
  databaseCounts: Record<string, number>;
}
