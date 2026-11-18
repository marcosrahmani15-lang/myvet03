import crypto from 'node:crypto';
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
import { centimesToDzd, dzdToCentimes, sumCentimes } from '../../shared/utils/money.ts';
import { normalizeAlgerianPhone } from '../../shared/utils/phone.ts';
import { generateId } from '../utils/crypto.ts';
import type { ClaimedReminder, ClinicStore } from './types.ts';

const DEMO_PASSWORD_HASH =
  'scrypt:a1b2c3d4e5f60718293a4b5c6d7e8f90:68a611b5099bedd23ccd81d0d379a8d39d241b46b99ce50bdafa45b27083112078c01eb05d622847415b5ac9392ba9edfdb22d692af6e1a30bed25e6880addeb';

function formatIsoToFr(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dateStr;
}

function formatIsoToEnShort(dateStr: string): string {
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export class MemoryClinicStore implements ClinicStore {
  readonly engineName = 'DevSandboxStore (Non-Production)' as const;
  readonly isPostgres = false;

  private clinics: Clinic[] = [];
  private users: Array<AuthUser & { passwordHash: string; isActive: boolean }> = [];
  private memberships: Array<ClinicMembership & { userId: string }> = [];
  private loginAttempts = new Map<string, { attempts: number; firstAttemptAt: number; lockedUntil: number | null }>();

  private owners: Array<Client & { clinicId: string }> = [];
  private animals: Array<Patient & { clinicId: string }> = [];
  private vaccinations: Array<VaccinationRecord & { clinicId: string }> = [];
  private appointments: Array<Appointment & { clinicId: string }> = [];
  private medicalRecords: Array<any & { clinicId: string }> = [];
  private tasks: Array<Task & { clinicId: string }> = [];
  private stocks: Array<StockItem & { clinicId: string }> = [];
  private inventoryMovements: Array<InventoryMovement & { clinicId: string }> = [];
  private invoices: Array<Invoice & { clinicId: string }> = [];
  private payments: Array<{
    id: string;
    clinicId: string;
    invoiceId?: string | null;
    invoiceNumber?: string | null;
    ownerId?: string | null;
    clientName: string;
    patientName: string;
    amountCentimes: number;
    paymentMethod: 'Espèces' | 'Carte Bancaire' | 'Chèque / Virement';
    paidAt: string;
    description: string;
    recordedBy: string;
  }> = [];
  private cashClosings: Array<{
    id: string;
    clinicId: string;
    closingDate: string;
    cbCentimes: number;
    cashCentimes: number;
    checkTransferCentimes: number;
    totalCentimes: number;
    expectedCentimes: number;
    varianceCentimes: number;
    operatorName: string;
    notes: string;
    closedAt: string;
  }> = [];
  private hospitalizations: Array<HospitalizationBox & { clinicId: string }> = [];
  private smsConfigs = new Map<string, SmsConfig>();
  private smsTemplates: Array<SmsTemplate & { clinicId: string }> = [];
  private smsReminders: Array<
    SmsReminder & {
      clinic_id: string;
      vaccination_id?: string | null;
      appointment_id?: string | null;
      locked_at?: string | null;
      lease_expires_at?: string | null;
      worker_id?: string | null;
      provider_id?: string | null;
      provider_message_id?: string | null;
    }
  > = [];
  private smsLogs: Array<SmsLog & { clinicId: string }> = [];
  private auditLogs: Array<any> = [];
  private migrationImports = new Map<string, any>();

  constructor() {
    this.seedDefaults();
  }

  seedDefaults(): void {
    this.clinics = [
      {
        id: 'clinic-myvet-ouled-fayet',
        name: 'My Vet — Cabinet Vétérinaire',
        slug: 'myvet-ouled-fayet',
        slogan: 'Le bien-être de vos compagnons, notre priorité',
        address: 'Coopérative el moustakbel n° CC3, Ouled Fayet, Alger',
        phone: '0797 63 87 04',
        email: 'contact@myvet-alger.dz',
        timezone: 'Africa/Algiers',
        currency: 'DZD',
      },
    ];

    this.users = [
      {
        id: 'user-dr-vet',
        email: 'dr.vet@myvet.dz',
        username: 'dr.vet',
        fullName: 'Dr. Vétérinaire',
        avatarInitials: 'DV',
        passwordHash: DEMO_PASSWORD_HASH,
        isActive: true,
      },
      {
        id: 'user-receptionist',
        email: 'accueil@myvet.dz',
        username: 'accueil',
        fullName: 'Amina Benali',
        avatarInitials: 'AB',
        passwordHash: DEMO_PASSWORD_HASH,
        isActive: true,
      },
    ];

    this.memberships = [
      {
        userId: 'user-dr-vet',
        clinicId: 'clinic-myvet-ouled-fayet',
        clinicName: 'My Vet — Cabinet Vétérinaire',
        clinicSlug: 'myvet-ouled-fayet',
        role: 'clinic_admin',
        title: 'Praticien titulaire & Directeur',
        isDefault: true,
      },
      {
        userId: 'user-receptionist',
        clinicId: 'clinic-myvet-ouled-fayet',
        clinicName: 'My Vet — Cabinet Vétérinaire',
        clinicSlug: 'myvet-ouled-fayet',
        role: 'receptionist',
        title: 'Assistante accueil & facturation',
        isDefault: true,
      },
    ];

    this.owners = [
      {
        id: 'c1',
        clinicId: 'clinic-myvet-ouled-fayet',
        name: 'Fatima Mansouri',
        phone: '0555 55 55 55',
        phoneNormalized: '+213555555555',
        email: 'fatima.mansouri@email.dz',
        address: '12 Rue des Jardins, Ouled Fayet, Alger',
        preferredLanguage: 'fr',
        smsConsent: true,
        notes: 'Cliente fidèle',
        animalsCount: 1,
        archivedAt: null,
      },
      {
        id: 'c2',
        clinicId: 'clinic-myvet-ouled-fayet',
        name: 'Karim Dubois',
        phone: '0612 34 56 78',
        phoneNormalized: '+213612345678',
        email: 'k.dubois@email.dz',
        address: '45 Avenue de la Liberté, Chéraga',
        preferredLanguage: 'fr',
        smsConsent: true,
        notes: '',
        animalsCount: 1,
        archivedAt: null,
      },
      {
        id: 'c3',
        clinicId: 'clinic-myvet-ouled-fayet',
        name: 'Samira Lambert',
        phone: '0678 90 12 34',
        phoneNormalized: '+213678901234',
        email: 's.lambert@email.dz',
        address: '8 Résidence El Moustakbel, Ouled Fayet',
        preferredLanguage: 'fr',
        smsConsent: true,
        notes: '',
        animalsCount: 1,
        archivedAt: null,
      },
      {
        id: 'c4',
        clinicId: 'clinic-myvet-ouled-fayet',
        name: 'Yacine Laurent',
        phone: '0770 45 67 89',
        phoneNormalized: '+213770456789',
        email: 'y.laurent@email.dz',
        address: '23 Chemin des Crêtes, Dely Ibrahim',
        preferredLanguage: 'fr',
        smsConsent: true,
        notes: '',
        animalsCount: 1,
        archivedAt: null,
      },
    ];

    this.animals = [
      {
        id: 'nina',
        clinicId: 'clinic-myvet-ouled-fayet',
        name: 'Nina',
        species: 'Chat',
        breed: 'Européen',
        color: 'Roux et blanc',
        gender: 'Femelle',
        birthDate: '02/02/2025',
        age: '1 an 6 mois',
        weight: '5 kg',
        microchip: '250269802345671',
        ownerId: 'c1',
        ownerName: 'Fatima Mansouri',
        ownerPhone: '0555 55 55 55',
        veterinarian: 'Dr. Vétérinaire',
        nextVisit: '2026-08-20 (Vaccin annuel)',
        status: 'Actif',
        avatarEmoji: '🐱',
        medicalAlerts: [{ id: 'al1', type: 'Antécédents', badge: 'INFO', description: 'Vaccin annuel à surveiller' }],
        archivedAt: null,
      },
      {
        id: 'rocky',
        clinicId: 'clinic-myvet-ouled-fayet',
        name: 'Rocky',
        species: 'Chien',
        breed: 'Berger Allemand',
        color: 'Noir et feu',
        gender: 'Mâle',
        birthDate: '15/04/2021',
        age: '5 ans 4 mois',
        weight: '32 kg',
        microchip: '250269802112233',
        ownerId: 'c2',
        ownerName: 'Karim Dubois',
        ownerPhone: '0612 34 56 78',
        veterinarian: 'Dr. Vétérinaire',
        nextVisit: '18/08/2026 (Contrôle post-op)',
        status: 'Actif',
        avatarEmoji: '🐶',
        medicalAlerts: [{ id: 'al2', type: 'Chirurgie', badge: 'INFO', description: 'Retrait points suture prévu' }],
        archivedAt: null,
      },
      {
        id: 'felix',
        clinicId: 'clinic-myvet-ouled-fayet',
        name: 'Félix',
        species: 'Chat',
        breed: 'Siamois',
        color: 'Seal Point',
        gender: 'Mâle',
        birthDate: '10/09/2023',
        age: '2 ans 11 mois',
        weight: '4.2 kg',
        microchip: '250269802445566',
        ownerId: 'c3',
        ownerName: 'Samira Lambert',
        ownerPhone: '0678 90 12 34',
        veterinarian: 'Dr. Vétérinaire',
        nextVisit: 'Aucune visite planifiée',
        status: 'Actif',
        avatarEmoji: '🐈',
        medicalAlerts: [],
        archivedAt: null,
      },
      {
        id: 'maya',
        clinicId: 'clinic-myvet-ouled-fayet',
        name: 'Maya',
        species: 'Chien',
        breed: 'Golden Retriever',
        color: 'Sable doré',
        gender: 'Femelle',
        birthDate: '22/11/2019',
        age: '6 ans 9 mois',
        weight: '28.5 kg',
        microchip: '250269802778899',
        ownerId: 'c4',
        ownerName: 'Yacine Laurent',
        ownerPhone: '0770 45 67 89',
        veterinarian: 'Dr. Vétérinaire',
        nextVisit: '05/09/2026 (Bilan senior)',
        status: 'Actif',
        avatarEmoji: '🐕',
        medicalAlerts: [{ id: 'al3', type: 'Allergie', badge: 'URGENT', description: 'Sensibilité pénicilline' }],
        archivedAt: null,
      },
    ];

    this.vaccinations = [
      {
        id: 'vac-1',
        clinicId: 'clinic-myvet-ouled-fayet',
        animalId: 'nina',
        animalName: 'Nina',
        ownerId: 'c1',
        ownerName: 'Fatima Mansouri',
        vaccineName: 'Vaccin annuel (Typhus-Coryza-Leucose)',
        administeredDate: '2025-08-20',
        nextDueDate: '2026-08-20',
        lotNumber: 'BIO-2025-X8',
        veterinarian: 'Dr. Vétérinaire',
        status: 'Effectué',
      },
    ];

    this.appointments = [
      {
        id: 'apt-1',
        clinicId: 'clinic-myvet-ouled-fayet',
        patientId: 'nina',
        patientName: 'Nina',
        clientId: 'c1',
        clientName: 'Fatima Mansouri',
        date: '2026-08-14',
        startTime: '09:00',
        endTime: '09:30',
        type: 'Vaccin',
        reason: 'Vaccination annuelle',
        veterinarian: 'Dr. Vétérinaire',
        status: 'Confirmé',
        notes: 'Prévoir rappel rage',
      },
      {
        id: 'apt-2',
        clinicId: 'clinic-myvet-ouled-fayet',
        patientId: 'rocky',
        patientName: 'Rocky',
        clientId: 'c2',
        clientName: 'Karim Dubois',
        date: '2026-08-14',
        startTime: '11:30',
        endTime: '12:00',
        type: 'Urgence',
        reason: 'Boiterie patte arrière droite',
        veterinarian: 'Dr. Vétérinaire',
        status: 'Confirmé',
        notes: 'Radio possible',
      },
      {
        id: 'apt-3',
        clinicId: 'clinic-myvet-ouled-fayet',
        patientId: 'felix',
        patientName: 'Félix',
        clientId: 'c3',
        clientName: 'Samira Lambert',
        date: '2026-08-14',
        startTime: '14:00',
        endTime: '14:30',
        type: 'Contrôle',
        reason: 'Contrôle dermatologique',
        veterinarian: 'Dr. Vétérinaire',
        status: 'En attente',
        notes: '',
      },
      {
        id: 'apt-4',
        clinicId: 'clinic-myvet-ouled-fayet',
        patientId: 'maya',
        patientName: 'Maya',
        clientId: 'c4',
        clientName: 'Yacine Laurent',
        date: '2026-08-13',
        startTime: '10:00',
        endTime: '10:30',
        type: 'Consultation',
        reason: 'Bilan senior annuel',
        veterinarian: 'Dr. Vétérinaire',
        status: 'Confirmé',
        notes: '',
      },
    ];

    this.tasks = [
      {
        id: 't1',
        clinicId: 'clinic-myvet-ouled-fayet',
        title: 'Commander des vaccins chlamydiose féline',
        description: 'Vérifier les stocks avant la commande hebdomadaire chez notre fournisseur.',
        priority: 'Normale',
        category: 'Administrative',
        assignedTo: 'Dr. Vétérinaire',
        createdBy: 'Dr. Vétérinaire',
        dueDate: '2026-08-15',
        dueDateFormatted: 'Aug 15, 2026',
        completed: false,
        comments: [{ id: 'c-t1', author: 'Dr. Vétérinaire', avatar: 'DV', text: 'Il reste 4 doses au frigo B.', date: 'Aug 14, 2026' }],
      },
      {
        id: 't2',
        clinicId: 'clinic-myvet-ouled-fayet',
        title: 'Surveiller la glycémie du patient en box 3',
        description: 'Prise de sang prévue à 14h00 avant le repas du soir.',
        priority: 'Urgente',
        category: 'Médicale',
        assignedTo: 'Dr. Vétérinaire',
        createdBy: 'Dr. Vétérinaire',
        dueDate: '2026-08-12',
        dueDateFormatted: 'Aug 12, 2026',
        completed: false,
        boxNumber: '3',
        comments: [{ id: 'c-t2', author: 'Dr. Vétérinaire', avatar: 'DV', text: 'Courbe de glycémie amorcée ce matin à 8h.', date: 'Aug 14, 2026' }],
      },
      {
        id: 't3',
        clinicId: 'clinic-myvet-ouled-fayet',
        title: 'Rappeler Fatima Mansouri pour les résultats',
        description: 'Analyse sanguine normale, expliquer le suivi diététique.',
        priority: 'Haute',
        category: 'Médicale',
        assignedTo: 'Dr. Vétérinaire',
        createdBy: 'Dr. Vétérinaire',
        dueDate: '2026-08-14',
        dueDateFormatted: 'Aug 14, 2026',
        completed: false,
        comments: [],
      },
      {
        id: 't4',
        clinicId: 'clinic-myvet-ouled-fayet',
        title: 'Stérilisation des instruments bloc A',
        description: 'Cycle autoclave complet à lancer après l’intervention du matin.',
        priority: 'Normale',
        category: 'Administrative',
        assignedTo: 'Dr. Vétérinaire',
        createdBy: 'Dr. Vétérinaire',
        dueDate: '2026-08-14',
        dueDateFormatted: 'Aug 14, 2026',
        completed: true,
        comments: [],
      },
    ];

    this.stocks = [
      { id: 's1', clinicId: 'clinic-myvet-ouled-fayet', name: 'Vaccin Nobivac DHPPi', category: 'Vaccin', supplier: 'MSD Santé Animale', quantity: 4, minThreshold: 10, unit: 'doses', unitPriceDzd: 2200, status: 'Critique' },
      { id: 's2', clinicId: 'clinic-myvet-ouled-fayet', name: 'Vaccin Purevax RCPCh', category: 'Vaccin', supplier: 'Boehringer Ingelheim', quantity: 18, minThreshold: 12, unit: 'doses', unitPriceDzd: 2500, status: 'Normal' },
      { id: 's3', clinicId: 'clinic-myvet-ouled-fayet', name: 'Amoxicilline Clavaseptin 250mg', category: 'Antibiotique', supplier: 'Vetoquinol', quantity: 6, minThreshold: 8, unit: 'boîtes', unitPriceDzd: 1450, status: 'Critique' },
      { id: 's4', clinicId: 'clinic-myvet-ouled-fayet', name: 'Meloxicam Metacam 1.5mg/ml', category: 'Anti-inflammatoire', supplier: 'Boehringer Ingelheim', quantity: 12, minThreshold: 5, unit: 'flacons', unitPriceDzd: 3200, status: 'Normal' },
      { id: 's5', clinicId: 'clinic-myvet-ouled-fayet', name: 'Cathéters IV 22G', category: 'Matériel', supplier: 'B. Braun Vet', quantity: 85, minThreshold: 30, unit: 'unités', unitPriceDzd: 180, status: 'Normal' },
      { id: 's6', clinicId: 'clinic-myvet-ouled-fayet', name: 'Croquettes Hypoallergéniques 2kg', category: 'Alimentation', supplier: 'Royal Canin Vet', quantity: 3, minThreshold: 6, unit: 'sacs', unitPriceDzd: 5800, status: 'Critique' },
    ];

    this.invoices = [
      {
        id: 'inv-1', clinicId: 'clinic-myvet-ouled-fayet', number: 'FAC-2026-0842', ownerId: 'c1', clientName: 'Fatima Mansouri', animalId: 'nina', patientName: 'Nina',
        issueDate: '2026-08-14', dateFormatted: '14/08/2026', currency: 'DZD', subtotalDzd: 8500, taxDzd: 0, amountDzd: 8500, paidDzd: 8500, status: 'Payée',
        items: [{ id: 'invi-1', description: 'Consultation vaccinale & injection RCPCh', quantity: 1, unitPriceDzd: 8500, lineTotalDzd: 8500 }],
      },
      {
        id: 'inv-2', clinicId: 'clinic-myvet-ouled-fayet', number: 'FAC-2026-0841', ownerId: 'c2', clientName: 'Karim Dubois', animalId: 'rocky', patientName: 'Rocky',
        issueDate: '2026-08-14', dateFormatted: '14/08/2026', currency: 'DZD', subtotalDzd: 12000, taxDzd: 0, amountDzd: 12000, paidDzd: 12000, status: 'Payée',
        items: [{ id: 'invi-2', description: 'Soins post-opératoires & pansement', quantity: 1, unitPriceDzd: 12000, lineTotalDzd: 12000 }],
      },
      {
        id: 'inv-3', clinicId: 'clinic-myvet-ouled-fayet', number: 'FAC-2026-0840', ownerId: 'c3', clientName: 'Samira Lambert', animalId: 'felix', patientName: 'Félix',
        issueDate: '2026-08-14', dateFormatted: '14/08/2026', currency: 'DZD', subtotalDzd: 6500, taxDzd: 0, amountDzd: 6500, paidDzd: 6500, status: 'Payée',
        items: [{ id: 'invi-3', description: 'Consultation dermatologique + lotions', quantity: 1, unitPriceDzd: 6500, lineTotalDzd: 6500 }],
      },
      {
        id: 'inv-4', clinicId: 'clinic-myvet-ouled-fayet', number: 'FAC-2026-0839', ownerId: 'c4', clientName: 'Yacine Laurent', animalId: 'maya', patientName: 'Maya',
        issueDate: '2026-08-11', dateFormatted: '11/08/2026', currency: 'DZD', subtotalDzd: 11000, taxDzd: 0, amountDzd: 11000, paidDzd: 0, status: 'En attente',
        items: [{ id: 'invi-4', description: 'Bilan gériatrique complet', quantity: 1, unitPriceDzd: 11000, lineTotalDzd: 11000 }],
      },
      {
        id: 'inv-5', clinicId: 'clinic-myvet-ouled-fayet', number: 'DEV-2026-0104', ownerId: 'c4', clientName: 'Yacine Laurent', animalId: 'maya', patientName: 'Maya',
        issueDate: '2026-08-10', dateFormatted: '10/08/2026', currency: 'DZD', subtotalDzd: 45000, taxDzd: 0, amountDzd: 45000, paidDzd: 0, status: 'Devis',
        items: [{ id: 'invi-5', description: 'Détartrage & chirurgie dentaire', quantity: 1, unitPriceDzd: 45000, lineTotalDzd: 45000 }],
      },
    ];

    this.payments = [
      { id: 'pay-1', clinicId: 'clinic-myvet-ouled-fayet', invoiceId: 'inv-1', invoiceNumber: 'FAC-2026-0842', ownerId: 'c1', clientName: 'Fatima Mansouri', patientName: 'Nina', amountCentimes: 850000, paymentMethod: 'Espèces', paidAt: '2026-08-14T09:30:00+01:00', description: 'Vaccination annuelle + Consultation', recordedBy: 'Dr. Vétérinaire' },
      { id: 'pay-2', clinicId: 'clinic-myvet-ouled-fayet', invoiceId: 'inv-2', invoiceNumber: 'FAC-2026-0841', ownerId: 'c2', clientName: 'Karim Dubois', patientName: 'Rocky', amountCentimes: 1200000, paymentMethod: 'Carte Bancaire', paidAt: '2026-08-14T11:45:00+01:00', description: 'Soins post-op + Pansements', recordedBy: 'Dr. Vétérinaire' },
      { id: 'pay-3', clinicId: 'clinic-myvet-ouled-fayet', invoiceId: 'inv-3', invoiceNumber: 'FAC-2026-0840', ownerId: 'c3', clientName: 'Samira Lambert', patientName: 'Félix', amountCentimes: 650000, paymentMethod: 'Espèces', paidAt: '2026-08-14T14:20:00+01:00', description: 'Traitement dermatologique', recordedBy: 'Dr. Vétérinaire' },
    ];

    this.hospitalizations = [
      { id: 'hosp-h1', clinicId: 'clinic-myvet-ouled-fayet', boxCode: 'Box H1', animalId: 'felix', patientName: 'Félix', species: 'Chat', breed: 'Siamois', ownerId: 'c3', ownerName: 'Samira Lambert', admissionDate: '2026-08-13', reason: 'Perfusion réhydratation & surveillance', veterinarian: 'Dr. Vétérinaire', status: 'Stable', diet: 'Alimentation humide gastro-intestinale', lastCare: '14/08 à 08:30 (Perfusion vérifiée)', careLogs: [] },
      { id: 'hosp-h2', clinicId: 'clinic-myvet-ouled-fayet', boxCode: 'Box H2', animalId: 'rocky', patientName: 'Rocky', species: 'Chien', breed: 'Berger Allemand', ownerId: 'c2', ownerName: 'Karim Dubois', admissionDate: '2026-08-12', reason: 'Laparotomie exploratrice J+2 — Soins pansement', veterinarian: 'Dr. Vétérinaire', status: 'En convalescence', diet: 'Ration ménagère hyper-digestible', lastCare: '14/08 à 10:00 (Pansement abdominal refait)', careLogs: [] },
      { id: 'hosp-h3', clinicId: 'clinic-myvet-ouled-fayet', boxCode: 'Box H3', animalId: null, patientName: 'Libre', species: '—', breed: '—', ownerId: null, ownerName: '—', admissionDate: '—', reason: 'Box désinfecté prêt pour admission', veterinarian: '—', status: 'Disponible', diet: '—', lastCare: 'Désinfection le 14/08 à 07:00', careLogs: [] },
      { id: 'hosp-c1', clinicId: 'clinic-myvet-ouled-fayet', boxCode: 'Box C1', animalId: 'maya', patientName: 'Maya', species: 'Chien', breed: 'Golden Retriever', ownerId: 'c4', ownerName: 'Yacine Laurent', admissionDate: '2026-08-14', reason: 'Oxygénothérapie & surveillance respiratoire', veterinarian: 'Dr. Vétérinaire', status: 'Critique', diet: 'À jeun sous surveillance continue', lastCare: '14/08 à 11:15 (Saturation O2 mesurée 96%)', careLogs: [] },
    ];

    this.smsConfigs.set('clinic-myvet-ouled-fayet', {
      id: 'clinic-myvet-ouled-fayet',
      clinic_id: 'clinic-myvet-ouled-fayet',
      provider_mode: 'TEST',
      smsProviderMode: 'test',
      active_provider: 'Ooredoo_Business_Algeria',
      api_key_configured: Boolean(process.env.SMS_API_KEY),
      smsApiUrl: '',
      smsApiKey: '',
      smsSenderId: 'MyVet',
      simPlanLabel: 'Ooredoo 2500 (SMS Illimité Tous Réseaux)',
      enable_vaccination_reminders: true,
      vaccination_intervals: '7,3,1',
      enable_appointment_reminders: true,
      appointment_interval_hours: 24,
      sending_start_hour: 8,
      sending_end_hour: 20,
      timezone: 'Africa/Algiers',
    });

    this.smsTemplates = [
      { id: 'tpl-vac-fr', clinicId: 'clinic-myvet-ouled-fayet', category: 'VACCINATION', title: 'Rappel Vaccin Standard (FR)', content: 'Cabinet My Vet: Bonjour {{ownerName}}, le rappel vaccin ({{vaccineName}}) pour {{animalName}} est prévu le {{dueDate}}. Tel: 0797 63 87 04 (Ouled Fayet).', language: 'fr', is_default: true },
      { id: 'tpl-apt-fr', clinicId: 'clinic-myvet-ouled-fayet', category: 'APPOINTMENT', title: 'Confirmation Rendez-vous 24h (FR)', content: 'Cabinet My Vet: Rappel de votre RDV pour {{animalName}} demain le {{date}} à {{time}}. Coopérative El Moustakbel, Ouled Fayet. Tel: 0797 63 87 04.', language: 'fr', is_default: true },
      { id: 'tpl-vac-ar', clinicId: 'clinic-myvet-ouled-fayet', category: 'VACCINATION', title: 'تذكير بالتلقيح (AR)', content: 'عيادة My Vet: مرحبا {{ownerName}}، موعد تلقيح {{animalName}} مقرر يوم {{dueDate}}. أولاد فايت. الهاتف: 0797638704', language: 'ar', is_default: false },
      { id: 'tpl-post-fr', clinicId: 'clinic-myvet-ouled-fayet', category: 'POST_OP', title: 'Suivi Post-Opératoire (FR)', content: 'Cabinet My Vet: Bonjour {{ownerName}}, comment se porte {{animalName}} suite à son intervention ? En cas de besoin appelez le 0797 63 87 04.', language: 'fr', is_default: false },
    ];

    this.smsReminders = [
      { id: 'rem-vac-1-7d', clinic_id: 'clinic-myvet-ouled-fayet', owner_id: 'c1', animal_id: 'nina', vaccination_id: 'vac-1', reminder_type: 'VACCINATION_7D', scheduled_at: '2026-08-13T08:00:00+01:00', status: 'Sent', idempotency_key: 'vac-vac-1-7d', attempts: 1, is_simulated: true },
      { id: 'rem-vac-1-3d', clinic_id: 'clinic-myvet-ouled-fayet', owner_id: 'c1', animal_id: 'nina', vaccination_id: 'vac-1', reminder_type: 'VACCINATION_3D', scheduled_at: '2026-08-17T08:00:00+01:00', status: 'Scheduled', idempotency_key: 'vac-vac-1-3d', attempts: 0, is_simulated: true },
      { id: 'rem-vac-1-1d', clinic_id: 'clinic-myvet-ouled-fayet', owner_id: 'c1', animal_id: 'nina', vaccination_id: 'vac-1', reminder_type: 'VACCINATION_1D', scheduled_at: '2026-08-19T08:00:00+01:00', status: 'Scheduled', idempotency_key: 'vac-vac-1-1d', attempts: 0, is_simulated: true },
    ];

    this.smsLogs = [
      {
        id: 'log-1',
        clinicId: 'clinic-myvet-ouled-fayet',
        reminder_id: 'rem-vac-1-7d',
        recipient_name: 'Fatima Mansouri',
        recipient_phone: '+213555555555',
        animal_name: 'Nina',
        category: 'VACCINATION_7D',
        message_content: 'Cabinet My Vet: Bonjour Fatima Mansouri, le rappel vaccin annuel pour Nina est prévu le 2026-08-20. Tel: 0797 63 87 04.',
        encoding: 'GSM-7',
        segment_count: 1,
        status: 'Sent',
        is_simulated: true,
        provider_name: 'TestSMSProvider (Mode Simulation)',
        provider_message_id: 'SIM-INIT-001',
        provider_response: JSON.stringify({ mode: 'TEST_SIMULATION', simulated: true, carrier: 'Ooredoo' }),
        created_at: new Date(Date.now() - 3600_000).toISOString(),
      },
      {
        id: 'log-2',
        clinicId: 'clinic-myvet-ouled-fayet',
        reminder_id: null,
        recipient_name: 'Samira Lambert',
        recipient_phone: '+213678901234',
        animal_name: 'Félix',
        category: 'APPOINTMENT_24H',
        message_content: 'Cabinet My Vet: Rappel de votre RDV pour Félix le 14/08/2026 à 14:00. Ouled Fayet.',
        encoding: 'GSM-7',
        segment_count: 1,
        status: 'Delivered',
        is_simulated: true,
        provider_name: 'TestSMSProvider (Mode Simulation)',
        provider_message_id: 'SIM-INIT-002',
        provider_response: JSON.stringify({ mode: 'TEST_SIMULATION', simulated: true, carrier: 'Mobilis', webhookConfirmed: true }),
        created_at: new Date(Date.now() - 7200_000).toISOString(),
      },
    ];
  }

  async findUserByIdentifier(identifier: string) {
    const clean = identifier.trim().toLowerCase();
    return this.users.find((u) => u.email.toLowerCase() === clean || u.username.toLowerCase() === clean) || null;
  }

  async findUserById(userId: string) {
    const u = this.users.find((x) => x.id === userId);
    if (!u) return null;
    return { id: u.id, email: u.email, username: u.username, fullName: u.fullName, avatarInitials: u.avatarInitials, isActive: u.isActive };
  }

  async getUserMemberships(userId: string) {
    return this.memberships
      .filter((m) => m.userId === userId)
      .map(({ userId: _u, ...rest }) => rest);
  }

  async getClinicById(clinicId: string) {
    return this.clinics.find((c) => c.id === clinicId) || null;
  }

  async updateClinic(clinicId: string, data: Partial<Clinic>) {
    const idx = this.clinics.findIndex((c) => c.id === clinicId);
    if (idx === -1) throw new Error('Clinique introuvable');
    this.clinics[idx] = { ...this.clinics[idx], ...data, currency: 'DZD' };
    return this.clinics[idx];
  }

  async checkAndRecordLoginAttempt(key: string, maxAttempts: number, windowMs: number, lockMs: number) {
    const now = Date.now();
    const cur = this.loginAttempts.get(key);
    if (cur?.lockedUntil && cur.lockedUntil > now) {
      return { allowed: false, retryAfterSec: Math.ceil((cur.lockedUntil - now) / 1000) };
    }
    if (!cur || now - cur.firstAttemptAt > windowMs) {
      this.loginAttempts.set(key, { attempts: 1, firstAttemptAt: now, lockedUntil: null });
      return { allowed: true };
    }
    const next = cur.attempts + 1;
    const lockedUntil = next >= maxAttempts ? now + lockMs : null;
    this.loginAttempts.set(key, { attempts: next, firstAttemptAt: cur.firstAttemptAt, lockedUntil });
    if (lockedUntil) {
      return { allowed: false, retryAfterSec: Math.ceil(lockMs / 1000) };
    }
    return { allowed: true };
  }

  async clearLoginAttempts(key: string) {
    this.loginAttempts.delete(key);
  }

  async listOwners(clinicId: string, includeArchived = false) {
    return this.owners
      .filter((o) => o.clinicId === clinicId && (includeArchived || !o.archivedAt))
      .map((o) => ({
        ...o,
        animalsCount: this.animals.filter((a) => a.clinicId === clinicId && a.ownerId === o.id && !a.archivedAt).length,
      }));
  }

  async getOwnerById(clinicId: string, id: string) {
    const found = (await this.listOwners(clinicId, true)).find((o) => o.id === id);
    return found || null;
  }

  async createOwner(clinicId: string, input: any) {
    const id = input.id || generateId('c');
    const phoneInfo = normalizeAlgerianPhone(input.phone);
    const created: Client & { clinicId: string } = {
      id,
      clinicId,
      name: input.name,
      phone: phoneInfo.national || input.phone,
      phoneNormalized: phoneInfo.e164,
      email: input.email || '',
      address: input.address || '',
      preferredLanguage: input.preferredLanguage || 'fr',
      smsConsent: input.smsConsent !== false,
      notes: input.notes || '',
      animalsCount: 0,
      archivedAt: null,
    };
    this.owners.push(created);
    return created;
  }

  async updateOwner(clinicId: string, id: string, updates: any) {
    const idx = this.owners.findIndex((o) => o.clinicId === clinicId && o.id === id);
    if (idx === -1) return null;
    const phoneInfo = updates.phone ? normalizeAlgerianPhone(updates.phone) : null;
    this.owners[idx] = {
      ...this.owners[idx],
      ...updates,
      phone: phoneInfo?.national || updates.phone || this.owners[idx].phone,
      phoneNormalized: phoneInfo?.e164 || this.owners[idx].phoneNormalized,
    };
    return this.getOwnerById(clinicId, id);
  }

  async archiveOrDeleteOwner(clinicId: string, id: string) {
    const idx = this.owners.findIndex((o) => o.clinicId === clinicId && o.id === id);
    if (idx === -1) return null;
    const hasHistory =
      this.animals.some((a) => a.clinicId === clinicId && a.ownerId === id) ||
      this.invoices.some((i) => i.clinicId === clinicId && i.ownerId === id) ||
      this.appointments.some((a) => a.clinicId === clinicId && a.clientId === id);
    if (hasHistory) {
      this.owners[idx].archivedAt = new Date().toISOString();
      this.owners[idx].smsConsent = false;
      return { action: 'archived' as const, reason: 'Dossier archivé pour préserver l’historique médical et financier (DZD).' };
    }
    this.owners.splice(idx, 1);
    return { action: 'deleted' as const };
  }

  async listAnimals(clinicId: string, includeArchived = false) {
    return this.animals
      .filter((a) => a.clinicId === clinicId && (includeArchived || !a.archivedAt))
      .map((a) => {
        const owner = this.owners.find((o) => o.clinicId === clinicId && o.id === a.ownerId);
        return { ...a, ownerName: owner?.name || a.ownerName, ownerPhone: owner?.phone || a.ownerPhone };
      });
  }

  async getAnimalById(clinicId: string, id: string) {
    return (await this.listAnimals(clinicId, true)).find((a) => a.id === id) || null;
  }

  async createAnimal(clinicId: string, input: any) {
    const owner = await this.getOwnerById(clinicId, input.ownerId);
    if (!owner) throw new Error('Propriétaire introuvable dans ce cabinet');
    const id = input.id || generateId('pet');
    const created: Patient & { clinicId: string } = {
      id,
      clinicId,
      name: input.name,
      species: input.species,
      breed: input.breed || 'Croisé',
      color: input.color || '—',
      gender: input.gender || 'Femelle',
      birthDate: input.birthDate || '—',
      age: input.age || '—',
      weight: input.weight || '—',
      microchip: input.microchip || '—',
      ownerId: owner.id,
      ownerName: owner.name,
      ownerPhone: owner.phone,
      veterinarian: input.veterinarian || 'Dr. Vétérinaire',
      nextVisit: input.nextVisit || 'Aucune visite planifiée',
      status: input.status || 'Actif',
      avatarEmoji: input.avatarEmoji || (input.species === 'Chien' ? '🐶' : input.species === 'Chat' ? '🐱' : '🐾'),
      medicalAlerts: input.medicalAlerts || [],
      medicalNotes: input.medicalNotes || '',
      archivedAt: null,
    };
    this.animals.push(created);
    return created;
  }

  async updateAnimal(clinicId: string, id: string, updates: any) {
    const idx = this.animals.findIndex((a) => a.clinicId === clinicId && a.id === id);
    if (idx === -1) return null;
    if (updates.ownerId && updates.ownerId !== this.animals[idx].ownerId) {
      const owner = await this.getOwnerById(clinicId, updates.ownerId);
      if (!owner) throw new Error('Propriétaire introuvable dans ce cabinet');
    }
    this.animals[idx] = { ...this.animals[idx], ...updates };
    return this.getAnimalById(clinicId, id);
  }

  async archiveOrDeleteAnimal(clinicId: string, id: string) {
    const idx = this.animals.findIndex((a) => a.clinicId === clinicId && a.id === id);
    if (idx === -1) return null;
    const hasHistory =
      this.vaccinations.some((v) => v.clinicId === clinicId && v.animalId === id) ||
      this.appointments.some((a) => a.clinicId === clinicId && a.patientId === id) ||
      this.medicalRecords.some((m) => m.clinicId === clinicId && m.animalId === id) ||
      this.invoices.some((i) => i.clinicId === clinicId && i.animalId === id);
    if (hasHistory) {
      this.animals[idx].status = 'Inactif';
      this.animals[idx].archivedAt = new Date().toISOString();
      return { action: 'archived' as const, reason: 'Patient archivé (statut Inactif) pour préserver son dossier médical.' };
    }
    this.animals.splice(idx, 1);
    return { action: 'deleted' as const };
  }

  async listMedicalRecords(clinicId: string, animalId?: string) {
    return this.medicalRecords.filter(
      (m) => m.clinicId === clinicId && (!animalId || m.animalId === animalId)
    );
  }

  async createMedicalRecord(clinicId: string, input: any) {
    const animal = await this.getAnimalById(clinicId, input.animalId);
    if (!animal) throw new Error('Patient introuvable dans ce cabinet');
    const rec = {
      id: input.id || generateId('med'),
      clinicId,
      animalId: input.animalId,
      patientId: input.animalId,
      recordType: input.recordType,
      recordedAt: input.recordedAt || formatIsoToFr(new Date().toISOString().slice(0, 10)),
      author: input.author || '',
      title: input.title || '',
      ...(input.payload || {}),
    };
    this.medicalRecords.unshift(rec);
    return rec;
  }

  async toggleMedicalReminder(clinicId: string, id: string) {
    const rec = this.medicalRecords.find((m) => m.clinicId === clinicId && m.id === id && m.recordType === 'reminder');
    if (!rec) return null;
    rec.completed = !rec.completed;
    return rec;
  }

  async deleteMedicalDocument(clinicId: string, id: string) {
    const idx = this.medicalRecords.findIndex((m) => m.clinicId === clinicId && m.id === id && m.recordType === 'document');
    if (idx === -1) return false;
    this.medicalRecords.splice(idx, 1);
    return true;
  }

  async listVaccinations(clinicId: string, animalId?: string) {
    return this.vaccinations.filter(
      (v) => v.clinicId === clinicId && (!animalId || v.animalId === animalId)
    );
  }

  async getVaccinationById(clinicId: string, id: string) {
    return this.vaccinations.find((v) => v.clinicId === clinicId && v.id === id) || null;
  }

  async createVaccination(clinicId: string, input: any) {
    const animal = await this.getAnimalById(clinicId, input.animalId);
    if (!animal) throw new Error('Animal introuvable dans ce cabinet');
    const created: VaccinationRecord & { clinicId: string } = {
      id: input.id || generateId('vac'),
      clinicId,
      animalId: animal.id,
      animalName: animal.name,
      ownerId: input.ownerId || animal.ownerId,
      ownerName: animal.ownerName,
      vaccineName: input.vaccineName,
      administeredDate: input.administeredDate,
      nextDueDate: input.nextDueDate,
      lotNumber: input.lotNumber || '',
      veterinarian: input.veterinarian || 'Dr. Vétérinaire',
      notes: input.notes || '',
      status: input.status || 'Effectué',
    };
    this.vaccinations.push(created);
    return created;
  }

  async updateVaccination(clinicId: string, id: string, updates: any) {
    const idx = this.vaccinations.findIndex((v) => v.clinicId === clinicId && v.id === id);
    if (idx === -1) return null;
    this.vaccinations[idx] = { ...this.vaccinations[idx], ...updates };
    return this.vaccinations[idx];
  }

  async deleteVaccination(clinicId: string, id: string) {
    const idx = this.vaccinations.findIndex((v) => v.clinicId === clinicId && v.id === id);
    if (idx === -1) return false;
    this.vaccinations.splice(idx, 1);
    return true;
  }

  async listAppointments(clinicId: string) {
    return this.appointments
      .filter((a) => a.clinicId === clinicId)
      .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
  }

  async getAppointmentById(clinicId: string, id: string) {
    return this.appointments.find((a) => a.clinicId === clinicId && a.id === id) || null;
  }

  async createAppointment(clinicId: string, input: any) {
    const animal = await this.getAnimalById(clinicId, input.patientId);
    if (!animal) throw new Error('Patient introuvable dans ce cabinet');
    const conflict = this.appointments.find(
      (a) =>
        a.clinicId === clinicId &&
        a.date === input.date &&
        a.veterinarian === input.veterinarian &&
        a.status !== 'Annulé' &&
        a.status !== 'Manqué' &&
        !(a.endTime <= input.startTime || a.startTime >= input.endTime)
    );
    if (conflict) {
      throw new Error(`Créneau indisponible : ${input.veterinarian} a déjà un rendez-vous sur cette plage horaire.`);
    }
    const created: Appointment & { clinicId: string } = {
      id: input.id || generateId('apt'),
      clinicId,
      patientId: animal.id,
      patientName: animal.name,
      clientId: animal.ownerId,
      clientName: animal.ownerName,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      type: input.type,
      reason: input.reason,
      veterinarian: input.veterinarian,
      status: input.status || 'Confirmé',
      notes: input.notes || '',
    };
    this.appointments.push(created);
    return created;
  }

  async updateAppointment(clinicId: string, id: string, updates: any) {
    const idx = this.appointments.findIndex((a) => a.clinicId === clinicId && a.id === id);
    if (idx === -1) return null;
    const cur = this.appointments[idx];
    const nextDate = updates.date ?? cur.date;
    const nextStart = updates.startTime ?? cur.startTime;
    const nextEnd = updates.endTime ?? cur.endTime;
    const nextVet = updates.veterinarian ?? cur.veterinarian;
    const nextStatus = updates.status ?? cur.status;
    if (nextEnd <= nextStart) throw new Error("L'heure de fin doit être postérieure à l'heure de début");
    if (nextStatus !== 'Annulé' && nextStatus !== 'Manqué') {
      const conflict = this.appointments.find(
        (a) =>
          a.clinicId === clinicId &&
          a.id !== id &&
          a.date === nextDate &&
          a.veterinarian === nextVet &&
          a.status !== 'Annulé' &&
          a.status !== 'Manqué' &&
          !(a.endTime <= nextStart || a.startTime >= nextEnd)
      );
      if (conflict) throw new Error(`Créneau indisponible : ${nextVet} a déjà un rendez-vous sur cette plage horaire.`);
    }
    this.appointments[idx] = { ...cur, ...updates };
    return this.appointments[idx];
  }

  async deleteAppointment(clinicId: string, id: string) {
    const idx = this.appointments.findIndex((a) => a.clinicId === clinicId && a.id === id);
    if (idx === -1) return false;
    this.appointments.splice(idx, 1);
    return true;
  }

  async listTasks(clinicId: string) {
    return this.tasks.filter((t) => t.clinicId === clinicId);
  }

  async createTask(clinicId: string, input: any) {
    const created: Task & { clinicId: string } = {
      id: input.id || generateId('task'),
      clinicId,
      title: input.title,
      description: input.description || '',
      priority: input.priority || 'Normale',
      category: input.category || 'Médicale',
      assignedTo: input.assignedTo,
      createdBy: input.createdBy || 'Dr. Vétérinaire',
      dueDate: input.dueDate,
      dueDateFormatted: input.dueDateFormatted || formatIsoToEnShort(input.dueDate),
      completed: false,
      comments: [],
      relatedPatientId: input.relatedPatientId,
      boxNumber: input.boxNumber,
    };
    this.tasks.unshift(created);
    return created;
  }

  async updateTask(clinicId: string, id: string, updates: any) {
    const idx = this.tasks.findIndex((t) => t.clinicId === clinicId && t.id === id);
    if (idx === -1) return null;
    this.tasks[idx] = { ...this.tasks[idx], ...updates };
    return this.tasks[idx];
  }

  async addTaskComment(clinicId: string, taskId: string, comment: { author: string; avatar: string; text: string; date: string }) {
    const task = this.tasks.find((t) => t.clinicId === clinicId && t.id === taskId);
    if (!task) return null;
    task.comments = [...task.comments, { id: generateId('tcomm'), ...comment }];
    return task;
  }

  async deleteTask(clinicId: string, id: string) {
    const idx = this.tasks.findIndex((t) => t.clinicId === clinicId && t.id === id);
    if (idx === -1) return false;
    this.tasks.splice(idx, 1);
    return true;
  }

  async listStocks(clinicId: string) {
    return this.stocks.filter((s) => s.clinicId === clinicId);
  }

  async listInventoryMovements(clinicId: string, itemId?: string) {
    return this.inventoryMovements.filter((m) => m.clinicId === clinicId && (!itemId || m.itemId === itemId));
  }

  async createStock(clinicId: string, input: any) {
    const qty = Math.max(0, Number(input.quantity || 0));
    const min = Math.max(0, Number(input.minThreshold ?? 5));
    const created: StockItem & { clinicId: string } = {
      id: input.id || generateId('stk'),
      clinicId,
      name: input.name,
      category: input.category,
      supplier: input.supplier || '',
      quantity: qty,
      minThreshold: min,
      unit: input.unit || 'unités',
      unitPriceDzd: Number(input.unitPriceDzd || 0),
      status: qty <= min ? 'Critique' : 'Normal',
    };
    this.stocks.push(created);
    if (qty > 0) {
      this.inventoryMovements.unshift({
        id: generateId('mov'),
        clinicId,
        itemId: created.id,
        itemName: created.name,
        delta: qty,
        quantityBefore: 0,
        quantityAfter: qty,
        reason: 'Stock initial',
        performedBy: input.performedBy || 'Dr. Vétérinaire',
        createdAt: new Date().toISOString(),
      });
    }
    return created;
  }

  async adjustStock(clinicId: string, id: string, updates: any) {
    const idx = this.stocks.findIndex((s) => s.clinicId === clinicId && s.id === id);
    if (idx === -1) return null;
    const cur = this.stocks[idx];
    const before = cur.quantity;
    const after =
      updates.delta !== undefined
        ? Math.max(0, before + Number(updates.delta))
        : updates.quantity !== undefined
        ? Math.max(0, Number(updates.quantity))
        : before;
    const min = updates.minThreshold !== undefined ? Number(updates.minThreshold) : cur.minThreshold;
    const status =
      updates.status === 'Commande en cours'
        ? 'Commande en cours'
        : after <= min
        ? 'Critique'
        : 'Normal';
    this.stocks[idx] = { ...cur, ...updates, quantity: after, minThreshold: min, status };
    if (after !== before) {
      this.inventoryMovements.unshift({
        id: generateId('mov'),
        clinicId,
        itemId: id,
        itemName: this.stocks[idx].name,
        delta: after - before,
        quantityBefore: before,
        quantityAfter: after,
        reason: updates.reason || (after > before ? 'Réapprovisionnement' : 'Sortie de stock'),
        performedBy: updates.performedBy || 'Dr. Vétérinaire',
        createdAt: new Date().toISOString(),
      });
    }
    return this.stocks[idx];
  }

  async listInvoices(clinicId: string) {
    return this.invoices.filter((i) => i.clinicId === clinicId);
  }

  async createInvoice(clinicId: string, input: any, createdBy: string) {
    const issueDate = input.issueDate || new Date().toISOString().slice(0, 10);
    const prefix = input.status === 'Devis' ? `DEV-${issueDate.slice(0, 4)}-` : `FAC-${issueDate.slice(0, 4)}-`;
    const items =
      Array.isArray(input.items) && input.items.length > 0
        ? input.items
        : [{ description: input.notes || 'Prestation vétérinaire', quantity: 1, unitPriceDzd: Number(input.amountDzd ?? 0) }];

    const computedItems = items.map((it: any) => {
      const unitCentimes = dzdToCentimes(it.unitPriceDzd);
      const lineTotalCentimes = Math.round(unitCentimes * it.quantity);
      return {
        id: generateId('invi'),
        description: it.description,
        quantity: it.quantity,
        unitPriceDzd: centimesToDzd(unitCentimes),
        lineTotalDzd: centimesToDzd(lineTotalCentimes),
        lineTotalCentimes,
      };
    });

    const subtotalCentimes = sumCentimes(computedItems.map((i: any) => i.lineTotalCentimes));
    const taxCentimes = Math.round((subtotalCentimes * Number(input.taxRatePercent || 0)) / 100);
    const totalCentimes = subtotalCentimes + taxCentimes;
    const status = input.status || 'En attente';
    const paidCentimes = status === 'Payée' ? totalCentimes : 0;
    const number = input.number || `${prefix}${crypto.randomInt(1000, 9999)}`;

    const created: Invoice & { clinicId: string } = {
      id: generateId('inv'),
      clinicId,
      number,
      ownerId: input.ownerId || null,
      clientName: input.clientName,
      animalId: input.animalId || null,
      patientName: input.patientName,
      issueDate,
      dateFormatted: formatIsoToFr(issueDate),
      currency: 'DZD',
      subtotalDzd: centimesToDzd(subtotalCentimes),
      taxDzd: centimesToDzd(taxCentimes),
      amountDzd: centimesToDzd(totalCentimes),
      paidDzd: centimesToDzd(paidCentimes),
      status,
      notes: input.notes || '',
      items: computedItems.map(({ lineTotalCentimes: _x, ...rest }: any) => rest),
      createdAt: new Date().toISOString(),
    };
    this.invoices.unshift(created);

    if (paidCentimes > 0) {
      this.payments.push({
        id: generateId('pay'),
        clinicId,
        invoiceId: created.id,
        invoiceNumber: created.number,
        ownerId: created.ownerId,
        clientName: created.clientName,
        patientName: created.patientName,
        amountCentimes: paidCentimes,
        paymentMethod: input.paymentMethod || 'Espèces',
        paidAt: `${issueDate}T12:00:00+01:00`,
        description: input.notes || `Règlement ${created.number}`,
        recordedBy: createdBy,
      });
    }
    return created;
  }

  async updateInvoice(clinicId: string, id: string, updates: any, recordedBy: string) {
    const idx = this.invoices.findIndex((i) => i.clinicId === clinicId && i.id === id);
    if (idx === -1) return null;
    const cur = this.invoices[idx];
    const totalCentimes = dzdToCentimes(cur.amountDzd);
    let paidCentimes = dzdToCentimes(cur.paidDzd);
    let nextStatus = updates.status ?? cur.status;
    let deltaCentimes = 0;

    if (updates.paymentAmountDzd) {
      deltaCentimes = Math.min(totalCentimes - paidCentimes, dzdToCentimes(updates.paymentAmountDzd));
      paidCentimes += Math.max(0, deltaCentimes);
      nextStatus = paidCentimes >= totalCentimes ? 'Payée' : 'Partielle';
    } else if (nextStatus === 'Payée' && paidCentimes < totalCentimes) {
      deltaCentimes = totalCentimes - paidCentimes;
      paidCentimes = totalCentimes;
    }

    this.invoices[idx] = { ...cur, status: nextStatus, paidDzd: centimesToDzd(paidCentimes), notes: updates.notes ?? cur.notes };
    if (deltaCentimes > 0) {
      this.payments.push({
        id: generateId('pay'),
        clinicId,
        invoiceId: cur.id,
        invoiceNumber: cur.number,
        ownerId: cur.ownerId,
        clientName: cur.clientName,
        patientName: cur.patientName,
        amountCentimes: deltaCentimes,
        paymentMethod: updates.paymentMethod || 'Espèces',
        paidAt: new Date().toISOString(),
        description: `Encaissement ${cur.number}`,
        recordedBy,
      });
    }
    return this.invoices[idx];
  }

  async getCashClosingSummary(clinicId: string, date: string): Promise<CashClosingSummary> {
    const dayPayments = this.payments.filter(
      (p) => p.clinicId === clinicId && p.paidAt.slice(0, 10) === date
    );
    let cbCentimes = 0;
    let cashCentimes = 0;
    let checkCentimes = 0;
    const entries = dayPayments.map((p) => {
      if (p.paymentMethod === 'Carte Bancaire') cbCentimes += p.amountCentimes;
      else if (p.paymentMethod === 'Espèces') cashCentimes += p.amountCentimes;
      else checkCentimes += p.amountCentimes;
      return {
        id: p.id,
        invoiceId: p.invoiceId,
        invoiceNumber: p.invoiceNumber,
        time: p.paidAt.slice(11, 16) || '12:00',
        paidAt: p.paidAt,
        clientName: p.clientName,
        patientName: p.patientName,
        description: p.description,
        paymentMethod: p.paymentMethod,
        amountDzd: centimesToDzd(p.amountCentimes),
        currency: 'DZD' as const,
        recordedBy: p.recordedBy,
      };
    });

    const expectedCentimes = cbCentimes + cashCentimes + checkCentimes;
    const closedRow = this.cashClosings.find((c) => c.clinicId === clinicId && c.closingDate === date);
    return {
      date,
      currency: 'DZD',
      cbDzd: centimesToDzd(closedRow ? closedRow.cbCentimes : cbCentimes),
      cashDzd: centimesToDzd(closedRow ? closedRow.cashCentimes : cashCentimes),
      checkTransferDzd: centimesToDzd(closedRow ? closedRow.checkTransferCentimes : checkCentimes),
      totalDzd: centimesToDzd(closedRow ? closedRow.totalCentimes : expectedCentimes),
      expectedDzd: centimesToDzd(expectedCentimes),
      varianceDzd: centimesToDzd(closedRow ? closedRow.varianceCentimes : 0),
      isClosed: Boolean(closedRow),
      closedAt: closedRow?.closedAt || null,
      operatorName: closedRow?.operatorName || null,
      notes: closedRow?.notes || null,
      entries,
      history: this.cashClosings
        .filter((c) => c.clinicId === clinicId)
        .map((c) => ({
          id: c.id,
          closingDate: c.closingDate,
          totalDzd: centimesToDzd(c.totalCentimes),
          varianceDzd: centimesToDzd(c.varianceCentimes),
          operatorName: c.operatorName,
          closedAt: c.closedAt,
        })),
    };
  }

  async closeCashDay(clinicId: string, input: any) {
    if (this.cashClosings.some((c) => c.clinicId === clinicId && c.closingDate === input.closingDate)) {
      throw new Error(`La caisse du ${formatIsoToFr(input.closingDate)} est déjà clôturée.`);
    }
    const summary = await this.getCashClosingSummary(clinicId, input.closingDate);
    const cbCentimes = input.countedCbDzd !== undefined ? dzdToCentimes(input.countedCbDzd) : dzdToCentimes(summary.cbDzd);
    const cashCentimes = input.countedCashDzd !== undefined ? dzdToCentimes(input.countedCashDzd) : dzdToCentimes(summary.cashDzd);
    const checkCentimes = input.countedCheckTransferDzd !== undefined ? dzdToCentimes(input.countedCheckTransferDzd) : dzdToCentimes(summary.checkTransferDzd);
    const totalCentimes = cbCentimes + cashCentimes + checkCentimes;
    const expectedCentimes = dzdToCentimes(summary.expectedDzd);

    this.cashClosings.unshift({
      id: generateId('close'),
      clinicId,
      closingDate: input.closingDate,
      cbCentimes,
      cashCentimes,
      checkTransferCentimes: checkCentimes,
      totalCentimes,
      expectedCentimes,
      varianceCentimes: totalCentimes - expectedCentimes,
      operatorName: input.operatorName,
      notes: input.notes || '',
      closedAt: new Date().toISOString(),
    });
    return this.getCashClosingSummary(clinicId, input.closingDate);
  }

  async listHospitalizations(clinicId: string) {
    return this.hospitalizations.filter((h) => h.clinicId === clinicId);
  }

  async createHospitalization(clinicId: string, input: any) {
    const created: HospitalizationBox & { clinicId: string } = {
      id: generateId('hosp'),
      clinicId,
      boxCode: input.boxCode,
      animalId: input.animalId || null,
      patientName: input.patientName,
      species: input.species || '—',
      breed: input.breed || '—',
      ownerId: input.ownerId || null,
      ownerName: input.ownerName || '—',
      admissionDate: input.admissionDate || new Date().toISOString().slice(0, 10),
      reason: input.reason,
      veterinarian: input.veterinarian || 'Dr. Vétérinaire',
      status: input.status || 'Stable',
      diet: input.diet || 'Standard',
      lastCare: input.lastCare || 'Admission enregistrée',
      careLogs: [],
    };
    this.hospitalizations.push(created);
    return created;
  }

  async updateHospitalization(clinicId: string, id: string, updates: any, author: string) {
    const idx = this.hospitalizations.findIndex((h) => h.clinicId === clinicId && h.id === id);
    if (idx === -1) return null;
    const cur = this.hospitalizations[idx];
    const careLogs = [...(cur.careLogs || [])];
    let lastCare = updates.lastCare ?? cur.lastCare;
    if (updates.careNote) {
      careLogs.unshift({ id: generateId('care'), timestamp: new Date().toISOString(), note: updates.careNote, author });
      lastCare = `Aujourd'hui (${updates.careNote})`;
    }
    if (updates.discharge) {
      this.hospitalizations[idx] = {
        ...cur,
        animalId: null,
        patientName: 'Libre',
        species: '—',
        breed: '—',
        ownerId: null,
        ownerName: '—',
        admissionDate: '—',
        reason: 'Box désinfecté prêt pour admission',
        veterinarian: '—',
        status: 'Disponible',
        diet: '—',
        lastCare: `Sortie enregistrée par ${author}`,
        careLogs,
      };
    } else {
      this.hospitalizations[idx] = { ...cur, ...updates, lastCare, careLogs };
    }
    return this.hospitalizations[idx];
  }

  async getReportsOverview(clinicId: string): Promise<ReportsOverview> {
    const animals = this.animals.filter((a) => a.clinicId === clinicId && !a.archivedAt);
    const apts = this.appointments.filter((a) => a.clinicId === clinicId);
    const vacs = this.vaccinations.filter((v) => v.clinicId === clinicId);
    const invs = this.invoices.filter((i) => i.clinicId === clinicId && (i.status === 'Payée' || i.status === 'Partielle'));
    const consCount = this.medicalRecords.filter((m) => m.clinicId === clinicId && m.recordType === 'consultation').length;

    const totalAnimals = animals.length || 1;
    const totalApts = apts.length || 1;
    const sp = { Chat: 0, Chien: 0, Autre: 0 };
    animals.forEach((a) => { sp[a.species] = (sp[a.species] || 0) + 1; });
    const acts = { Vaccin: 0, Consultation: 0, Contrôle: 0, Urgence: 0 };
    apts.forEach((a) => { acts[a.type] = (acts[a.type] || 0) + 1; });
    const vacDone = vacs.filter((v) => v.status === 'Effectué').length;
    const revenueDzd = centimesToDzd(sumCentimes(invs.map((i) => dzdToCentimes(i.amountDzd))));

    return {
      consultationsCount: consCount + apts.length,
      newPatientsCount: animals.length,
      vaccinationCompletionRate: vacs.length > 0 ? Math.round((vacDone / vacs.length) * 1000) / 10 : 100,
      monthlyRevenueDzd: revenueDzd,
      speciesBreakdown: [
        { label: 'Félins (Chats)', count: sp.Chat, percentage: Math.round((sp.Chat / totalAnimals) * 100) },
        { label: 'Canins (Chiens)', count: sp.Chien, percentage: Math.round((sp.Chien / totalAnimals) * 100) },
        { label: 'NAC & Autres', count: sp.Autre, percentage: Math.round((sp.Autre / totalAnimals) * 100) },
      ],
      actTypeBreakdown: [
        { label: 'Vaccinations préventives', count: acts.Vaccin, percentage: Math.round((acts.Vaccin / totalApts) * 100) },
        { label: 'Consultations médecine générale', count: acts.Consultation, percentage: Math.round((acts.Consultation / totalApts) * 100) },
        { label: 'Contrôles & suivis', count: acts.Contrôle, percentage: Math.round((acts.Contrôle / totalApts) * 100) },
        { label: 'Urgences', count: acts.Urgence, percentage: Math.round((acts.Urgence / totalApts) * 100) },
      ],
    };
  }

  async getSmsConfig(clinicId: string): Promise<SmsConfig> {
    if (!this.smsConfigs.has(clinicId)) {
      this.smsConfigs.set(clinicId, {
        id: clinicId,
        clinic_id: clinicId,
        provider_mode: 'TEST',
        smsProviderMode: 'test',
        active_provider: 'Ooredoo_Business_Algeria',
        api_key_configured: Boolean(process.env.SMS_API_KEY),
        smsApiUrl: '',
        smsApiKey: '',
        smsSenderId: 'MyVet',
        simPlanLabel: 'Ooredoo 2500 (SMS Illimité Tous Réseaux)',
        enable_vaccination_reminders: true,
        vaccination_intervals: '7,3,1',
        enable_appointment_reminders: true,
        appointment_interval_hours: 24,
        sending_start_hour: 8,
        sending_end_hour: 20,
        timezone: 'Africa/Algiers',
      });
    }
    const cur = this.smsConfigs.get(clinicId)!;
    const mode = cur.provider_mode === 'PRODUCTION' || cur.smsProviderMode === 'live' ? 'PRODUCTION' : 'TEST';
    return {
      ...cur,
      provider_mode: mode,
      smsProviderMode: mode === 'PRODUCTION' ? 'live' : 'test',
      smsApiUrl: cur.smsApiUrl ?? '',
      smsApiKey: cur.smsApiKey ?? '',
      smsSenderId: cur.smsSenderId || 'MyVet',
      simPlanLabel: cur.simPlanLabel || 'Ooredoo 2500 (SMS Illimité Tous Réseaux)',
      api_key_configured: Boolean((cur.smsApiKey || '').trim() || cur.api_key_configured || process.env.SMS_API_KEY),
    };
  }

  async updateSmsConfig(clinicId: string, updates: Partial<SmsConfig>) {
    const cur = await this.getSmsConfig(clinicId);
    const nextProviderMode =
      updates.smsProviderMode !== undefined
        ? updates.smsProviderMode === 'live'
          ? 'PRODUCTION'
          : 'TEST'
        : updates.provider_mode !== undefined
        ? updates.provider_mode
        : cur.provider_mode;

    const nextApiKey =
      updates.smsApiKey !== undefined && updates.smsApiKey.trim() !== ''
        ? updates.smsApiKey.trim()
        : cur.smsApiKey || '';

    const next: SmsConfig = {
      ...cur,
      ...updates,
      provider_mode: nextProviderMode,
      smsProviderMode: nextProviderMode === 'PRODUCTION' ? 'live' : 'test',
      smsApiUrl: updates.smsApiUrl !== undefined ? updates.smsApiUrl.trim() : cur.smsApiUrl || '',
      smsApiKey: nextApiKey,
      smsSenderId: updates.smsSenderId !== undefined ? updates.smsSenderId.trim() || 'MyVet' : cur.smsSenderId || 'MyVet',
      simPlanLabel:
        updates.simPlanLabel !== undefined
          ? updates.simPlanLabel.trim() || 'Ooredoo 2500 (SMS Illimité Tous Réseaux)'
          : cur.simPlanLabel || 'Ooredoo 2500 (SMS Illimité Tous Réseaux)',
      api_key_configured: Boolean(nextApiKey || process.env.SMS_API_KEY),
    };
    this.smsConfigs.set(clinicId, next);
    return next;
  }

  async listSmsTemplates(clinicId: string) {
    return this.smsTemplates.filter((t) => t.clinicId === clinicId);
  }

  async upsertSmsTemplate(clinicId: string, input: any) {
    const id = input.id || generateId('tpl');
    const idx = this.smsTemplates.findIndex((t) => t.clinicId === clinicId && t.id === id);
    const item: SmsTemplate & { clinicId: string } = {
      id,
      clinicId,
      category: input.category,
      title: input.title,
      content: input.content,
      language: input.language || 'fr',
      is_default: Boolean(input.is_default),
    };
    if (idx === -1) this.smsTemplates.push(item);
    else this.smsTemplates[idx] = { ...this.smsTemplates[idx], ...item };
    return item;
  }

  async listSmsReminders(clinicId: string): Promise<SmsReminder[]> {
    return this.smsReminders
      .filter((r) => r.clinic_id === clinicId)
      .map((r) => {
        const o = this.owners.find((x) => x.id === r.owner_id);
        const a = this.animals.find((x) => x.id === r.animal_id);
        return {
          ...r,
          owner_name: o?.name,
          owner_phone: o?.phone,
          phone_normalized: o?.phoneNormalized,
          animal_name: a?.name,
          species: a?.species,
        };
      });
  }

  private enrichClaimed(r: any): ClaimedReminder {
    const o = this.owners.find((x) => x.id === r.owner_id);
    const a = this.animals.find((x) => x.id === r.animal_id);
    const v = r.vaccination_id ? this.vaccinations.find((x) => x.id === r.vaccination_id) : null;
    const apt = r.appointment_id ? this.appointments.find((x) => x.id === r.appointment_id) : null;
    return {
      ...r,
      owner_name: o?.name,
      owner_phone: o?.phone,
      phone_normalized: o?.phoneNormalized,
      preferred_language: o?.preferredLanguage || 'fr',
      sms_consent: o?.smsConsent !== false,
      owner_email: o?.email || null,
      animal_name: a?.name,
      species: a?.species,
      vaccine_name: v?.vaccineName || null,
      due_date: v?.nextDueDate || null,
      appointment_date: apt?.date || null,
      appointment_time: apt?.startTime || null,
    };
  }

  async getSmsReminderById(clinicId: string, id: string): Promise<ClaimedReminder | null> {
    const r = this.smsReminders.find((x) => x.clinic_id === clinicId && x.id === id);
    return r ? this.enrichClaimed(r) : null;
  }

  async scheduleReminders(clinicId: string, reminders: Array<any>): Promise<number> {
    let count = 0;
    for (const r of reminders) {
      if (this.smsReminders.some((x) => x.clinic_id === clinicId && x.idempotency_key === r.idempotencyKey)) {
        continue;
      }
      this.smsReminders.push({
        id: r.id || generateId('rem'),
        clinic_id: clinicId,
        owner_id: r.ownerId,
        animal_id: r.animalId,
        vaccination_id: r.vaccinationId || null,
        appointment_id: r.appointmentId || null,
        reminder_type: r.reminderType,
        scheduled_at: r.scheduledAt,
        status: 'Scheduled',
        idempotency_key: r.idempotencyKey,
        attempts: 0,
        is_simulated: true,
      });
      count++;
    }
    return count;
  }

  async cancelPendingRemindersForTarget(clinicId: string, target: { vaccinationId?: string; appointmentId?: string }) {
    let count = 0;
    for (const r of this.smsReminders) {
      if (r.clinic_id !== clinicId) continue;
      if (r.status !== 'Scheduled' && r.status !== 'Processing') continue;
      if (
        (target.vaccinationId && r.vaccination_id === target.vaccinationId) ||
        (target.appointmentId && r.appointment_id === target.appointmentId)
      ) {
        r.status = 'Cancelled';
        count++;
      }
    }
    return count;
  }

  async claimDueReminders(workerId: string, limit: number, now: Date, clinicId?: string): Promise<ClaimedReminder[]> {
    const nowMs = now.getTime();
    const leaseExpires = new Date(nowMs + 5 * 60_000).toISOString();
    const claimed: ClaimedReminder[] = [];

    for (const r of this.smsReminders) {
      if (claimed.length >= limit) break;
      if (clinicId && r.clinic_id !== clinicId) continue;
      const isDueScheduled = r.status === 'Scheduled' && new Date(r.scheduled_at).getTime() <= nowMs;
      const isExpiredLease =
        r.status === 'Processing' && r.lease_expires_at && new Date(r.lease_expires_at).getTime() < nowMs;
      if (!isDueScheduled && !isExpiredLease) continue;

      r.status = 'Processing';
      r.locked_at = now.toISOString();
      r.lease_expires_at = leaseExpires;
      r.worker_id = workerId;
      claimed.push(this.enrichClaimed(r));
    }
    return claimed;
  }

  async updateReminderDispatchState(id: string, patch: any) {
    const r = this.smsReminders.find((x) => x.id === id);
    if (!r) return;
    Object.assign(r, {
      status: patch.status,
      ...(patch.attempts !== undefined ? { attempts: patch.attempts } : {}),
      ...(patch.scheduledAt !== undefined ? { scheduled_at: patch.scheduledAt } : {}),
      ...(patch.lockedAt !== undefined ? { locked_at: patch.lockedAt } : {}),
      ...(patch.leaseExpiresAt !== undefined ? { lease_expires_at: patch.leaseExpiresAt } : {}),
      ...(patch.workerId !== undefined ? { worker_id: patch.workerId } : {}),
      ...(patch.providerId !== undefined ? { provider_id: patch.providerId } : {}),
      ...(patch.providerMessageId !== undefined ? { provider_message_id: patch.providerMessageId } : {}),
      ...(patch.isSimulated !== undefined ? { is_simulated: patch.isSimulated } : {}),
      ...(patch.lastError !== undefined ? { last_error: patch.lastError } : {}),
      ...(patch.sentAt !== undefined ? { sent_at: patch.sentAt } : {}),
    });
  }

  async listSmsLogs(clinicId: string) {
    return this.smsLogs
      .filter((l) => l.clinicId === clinicId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async createSmsLog(clinicId: string, log: Omit<SmsLog, 'id' | 'created_at'>) {
    const created: SmsLog & { clinicId: string } = {
      ...log,
      id: generateId('smslog'),
      clinicId,
      created_at: new Date().toISOString(),
    };
    this.smsLogs.unshift(created);
    return created;
  }

  async updateSmsStatusByProviderMessageId(
    providerMessageId: string,
    status: SmsDeliveryStatus,
    errorDetail?: string,
    rawPayload?: Record<string, unknown>
  ) {
    let touched = false;
    for (const l of this.smsLogs) {
      if (l.provider_message_id === providerMessageId) {
        l.status = status;
        if (rawPayload) l.provider_response = JSON.stringify(rawPayload);
        touched = true;
      }
    }
    for (const r of this.smsReminders) {
      if (r.provider_message_id === providerMessageId) {
        r.status = status;
        if (errorDetail) r.last_error = errorDetail;
        touched = true;
      }
    }
    return touched;
  }

  async writeAuditLog(clinicId: string, entry: any) {
    this.auditLogs.push({ id: generateId('aud'), clinicId, ...entry, createdAt: new Date().toISOString() });
  }

  async getTableCounts(clinicId: string) {
    return {
      owners: this.owners.filter((o) => o.clinicId === clinicId).length,
      animals: this.animals.filter((a) => a.clinicId === clinicId).length,
      vaccinations: this.vaccinations.filter((v) => v.clinicId === clinicId).length,
      appointments: this.appointments.filter((a) => a.clinicId === clinicId).length,
      tasks: this.tasks.filter((t) => t.clinicId === clinicId).length,
      stocks: this.stocks.filter((s) => s.clinicId === clinicId).length,
      invoices: this.invoices.filter((i) => i.clinicId === clinicId).length,
      hospitalizations: this.hospitalizations.filter((h) => h.clinicId === clinicId).length,
      smsReminders: this.smsReminders.filter((r) => r.clinic_id === clinicId).length,
      smsLogs: this.smsLogs.filter((l) => l.clinicId === clinicId).length,
    };
  }

  async runMigration(clinicId: string, payload: any, _importedBy: string): Promise<MigrationReport> {
    const batchHash = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          clients: payload.clients || [],
          patients: payload.patients || [],
          appointments: payload.appointments || [],
          tasks: payload.tasks || [],
          stocks: payload.stocks || [],
          vaccinations: payload.vaccinations || [],
          invoices: payload.invoices || [],
        })
      )
      .digest('hex');

    const dryRun = Boolean(payload.dryRun);
    const cacheKey = `${clinicId}:${batchHash}`;
    if (!dryRun && this.migrationImports.has(cacheKey)) {
      return {
        batchHash,
        dryRun: false,
        alreadyImported: true,
        summary: this.migrationImports.get(cacheKey),
        warnings: ['Ce lot exact a déjà été importé précédemment (idempotence garantie).'],
        databaseCounts: await this.getTableCounts(clinicId),
      };
    }

    const summary = {
      importedOwners: 0, skippedOwners: 0,
      importedAnimals: 0, skippedAnimals: 0,
      importedAppointments: 0, skippedAppointments: 0,
      importedTasks: 0, skippedTasks: 0,
      importedStocks: 0, skippedStocks: 0,
      importedVaccinations: 0, skippedVaccinations: 0,
      importedMedicalRecords: 0, skippedMedicalRecords: 0,
      importedInvoices: 0, skippedInvoices: 0,
    };
    const warnings: string[] = [];

    if (dryRun) {
      summary.importedOwners = (payload.clients || []).length;
      summary.importedAnimals = (payload.patients || []).length;
      summary.importedAppointments = (payload.appointments || []).length;
      summary.importedTasks = (payload.tasks || []).length;
      summary.importedStocks = (payload.stocks || []).length;
      summary.importedVaccinations = (payload.vaccinations || []).length;
      summary.importedInvoices = (payload.invoices || []).length;
      return {
        batchHash,
        dryRun: true,
        alreadyImported: this.migrationImports.has(cacheKey),
        summary,
        warnings,
        databaseCounts: await this.getTableCounts(clinicId),
      };
    }

    for (const c of payload.clients || []) {
      if (!c.id || !c.name || this.owners.some((o) => o.id === c.id)) {
        summary.skippedOwners++;
        continue;
      }
      const p = normalizeAlgerianPhone(String(c.phone || ''));
      if (!p.isValid) warnings.push(`Client "${c.name}" importé avec numéro non standard.`);
      this.owners.push({
        id: String(c.id),
        clinicId,
        name: String(c.name),
        phone: String(c.phone || ''),
        phoneNormalized: p.isValid ? p.e164 : String(c.phone || ''),
        email: String(c.email || ''),
        address: String(c.address || ''),
        animalsCount: 0,
        smsConsent: true,
        preferredLanguage: 'fr',
        archivedAt: null,
      });
      summary.importedOwners++;
    }

    for (const a of payload.patients || []) {
      if (!a.id || !a.name || !a.ownerId || this.animals.some((x) => x.id === a.id)) {
        summary.skippedAnimals++;
        continue;
      }
      const owner = this.owners.find((o) => o.clinicId === clinicId && o.id === a.ownerId);
      if (!owner) {
        summary.skippedAnimals++;
        continue;
      }
      this.animals.push({
        id: String(a.id),
        clinicId,
        name: String(a.name),
        species: a.species || 'Autre',
        breed: a.breed || 'Croisé',
        color: a.color || '—',
        gender: a.gender || 'Femelle',
        birthDate: a.birthDate || '—',
        age: a.age || '—',
        weight: a.weight || '—',
        microchip: a.microchip || '—',
        ownerId: owner.id,
        ownerName: owner.name,
        ownerPhone: owner.phone,
        veterinarian: a.veterinarian || 'Dr. Vétérinaire',
        nextVisit: a.nextVisit || 'Aucune visite planifiée',
        status: a.status || 'Actif',
        avatarEmoji: a.avatarEmoji || '🐾',
        medicalAlerts: a.medicalAlerts || [],
        archivedAt: null,
      });
      summary.importedAnimals++;
    }

    for (const apt of payload.appointments || []) {
      if (!apt.id || this.appointments.some((x) => x.id === apt.id)) {
        summary.skippedAppointments++;
        continue;
      }
      this.appointments.push({ ...apt, clinicId });
      summary.importedAppointments++;
    }

    for (const t of payload.tasks || []) {
      if (!t.id || this.tasks.some((x) => x.id === t.id)) {
        summary.skippedTasks++;
        continue;
      }
      this.tasks.push({ ...t, clinicId });
      summary.importedTasks++;
    }

    for (const s of payload.stocks || []) {
      if (!s.id || this.stocks.some((x) => x.id === s.id)) {
        summary.skippedStocks++;
        continue;
      }
      this.stocks.push({ ...s, clinicId });
      summary.importedStocks++;
    }

    for (const inv of payload.invoices || []) {
      if (!inv.id || this.invoices.some((x) => x.id === inv.id || x.number === inv.number)) {
        summary.skippedInvoices++;
        continue;
      }
      const amountDzd = Number(inv.amountDzd ?? inv.amount ?? 0);
      const issueDate = String(inv.issueDate || inv.date || new Date().toISOString().slice(0, 10));
      this.invoices.unshift({
        id: String(inv.id),
        clinicId,
        number: String(inv.number || `FAC-MIG-${crypto.randomInt(1000, 9999)}`),
        ownerId: inv.ownerId || null,
        clientName: String(inv.clientName || 'Client'),
        animalId: inv.animalId || null,
        patientName: String(inv.patientName || 'Patient'),
        issueDate,
        dateFormatted: formatIsoToFr(issueDate),
        currency: 'DZD',
        subtotalDzd: amountDzd,
        taxDzd: 0,
        amountDzd,
        paidDzd: inv.status === 'Payée' ? amountDzd : 0,
        status: inv.status || 'En attente',
        notes: String(inv.notes || 'Importé depuis localStorage'),
        items: [],
      });
      summary.importedInvoices++;
    }

    this.migrationImports.set(cacheKey, summary);
    return {
      batchHash,
      dryRun: false,
      alreadyImported: false,
      summary,
      warnings,
      databaseCounts: await this.getTableCounts(clinicId),
    };
  }
}
