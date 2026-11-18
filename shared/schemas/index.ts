import { z } from 'zod';
import { normalizeAlgerianPhone } from '../utils/phone.ts';

export const algerianPhoneSchema = z
  .string()
  .trim()
  .min(8, 'Numéro de téléphone invalide')
  .max(32, 'Numéro de téléphone trop long')
  .refine((val) => normalizeAlgerianPhone(val).isValid, {
    message: 'Numéro algérien invalide (formats acceptés : 05/06/07 XX XX XX XX ou +213...)',
  });

export const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date attendu : YYYY-MM-DD');

export const timeHHMMSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format horaire attendu : HH:MM');

// Auth Schemas
export const loginSchema = z.object({
  identifier: z.string().trim().min(2, 'Email ou identifiant requis').max(255),
  password: z.string().min(4, 'Mot de passe requis').max(256),
  clinicId: z.string().trim().max(64).optional(),
});

export const switchClinicSchema = z.object({
  clinicId: z.string().trim().min(1).max(64),
});

export const clinicUpdateSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  slogan: z.string().trim().max(255).optional(),
  address: z.string().trim().max(500).optional(),
  phone: z.string().trim().min(6).max(64).optional(),
  email: z.string().trim().email().or(z.literal('')).optional(),
});

// Owners / Clients
export const ownerCreateSchema = z.object({
  id: z.string().trim().max(64).optional(),
  name: z.string().trim().min(2, 'Le nom du propriétaire est requis').max(255),
  phone: algerianPhoneSchema,
  email: z.string().trim().email('Email invalide').or(z.literal('')).optional().default(''),
  address: z.string().trim().max(500).optional().default(''),
  preferredLanguage: z.enum(['fr', 'ar']).optional().default('fr'),
  smsConsent: z.boolean().optional().default(true),
  notes: z.string().trim().max(2000).optional().default(''),
});

export const ownerUpdateSchema = ownerCreateSchema.partial();

// Animals / Patients
export const medicalAlertSchema = z.object({
  id: z.string().trim().min(1).max(64),
  type: z.string().trim().min(1).max(64),
  badge: z.string().trim().min(1).max(32),
  description: z.string().trim().min(1).max(500),
});

export const animalCreateSchema = z.object({
  id: z.string().trim().max(64).optional(),
  name: z.string().trim().min(1, 'Le nom de l’animal est requis').max(255),
  species: z.enum(['Chat', 'Chien', 'Autre']),
  breed: z.string().trim().max(128).optional().default('Croisé'),
  color: z.string().trim().max(128).optional().default('—'),
  gender: z.enum(['Femelle', 'Mâle']).optional().default('Femelle'),
  birthDate: z.string().trim().max(64).optional().default('—'),
  age: z.string().trim().max(64).optional().default('—'),
  weight: z.string().trim().max(64).optional().default('—'),
  microchip: z.string().trim().max(128).optional().default('—'),
  ownerId: z.string().trim().min(1, 'Propriétaire requis').max(64),
  veterinarian: z.string().trim().max(128).optional().default('Dr. Vétérinaire'),
  nextVisit: z.string().trim().max(255).optional().default('Aucune visite planifiée'),
  status: z.enum(['Actif', 'Inactif']).optional().default('Actif'),
  avatarEmoji: z.string().trim().max(16).optional(),
  medicalAlerts: z.array(medicalAlertSchema).optional().default([]),
  medicalNotes: z.string().trim().max(2000).optional().default(''),
});

export const animalUpdateSchema = animalCreateSchema.partial();

// Vaccinations
export const vaccinationCreateSchema = z.object({
  animalId: z.string().trim().min(1, 'Animal requis').max(64),
  ownerId: z.string().trim().max(64).optional(),
  vaccineName: z.string().trim().min(2, 'Nom du vaccin requis').max(255),
  administeredDate: isoDateSchema,
  nextDueDate: isoDateSchema,
  lotNumber: z.string().trim().max(128).optional().default(''),
  veterinarian: z.string().trim().min(2).max(128).optional().default('Dr. Vétérinaire'),
  notes: z.string().trim().max(2000).optional().default(''),
  status: z.enum(['Effectué', 'À planifier', 'En retard']).optional().default('Effectué'),
});

export const vaccinationUpdateSchema = vaccinationCreateSchema.partial();

// Appointments
export const appointmentCreateSchema = z
  .object({
    id: z.string().trim().max(64).optional(),
    patientId: z.string().trim().min(1, 'Patient requis').max(64),
    patientName: z.string().trim().max(255).optional(),
    clientId: z.string().trim().max(64).optional(),
    clientName: z.string().trim().max(255).optional(),
    date: isoDateSchema,
    startTime: timeHHMMSchema,
    endTime: timeHHMMSchema,
    type: z.enum(['Urgence', 'Consultation', 'Vaccin', 'Contrôle']),
    reason: z.string().trim().min(2, 'Motif requis').max(500),
    veterinarian: z.string().trim().min(2).max(128),
    status: z.enum(['Confirmé', 'En attente', 'Terminé', 'Annulé', 'Manqué']).optional().default('Confirmé'),
    notes: z.string().trim().max(2000).optional().default(''),
  })
  .refine((val) => val.endTime > val.startTime, {
    message: "L'heure de fin doit être postérieure à l'heure de début",
    path: ['endTime'],
  });

export const appointmentUpdateSchema = z
  .object({
    patientId: z.string().trim().min(1).max(64).optional(),
    patientName: z.string().trim().max(255).optional(),
    clientId: z.string().trim().max(64).optional(),
    clientName: z.string().trim().max(255).optional(),
    date: isoDateSchema.optional(),
    startTime: timeHHMMSchema.optional(),
    endTime: timeHHMMSchema.optional(),
    type: z.enum(['Urgence', 'Consultation', 'Vaccin', 'Contrôle']).optional(),
    reason: z.string().trim().min(2).max(500).optional(),
    veterinarian: z.string().trim().min(2).max(128).optional(),
    status: z.enum(['Confirmé', 'En attente', 'Terminé', 'Annulé', 'Manqué']).optional(),
    notes: z.string().trim().max(2000).optional(),
  });

// Medical Records (Consultation, Vital, Note, Document, Treatment, Reminder, Communication)
export const medicalRecordCreateSchema = z.object({
  animalId: z.string().trim().min(1).max(64),
  recordType: z.enum(['consultation', 'vital', 'note', 'document', 'treatment', 'reminder', 'communication']),
  recordedAt: z.string().trim().max(64).optional(),
  author: z.string().trim().max(128).optional(),
  title: z.string().trim().max(255).optional(),
  payload: z.record(z.string(), z.unknown()),
});

export const medicalRecordToggleSchema = z.object({
  completed: z.boolean().optional(),
});

// Tasks
export const taskCreateSchema = z.object({
  id: z.string().trim().max(64).optional(),
  title: z.string().trim().min(2, 'Titre de la tâche requis').max(255),
  description: z.string().trim().max(2000).optional().default(''),
  priority: z.enum(['Normale', 'Haute', 'Urgente']).optional().default('Normale'),
  category: z.enum(['Médicale', 'Administrative']).optional().default('Médicale'),
  assignedTo: z.string().trim().min(2).max(128),
  createdBy: z.string().trim().max(128).optional(),
  dueDate: isoDateSchema,
  dueDateFormatted: z.string().trim().max(64).optional(),
  relatedPatientId: z.string().trim().max(64).optional(),
  boxNumber: z.string().trim().max(32).optional(),
});

export const taskUpdateSchema = taskCreateSchema
  .partial()
  .extend({
    completed: z.boolean().optional(),
    commentText: z.string().trim().min(1).max(1000).optional(),
  });

// Inventory
export const inventoryCreateSchema = z.object({
  name: z.string().trim().min(2, 'Nom du produit requis').max(255),
  category: z.enum(['Vaccin', 'Antibiotique', 'Anti-inflammatoire', 'Matériel', 'Alimentation']),
  supplier: z.string().trim().max(255).optional().default('Fournisseur local'),
  quantity: z.number().int().min(0).max(1000000),
  minThreshold: z.number().int().min(0).max(1000000),
  unit: z.string().trim().min(1).max(32).optional().default('unités'),
  unitPriceDzd: z.number().min(0).max(100000000).optional().default(0),
});

export const inventoryUpdateSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  category: z.enum(['Vaccin', 'Antibiotique', 'Anti-inflammatoire', 'Matériel', 'Alimentation']).optional(),
  supplier: z.string().trim().max(255).optional(),
  quantity: z.number().int().min(0).max(1000000).optional(),
  delta: z.number().int().min(-100000).max(100000).optional(),
  reason: z.string().trim().max(255).optional(),
  minThreshold: z.number().int().min(0).max(1000000).optional(),
  unit: z.string().trim().max(32).optional(),
  unitPriceDzd: z.number().min(0).max(100000000).optional(),
  status: z.enum(['Normal', 'Critique', 'Commande en cours']).optional(),
});

// Invoicing & Payments (DZD)
export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(255),
  quantity: z.number().positive().max(10000),
  unitPriceDzd: z.number().min(0).max(100000000),
});

export const invoiceCreateSchema = z.object({
  ownerId: z.string().trim().max(64).optional().nullable(),
  clientName: z.string().trim().min(2, 'Nom du client requis').max(255),
  animalId: z.string().trim().max(64).optional().nullable(),
  patientName: z.string().trim().min(1, 'Nom du patient requis').max(255),
  issueDate: isoDateSchema.optional(),
  amountDzd: z.number().min(0).max(100000000).optional(),
  taxRatePercent: z.number().min(0).max(100).optional().default(0),
  status: z.enum(['Payée', 'Partielle', 'En attente', 'Devis', 'Annulée']).optional().default('En attente'),
  paymentMethod: z.enum(['Espèces', 'Carte Bancaire', 'Chèque / Virement']).optional().default('Espèces'),
  notes: z.string().trim().max(2000).optional().default(''),
  items: z.array(invoiceItemSchema).optional(),
});

export const invoiceUpdateSchema = z.object({
  status: z.enum(['Payée', 'Partielle', 'En attente', 'Devis', 'Annulée']).optional(),
  paymentMethod: z.enum(['Espèces', 'Carte Bancaire', 'Chèque / Virement']).optional(),
  paymentAmountDzd: z.number().positive().max(100000000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

// Cash Closing (DZD)
export const cashClosingCreateSchema = z.object({
  closingDate: isoDateSchema,
  countedCashDzd: z.number().min(0).max(100000000).optional(),
  countedCbDzd: z.number().min(0).max(100000000).optional(),
  countedCheckTransferDzd: z.number().min(0).max(100000000).optional(),
  notes: z.string().trim().max(2000).optional().default(''),
});

// Hospitalization
export const hospitalizationCreateSchema = z.object({
  boxCode: z.string().trim().min(2).max(32),
  animalId: z.string().trim().max(64).optional().nullable(),
  patientName: z.string().trim().min(1).max(255),
  species: z.string().trim().max(64).optional().default('—'),
  breed: z.string().trim().max(128).optional().default('—'),
  ownerId: z.string().trim().max(64).optional().nullable(),
  ownerName: z.string().trim().max(255).optional().default('—'),
  admissionDate: z.string().trim().max(64).optional(),
  reason: z.string().trim().min(2).max(500),
  veterinarian: z.string().trim().max(128).optional().default('Dr. Vétérinaire'),
  status: z.enum(['Critique', 'Stable', 'En convalescence', 'Sorti', 'Disponible']).optional().default('Stable'),
  diet: z.string().trim().max(500).optional().default('Standard'),
  lastCare: z.string().trim().max(500).optional().default('Admission enregistrée'),
});

export const hospitalizationUpdateSchema = hospitalizationCreateSchema
  .partial()
  .extend({
    careNote: z.string().trim().min(1).max(500).optional(),
    discharge: z.boolean().optional(),
  });

// SMS
export const smsConfigUpdateSchema = z.object({
  provider_mode: z.enum(['TEST', 'PRODUCTION']).optional(),
  smsProviderMode: z.enum(['test', 'live']).optional(),
  active_provider: z.string().trim().min(2).max(128).optional(),
  smsApiUrl: z.string().trim().max(500).optional(),
  smsApiKey: z.string().trim().max(500).optional(),
  smsSenderId: z.string().trim().min(1).max(64).optional(),
  simPlanLabel: z.string().trim().min(2).max(255).optional(),
  enable_vaccination_reminders: z.boolean().optional(),
  vaccination_intervals: z
    .string()
    .trim()
    .regex(/^\d+(,\s*\d+)*$/, 'Intervalles invalides (ex: 7,3,1)')
    .optional(),
  enable_appointment_reminders: z.boolean().optional(),
  appointment_interval_hours: z.number().int().min(1).max(168).optional(),
  sending_start_hour: z.number().int().min(0).max(23).optional(),
  sending_end_hour: z.number().int().min(0).max(23).optional(),
  timezone: z.string().trim().max(64).optional(),
});

export const smsTemplateSchema = z.object({
  id: z.string().trim().max(64).optional(),
  category: z.enum(['VACCINATION', 'APPOINTMENT', 'POST_OP', 'URGENCE']),
  title: z.string().trim().min(2).max(255),
  content: z.string().trim().min(5).max(1000),
  language: z.enum(['fr', 'ar']).optional().default('fr'),
  is_default: z.boolean().optional(),
});

export const smsTestSchema = z.object({
  phone: algerianPhoneSchema,
  recipientName: z.string().trim().max(255).optional().default('Client Test'),
  animalName: z.string().trim().max(255).optional().default('Animal'),
  category: z.string().trim().max(64).optional().default('MANUAL'),
  ownerId: z.string().trim().max(64).optional(),
  animalId: z.string().trim().max(64).optional(),
  message: z.string().trim().min(3, 'Le message ne peut pas être vide').max(1000),
});

export const smsDirectSchema = z.object({
  clientId: z.string().trim().max(64).optional(),
  patientId: z.string().trim().max(64).optional(),
  recipientPhone: algerianPhoneSchema,
  recipientName: z.string().trim().max(255).optional(),
  animalName: z.string().trim().max(255).optional(),
  message: z.string().trim().min(1, 'Le message ne peut pas être vide').max(1000),
  category: z.string().trim().max(64).optional().default('DIRECT'),
  dispatchMethod: z.enum(['gateway', 'iphone_bridge']).optional().default('gateway'),
  reminderId: z.string().trim().max(64).optional(),
});

export const smsWebhookSchema = z.object({
  providerMessageId: z.string().trim().min(1).max(128),
  status: z.enum(['Accepted', 'Sent', 'Delivered', 'Failed', 'Unknown']),
  errorDetail: z.string().trim().max(500).optional(),
  rawPayload: z.record(z.string(), z.unknown()).optional(),
});

// Migration
export const migrationRequestSchema = z.object({
  dryRun: z.boolean().optional().default(false),
  sourceFormat: z.string().trim().max(64).optional().default('vetosuite-localstorage'),
  clients: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  patients: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  appointments: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  tasks: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  stocks: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  vaccinations: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  consultations: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  vitals: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  notes: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  documents: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  treatments: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  reminders: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  communications: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  invoices: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  legacyV1Blob: z.record(z.string(), z.unknown()).optional().nullable(),
});
