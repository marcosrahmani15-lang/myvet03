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
import { query, withTransaction } from '../database/pool.ts';
import { generateId } from '../utils/crypto.ts';
import type { ClaimedReminder, ClinicStore } from './types.ts';

function formatIsoToFr(dateStr: string): string {
  if (!dateStr) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!match) return dateStr;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatIsoToEnShort(dateStr: string): string {
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function toIsoDateOnly(val: any): string {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

export class PostgresClinicStore implements ClinicStore {
  readonly engineName = 'PostgreSQL (Supabase)' as const;
  readonly isPostgres = true;

  // =========================================================================
  // AUTH & TENANT
  // =========================================================================
  async findUserByIdentifier(
    identifier: string
  ): Promise<(AuthUser & { passwordHash: string; isActive: boolean }) | null> {
    const clean = identifier.trim().toLowerCase();
    const res = await query(
      `SELECT id, email, username, full_name, avatar_initials, password_hash, is_active
       FROM users
       WHERE LOWER(email) = $1 OR LOWER(username) = $1
       LIMIT 1`,
      [clean]
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      fullName: row.full_name,
      avatarInitials: row.avatar_initials,
      passwordHash: row.password_hash,
      isActive: Boolean(row.is_active),
    };
  }

  async findUserById(userId: string): Promise<(AuthUser & { isActive: boolean }) | null> {
    const res = await query(
      `SELECT id, email, username, full_name, avatar_initials, is_active
       FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      fullName: row.full_name,
      avatarInitials: row.avatar_initials,
      isActive: Boolean(row.is_active),
    };
  }

  async getUserMemberships(userId: string): Promise<ClinicMembership[]> {
    const res = await query(
      `SELECT m.clinic_id, c.name AS clinic_name, c.slug AS clinic_slug, m.role, m.title, m.is_default
       FROM clinic_memberships m
       JOIN clinics c ON c.id = m.clinic_id
       WHERE m.user_id = $1
       ORDER BY m.is_default DESC, c.name ASC`,
      [userId]
    );
    return res.rows.map((r) => ({
      clinicId: r.clinic_id,
      clinicName: r.clinic_name,
      clinicSlug: r.clinic_slug,
      role: r.role,
      title: r.title || undefined,
      isDefault: Boolean(r.is_default),
    }));
  }

  async getClinicById(clinicId: string): Promise<Clinic | null> {
    const res = await query(
      `SELECT id, name, slug, slogan, address, phone, email, timezone, currency
       FROM clinics WHERE id = $1 LIMIT 1`,
      [clinicId]
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      slogan: r.slogan || '',
      address: r.address || '',
      phone: r.phone || '',
      email: r.email || '',
      timezone: r.timezone || 'Africa/Algiers',
      currency: 'DZD',
    };
  }

  async updateClinic(clinicId: string, data: Partial<Clinic>): Promise<Clinic> {
    const current = await this.getClinicById(clinicId);
    if (!current) throw new Error('Clinique introuvable');
    const res = await query(
      `UPDATE clinics
       SET name = $2, slogan = $3, address = $4, phone = $5, email = $6, updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, slug, slogan, address, phone, email, timezone, currency`,
      [
        clinicId,
        data.name ?? current.name,
        data.slogan ?? current.slogan,
        data.address ?? current.address,
        data.phone ?? current.phone,
        data.email ?? current.email ?? '',
      ]
    );
    const r = res.rows[0];
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      slogan: r.slogan,
      address: r.address,
      phone: r.phone,
      email: r.email,
      timezone: r.timezone,
      currency: 'DZD',
    };
  }

  async checkAndRecordLoginAttempt(
    key: string,
    maxAttempts: number,
    windowMs: number,
    lockMs: number
  ): Promise<{ allowed: boolean; retryAfterSec?: number }> {
    return withTransaction(async (client) => {
      const now = new Date();
      const res = await client.query(
        `SELECT attempts, first_attempt_at, locked_until FROM login_attempts WHERE key = $1 FOR UPDATE`,
        [key]
      );
      const row = res.rows[0];
      if (row?.locked_until && new Date(row.locked_until) > now) {
        const retryAfterSec = Math.ceil((new Date(row.locked_until).getTime() - now.getTime()) / 1000);
        return { allowed: false, retryAfterSec };
      }

      if (!row || now.getTime() - new Date(row.first_attempt_at).getTime() > windowMs) {
        await client.query(
          `INSERT INTO login_attempts (key, attempts, first_attempt_at, locked_until, updated_at)
           VALUES ($1, 1, $2, NULL, $2)
           ON CONFLICT (key) DO UPDATE SET attempts = 1, first_attempt_at = $2, locked_until = NULL, updated_at = $2`,
          [key, now.toISOString()]
        );
        return { allowed: true };
      }

      const nextAttempts = Number(row.attempts) + 1;
      const lockedUntil = nextAttempts >= maxAttempts ? new Date(now.getTime() + lockMs).toISOString() : null;
      await client.query(
        `UPDATE login_attempts SET attempts = $2, locked_until = $3, updated_at = $4 WHERE key = $1`,
        [key, nextAttempts, lockedUntil, now.toISOString()]
      );

      if (lockedUntil) {
        return { allowed: false, retryAfterSec: Math.ceil(lockMs / 1000) };
      }
      return { allowed: true };
    });
  }

  async clearLoginAttempts(key: string): Promise<void> {
    await query(`DELETE FROM login_attempts WHERE key = $1`, [key]);
  }

  // =========================================================================
  // OWNERS
  // =========================================================================
  async listOwners(clinicId: string, includeArchived = false): Promise<Client[]> {
    const res = await query(
      `SELECT o.*,
              (SELECT COUNT(*)::int FROM animals a WHERE a.owner_id = o.id AND a.clinic_id = o.clinic_id AND a.archived_at IS NULL) AS animals_count
       FROM owners o
       WHERE o.clinic_id = $1
         AND ($2::boolean OR o.archived_at IS NULL)
       ORDER BY o.name ASC`,
      [clinicId, includeArchived],
      clinicId
    );
    return res.rows.map((r) => ({
      id: r.id,
      clinicId: r.clinic_id,
      name: r.name,
      phone: r.phone,
      phoneNormalized: r.phone_normalized,
      email: r.email || '',
      address: r.address || '',
      preferredLanguage: r.preferred_language || 'fr',
      smsConsent: Boolean(r.sms_consent),
      notes: r.notes || '',
      animalsCount: Number(r.animals_count || 0),
      archivedAt: r.archived_at ? new Date(r.archived_at).toISOString() : null,
    }));
  }

  async getOwnerById(clinicId: string, id: string): Promise<Client | null> {
    const res = await query(
      `SELECT o.*,
              (SELECT COUNT(*)::int FROM animals a WHERE a.owner_id = o.id AND a.clinic_id = o.clinic_id AND a.archived_at IS NULL) AS animals_count
       FROM owners o
       WHERE o.clinic_id = $1 AND o.id = $2
       LIMIT 1`,
      [clinicId, id],
      clinicId
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: r.id,
      clinicId: r.clinic_id,
      name: r.name,
      phone: r.phone,
      phoneNormalized: r.phone_normalized,
      email: r.email || '',
      address: r.address || '',
      preferredLanguage: r.preferred_language || 'fr',
      smsConsent: Boolean(r.sms_consent),
      notes: r.notes || '',
      animalsCount: Number(r.animals_count || 0),
      archivedAt: r.archived_at ? new Date(r.archived_at).toISOString() : null,
    };
  }

  async createOwner(clinicId: string, input: any): Promise<Client> {
    const id = input.id || generateId('c');
    const phoneInfo = normalizeAlgerianPhone(input.phone);
    await query(
      `INSERT INTO owners (id, clinic_id, name, phone, phone_normalized, email, address, preferred_language, sms_consent, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        clinicId,
        input.name,
        phoneInfo.national || input.phone,
        phoneInfo.e164,
        input.email || '',
        input.address || '',
        input.preferredLanguage || 'fr',
        input.smsConsent !== false,
        input.notes || '',
      ],
      clinicId
    );
    return (await this.getOwnerById(clinicId, id))!;
  }

  async updateOwner(clinicId: string, id: string, updates: any): Promise<Client | null> {
    const current = await this.getOwnerById(clinicId, id);
    if (!current) return null;
    const nextPhone = updates.phone !== undefined ? updates.phone : current.phone;
    const phoneInfo = normalizeAlgerianPhone(nextPhone);

    await query(
      `UPDATE owners
       SET name = $3,
           phone = $4,
           phone_normalized = $5,
           email = $6,
           address = $7,
           preferred_language = $8,
           sms_consent = $9,
           notes = $10,
           updated_at = NOW()
       WHERE clinic_id = $1 AND id = $2`,
      [
        clinicId,
        id,
        updates.name ?? current.name,
        phoneInfo.national || nextPhone,
        phoneInfo.e164 || current.phoneNormalized || nextPhone,
        updates.email ?? current.email,
        updates.address ?? current.address,
        updates.preferredLanguage ?? current.preferredLanguage ?? 'fr',
        updates.smsConsent !== undefined ? Boolean(updates.smsConsent) : current.smsConsent !== false,
        updates.notes ?? current.notes ?? '',
      ],
      clinicId
    );
    return this.getOwnerById(clinicId, id);
  }

  async archiveOrDeleteOwner(
    clinicId: string,
    id: string
  ): Promise<{ action: 'deleted' | 'archived'; reason?: string } | null> {
    const current = await this.getOwnerById(clinicId, id);
    if (!current) return null;

    const depRes = await query(
      `SELECT
        (SELECT COUNT(*)::int FROM animals WHERE clinic_id = $1 AND owner_id = $2) AS animals,
        (SELECT COUNT(*)::int FROM invoices WHERE clinic_id = $1 AND owner_id = $2) AS invoices,
        (SELECT COUNT(*)::int FROM appointments WHERE clinic_id = $1 AND owner_id = $2) AS appointments,
        (SELECT COUNT(*)::int FROM vaccinations WHERE clinic_id = $1 AND owner_id = $2) AS vaccinations`,
      [clinicId, id],
      clinicId
    );
    const deps = depRes.rows[0];
    const hasHistory =
      Number(deps.animals) > 0 ||
      Number(deps.invoices) > 0 ||
      Number(deps.appointments) > 0 ||
      Number(deps.vaccinations) > 0;

    if (hasHistory) {
      await query(
        `UPDATE owners SET archived_at = NOW(), sms_consent = FALSE, updated_at = NOW() WHERE clinic_id = $1 AND id = $2`,
        [clinicId, id],
        clinicId
      );
      return {
        action: 'archived',
        reason: 'Dossier archivé pour préserver l’historique médical, vaccinal et comptable (DZD).',
      };
    }

    await query(`DELETE FROM owners WHERE clinic_id = $1 AND id = $2`, [clinicId, id], clinicId);
    return { action: 'deleted' };
  }

  // =========================================================================
  // ANIMALS
  // =========================================================================
  async listAnimals(clinicId: string, includeArchived = false): Promise<Patient[]> {
    const res = await query(
      `SELECT a.*, o.name AS owner_name, o.phone AS owner_phone
       FROM animals a
       JOIN owners o ON o.id = a.owner_id AND o.clinic_id = a.clinic_id
       WHERE a.clinic_id = $1
         AND ($2::boolean OR a.archived_at IS NULL)
       ORDER BY a.name ASC`,
      [clinicId, includeArchived],
      clinicId
    );
    return res.rows.map((r) => this.mapAnimalRow(r));
  }

  async getAnimalById(clinicId: string, id: string): Promise<Patient | null> {
    const res = await query(
      `SELECT a.*, o.name AS owner_name, o.phone AS owner_phone
       FROM animals a
       JOIN owners o ON o.id = a.owner_id AND o.clinic_id = a.clinic_id
       WHERE a.clinic_id = $1 AND a.id = $2
       LIMIT 1`,
      [clinicId, id],
      clinicId
    );
    return res.rows[0] ? this.mapAnimalRow(res.rows[0]) : null;
  }

  private mapAnimalRow(r: any): Patient {
    return {
      id: r.id,
      clinicId: r.clinic_id,
      name: r.name,
      species: r.species,
      breed: r.breed || 'Croisé',
      color: r.color || '—',
      gender: r.gender || 'Femelle',
      birthDate: r.birth_date || '—',
      age: r.age || '—',
      weight: r.weight || '—',
      microchip: r.microchip || '—',
      ownerId: r.owner_id,
      ownerName: r.owner_name || '',
      ownerPhone: r.owner_phone || '',
      veterinarian: r.veterinarian || 'Dr. Vétérinaire',
      nextVisit: r.next_visit || 'Aucune visite planifiée',
      status: r.status || 'Actif',
      avatarEmoji: r.avatar_emoji || (r.species === 'Chien' ? '🐶' : '🐱'),
      medicalAlerts: Array.isArray(r.medical_alerts) ? r.medical_alerts : [],
      medicalNotes: r.medical_notes || '',
      archivedAt: r.archived_at ? new Date(r.archived_at).toISOString() : null,
    };
  }

  async createAnimal(clinicId: string, input: any): Promise<Patient> {
    const owner = await this.getOwnerById(clinicId, input.ownerId);
    if (!owner) {
      throw new Error('Propriétaire introuvable dans ce cabinet');
    }
    const id = input.id || generateId('pet');
    const emoji = input.avatarEmoji || (input.species === 'Chien' ? '🐶' : input.species === 'Chat' ? '🐱' : '🐾');

    await query(
      `INSERT INTO animals (
         id, clinic_id, owner_id, name, species, breed, color, gender,
         birth_date, age, weight, microchip, veterinarian, next_visit,
         status, avatar_emoji, medical_alerts, medical_notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18)`,
      [
        id,
        clinicId,
        input.ownerId,
        input.name,
        input.species,
        input.breed || 'Croisé',
        input.color || '—',
        input.gender || 'Femelle',
        input.birthDate || '—',
        input.age || '—',
        input.weight || '—',
        input.microchip || '—',
        input.veterinarian || 'Dr. Vétérinaire',
        input.nextVisit || 'Aucune visite planifiée',
        input.status || 'Actif',
        emoji,
        JSON.stringify(input.medicalAlerts || []),
        input.medicalNotes || '',
      ],
      clinicId
    );
    return (await this.getAnimalById(clinicId, id))!;
  }

  async updateAnimal(clinicId: string, id: string, updates: any): Promise<Patient | null> {
    const current = await this.getAnimalById(clinicId, id);
    if (!current) return null;

    if (updates.ownerId && updates.ownerId !== current.ownerId) {
      const owner = await this.getOwnerById(clinicId, updates.ownerId);
      if (!owner) throw new Error('Propriétaire introuvable dans ce cabinet');
    }

    await query(
      `UPDATE animals
       SET owner_id = $3, name = $4, species = $5, breed = $6, color = $7, gender = $8,
           birth_date = $9, age = $10, weight = $11, microchip = $12, veterinarian = $13,
           next_visit = $14, status = $15, avatar_emoji = $16, medical_alerts = $17::jsonb,
           medical_notes = $18, updated_at = NOW()
       WHERE clinic_id = $1 AND id = $2`,
      [
        clinicId,
        id,
        updates.ownerId ?? current.ownerId,
        updates.name ?? current.name,
        updates.species ?? current.species,
        updates.breed ?? current.breed,
        updates.color ?? current.color,
        updates.gender ?? current.gender,
        updates.birthDate ?? current.birthDate,
        updates.age ?? current.age,
        updates.weight ?? current.weight,
        updates.microchip ?? current.microchip,
        updates.veterinarian ?? current.veterinarian,
        updates.nextVisit ?? current.nextVisit,
        updates.status ?? current.status,
        updates.avatarEmoji ?? current.avatarEmoji,
        JSON.stringify(updates.medicalAlerts ?? current.medicalAlerts ?? []),
        updates.medicalNotes ?? current.medicalNotes ?? '',
      ],
      clinicId
    );
    return this.getAnimalById(clinicId, id);
  }

  async archiveOrDeleteAnimal(
    clinicId: string,
    id: string
  ): Promise<{ action: 'deleted' | 'archived'; reason?: string } | null> {
    const current = await this.getAnimalById(clinicId, id);
    if (!current) return null;

    const depRes = await query(
      `SELECT
        (SELECT COUNT(*)::int FROM vaccinations WHERE clinic_id = $1 AND animal_id = $2) AS vaccinations,
        (SELECT COUNT(*)::int FROM appointments WHERE clinic_id = $1 AND animal_id = $2) AS appointments,
        (SELECT COUNT(*)::int FROM medical_records WHERE clinic_id = $1 AND animal_id = $2) AS medical_records,
        (SELECT COUNT(*)::int FROM invoices WHERE clinic_id = $1 AND animal_id = $2) AS invoices`,
      [clinicId, id],
      clinicId
    );
    const d = depRes.rows[0];
    const hasHistory =
      Number(d.vaccinations) > 0 ||
      Number(d.appointments) > 0 ||
      Number(d.medical_records) > 0 ||
      Number(d.invoices) > 0;

    if (hasHistory) {
      await query(
        `UPDATE animals SET status = 'Inactif', archived_at = NOW(), updated_at = NOW() WHERE clinic_id = $1 AND id = $2`,
        [clinicId, id],
        clinicId
      );
      return {
        action: 'archived',
        reason: 'Patient archivé (statut Inactif) pour préserver son dossier médical et ses vaccinations.',
      };
    }

    await query(`DELETE FROM animals WHERE clinic_id = $1 AND id = $2`, [clinicId, id], clinicId);
    return { action: 'deleted' };
  }

  // =========================================================================
  // MEDICAL RECORDS
  // =========================================================================
  async listMedicalRecords(clinicId: string, animalId?: string): Promise<any[]> {
    const res = await query(
      `SELECT * FROM medical_records
       WHERE clinic_id = $1 AND ($2::text IS NULL OR animal_id = $2)
       ORDER BY created_at DESC`,
      [clinicId, animalId || null],
      clinicId
    );
    return res.rows.map((r) => ({
      id: r.id,
      animalId: r.animal_id,
      patientId: r.animal_id,
      recordType: r.record_type,
      recordedAt: r.recorded_at,
      author: r.author,
      title: r.title,
      ...(typeof r.payload === 'object' && r.payload ? r.payload : {}),
    }));
  }

  async createMedicalRecord(clinicId: string, input: any): Promise<any> {
    const animal = await this.getAnimalById(clinicId, input.animalId);
    if (!animal) throw new Error('Patient introuvable dans ce cabinet');

    const id = input.id || generateId('med');
    const recordedAt = input.recordedAt || formatIsoToFr(new Date().toISOString().slice(0, 10));
    await query(
      `INSERT INTO medical_records (id, clinic_id, animal_id, record_type, recorded_at, author, title, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        id,
        clinicId,
        input.animalId,
        input.recordType,
        recordedAt,
        input.author || '',
        input.title || '',
        JSON.stringify(input.payload || {}),
      ],
      clinicId
    );
    return {
      id,
      animalId: input.animalId,
      patientId: input.animalId,
      recordType: input.recordType,
      recordedAt,
      author: input.author || '',
      title: input.title || '',
      ...(input.payload || {}),
    };
  }

  async toggleMedicalReminder(clinicId: string, id: string): Promise<any | null> {
    const res = await query(
      `SELECT * FROM medical_records WHERE clinic_id = $1 AND id = $2 AND record_type = 'reminder' LIMIT 1`,
      [clinicId, id],
      clinicId
    );
    const row = res.rows[0];
    if (!row) return null;
    const payload = { ...(row.payload || {}), completed: !Boolean(row.payload?.completed) };
    await query(
      `UPDATE medical_records SET payload = $3::jsonb, updated_at = NOW() WHERE clinic_id = $1 AND id = $2`,
      [clinicId, id, JSON.stringify(payload)],
      clinicId
    );
    return {
      id: row.id,
      animalId: row.animal_id,
      patientId: row.animal_id,
      recordType: row.record_type,
      recordedAt: row.recorded_at,
      ...payload,
    };
  }

  async deleteMedicalDocument(clinicId: string, id: string): Promise<boolean> {
    const res = await query(
      `DELETE FROM medical_records WHERE clinic_id = $1 AND id = $2 AND record_type = 'document'`,
      [clinicId, id],
      clinicId
    );
    return (res.rowCount || 0) > 0;
  }

  // =========================================================================
  // VACCINATIONS
  // =========================================================================
  async listVaccinations(clinicId: string, animalId?: string): Promise<VaccinationRecord[]> {
    const res = await query(
      `SELECT v.*, a.name AS animal_name, o.name AS owner_name
       FROM vaccinations v
       JOIN animals a ON a.id = v.animal_id AND a.clinic_id = v.clinic_id
       JOIN owners o ON o.id = v.owner_id AND o.clinic_id = v.clinic_id
       WHERE v.clinic_id = $1 AND ($2::text IS NULL OR v.animal_id = $2)
       ORDER BY v.next_due_date ASC`,
      [clinicId, animalId || null],
      clinicId
    );
    return res.rows.map((r) => ({
      id: r.id,
      animalId: r.animal_id,
      animalName: r.animal_name,
      ownerId: r.owner_id,
      ownerName: r.owner_name,
      vaccineName: r.vaccine_name,
      administeredDate: toIsoDateOnly(r.administered_date),
      nextDueDate: toIsoDateOnly(r.next_due_date),
      lotNumber: r.lot_number || '',
      veterinarian: r.veterinarian,
      notes: r.notes || '',
      status: r.status,
    }));
  }

  async getVaccinationById(clinicId: string, id: string): Promise<VaccinationRecord | null> {
    const res = await query(
      `SELECT v.*, a.name AS animal_name, o.name AS owner_name
       FROM vaccinations v
       JOIN animals a ON a.id = v.animal_id AND a.clinic_id = v.clinic_id
       JOIN owners o ON o.id = v.owner_id AND o.clinic_id = v.clinic_id
       WHERE v.clinic_id = $1 AND v.id = $2 LIMIT 1`,
      [clinicId, id],
      clinicId
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: r.id,
      animalId: r.animal_id,
      animalName: r.animal_name,
      ownerId: r.owner_id,
      ownerName: r.owner_name,
      vaccineName: r.vaccine_name,
      administeredDate: toIsoDateOnly(r.administered_date),
      nextDueDate: toIsoDateOnly(r.next_due_date),
      lotNumber: r.lot_number || '',
      veterinarian: r.veterinarian,
      notes: r.notes || '',
      status: r.status,
    };
  }

  async createVaccination(clinicId: string, input: any): Promise<VaccinationRecord> {
    const animal = await this.getAnimalById(clinicId, input.animalId);
    if (!animal) throw new Error('Animal introuvable dans ce cabinet');
    const ownerId = input.ownerId || animal.ownerId;
    const id = input.id || generateId('vac');

    await query(
      `INSERT INTO vaccinations (
         id, clinic_id, animal_id, owner_id, vaccine_name, administered_date,
         next_due_date, lot_number, veterinarian, notes, status
       ) VALUES ($1,$2,$3,$4,$5,$6::date,$7::date,$8,$9,$10,$11)`,
      [
        id,
        clinicId,
        animal.id,
        ownerId,
        input.vaccineName,
        input.administeredDate,
        input.nextDueDate,
        input.lotNumber || '',
        input.veterinarian || 'Dr. Vétérinaire',
        input.notes || '',
        input.status || 'Effectué',
      ],
      clinicId
    );
    return (await this.getVaccinationById(clinicId, id))!;
  }

  async updateVaccination(
    clinicId: string,
    id: string,
    updates: any
  ): Promise<VaccinationRecord | null> {
    const current = await this.getVaccinationById(clinicId, id);
    if (!current) return null;
    await query(
      `UPDATE vaccinations
       SET vaccine_name = $3, administered_date = $4::date, next_due_date = $5::date,
           lot_number = $6, veterinarian = $7, notes = $8, status = $9, updated_at = NOW()
       WHERE clinic_id = $1 AND id = $2`,
      [
        clinicId,
        id,
        updates.vaccineName ?? current.vaccineName,
        updates.administeredDate ?? current.administeredDate,
        updates.nextDueDate ?? current.nextDueDate,
        updates.lotNumber ?? current.lotNumber ?? '',
        updates.veterinarian ?? current.veterinarian,
        updates.notes ?? current.notes ?? '',
        updates.status ?? current.status,
      ],
      clinicId
    );
    return this.getVaccinationById(clinicId, id);
  }

  async deleteVaccination(clinicId: string, id: string): Promise<boolean> {
    const res = await query(
      `DELETE FROM vaccinations WHERE clinic_id = $1 AND id = $2`,
      [clinicId, id],
      clinicId
    );
    return (res.rowCount || 0) > 0;
  }

  // =========================================================================
  // APPOINTMENTS
  // =========================================================================
  async listAppointments(clinicId: string): Promise<Appointment[]> {
    const res = await query(
      `SELECT * FROM appointments WHERE clinic_id = $1 ORDER BY date ASC, start_time ASC`,
      [clinicId],
      clinicId
    );
    return res.rows.map((r) => this.mapAppointmentRow(r));
  }

  async getAppointmentById(clinicId: string, id: string): Promise<Appointment | null> {
    const res = await query(
      `SELECT * FROM appointments WHERE clinic_id = $1 AND id = $2 LIMIT 1`,
      [clinicId, id],
      clinicId
    );
    return res.rows[0] ? this.mapAppointmentRow(res.rows[0]) : null;
  }

  private mapAppointmentRow(r: any): Appointment {
    return {
      id: r.id,
      clinicId: r.clinic_id,
      patientId: r.animal_id,
      patientName: r.animal_name,
      clientId: r.owner_id,
      clientName: r.owner_name,
      date: toIsoDateOnly(r.date),
      startTime: r.start_time,
      endTime: r.end_time,
      type: r.type,
      reason: r.reason,
      veterinarian: r.veterinarian,
      status: r.status,
      notes: r.notes || '',
    };
  }

  async createAppointment(clinicId: string, input: any): Promise<Appointment> {
    const animal = await this.getAnimalById(clinicId, input.patientId);
    if (!animal) throw new Error('Patient introuvable dans ce cabinet');

    // Prevent overlapping active bookings for same veterinarian on same date/time
    const overlap = await query(
      `SELECT id FROM appointments
       WHERE clinic_id = $1 AND date = $2::date AND veterinarian = $3
         AND status NOT IN ('Annulé', 'Manqué')
         AND NOT (end_time <= $4 OR start_time >= $5)
       LIMIT 1`,
      [clinicId, input.date, input.veterinarian, input.startTime, input.endTime],
      clinicId
    );
    if (overlap.rows.length > 0) {
      throw new Error(`Créneau indisponible : ${input.veterinarian} a déjà un rendez-vous sur cette plage horaire.`);
    }

    const id = input.id || generateId('apt');
    await query(
      `INSERT INTO appointments (
         id, clinic_id, animal_id, animal_name, owner_id, owner_name,
         date, start_time, end_time, type, reason, veterinarian, status, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8,$9,$10,$11,$12,$13,$14)`,
      [
        id,
        clinicId,
        animal.id,
        animal.name,
        animal.ownerId,
        animal.ownerName,
        input.date,
        input.startTime,
        input.endTime,
        input.type,
        input.reason,
        input.veterinarian,
        input.status || 'Confirmé',
        input.notes || '',
      ],
      clinicId
    );
    return (await this.getAppointmentById(clinicId, id))!;
  }

  async updateAppointment(clinicId: string, id: string, updates: any): Promise<Appointment | null> {
    const current = await this.getAppointmentById(clinicId, id);
    if (!current) return null;

    let patientName = updates.patientName ?? current.patientName;
    let clientId = updates.clientId ?? current.clientId;
    let clientName = updates.clientName ?? current.clientName;
    const patientId = updates.patientId ?? current.patientId;

    if (updates.patientId && updates.patientId !== current.patientId) {
      const animal = await this.getAnimalById(clinicId, updates.patientId);
      if (!animal) throw new Error('Patient introuvable dans ce cabinet');
      patientName = animal.name;
      clientId = animal.ownerId;
      clientName = animal.ownerName;
    }

    const nextDate = updates.date ?? current.date;
    const nextStart = updates.startTime ?? current.startTime;
    const nextEnd = updates.endTime ?? current.endTime;
    const nextVet = updates.veterinarian ?? current.veterinarian;
    const nextStatus = updates.status ?? current.status;

    if (nextEnd <= nextStart) {
      throw new Error("L'heure de fin doit être postérieure à l'heure de début");
    }

    if (nextStatus !== 'Annulé' && nextStatus !== 'Manqué') {
      const overlap = await query(
        `SELECT id FROM appointments
         WHERE clinic_id = $1 AND id <> $2 AND date = $3::date AND veterinarian = $4
           AND status NOT IN ('Annulé', 'Manqué')
           AND NOT (end_time <= $5 OR start_time >= $6)
         LIMIT 1`,
        [clinicId, id, nextDate, nextVet, nextStart, nextEnd],
        clinicId
      );
      if (overlap.rows.length > 0) {
        throw new Error(`Créneau indisponible : ${nextVet} a déjà un rendez-vous sur cette plage horaire.`);
      }
    }

    await query(
      `UPDATE appointments
       SET animal_id = $3, animal_name = $4, owner_id = $5, owner_name = $6,
           date = $7::date, start_time = $8, end_time = $9, type = $10,
           reason = $11, veterinarian = $12, status = $13, notes = $14, updated_at = NOW()
       WHERE clinic_id = $1 AND id = $2`,
      [
        clinicId,
        id,
        patientId,
        patientName,
        clientId,
        clientName,
        nextDate,
        nextStart,
        nextEnd,
        updates.type ?? current.type,
        updates.reason ?? current.reason,
        nextVet,
        nextStatus,
        updates.notes ?? current.notes ?? '',
      ],
      clinicId
    );
    return this.getAppointmentById(clinicId, id);
  }

  async deleteAppointment(clinicId: string, id: string): Promise<boolean> {
    const res = await query(
      `DELETE FROM appointments WHERE clinic_id = $1 AND id = $2`,
      [clinicId, id],
      clinicId
    );
    return (res.rowCount || 0) > 0;
  }

  // =========================================================================
  // TASKS
  // =========================================================================
  async listTasks(clinicId: string): Promise<Task[]> {
    const tasksRes = await query(
      `SELECT * FROM tasks WHERE clinic_id = $1 ORDER BY completed ASC, due_date ASC`,
      [clinicId],
      clinicId
    );
    const commentsRes = await query(
      `SELECT * FROM task_comments WHERE clinic_id = $1 ORDER BY created_at ASC`,
      [clinicId],
      clinicId
    );
    const byTask = new Map<string, any[]>();
    for (const c of commentsRes.rows) {
      const list = byTask.get(c.task_id) || [];
      list.push({
        id: c.id,
        author: c.author,
        avatar: c.avatar,
        text: c.text,
        date: c.comment_date,
      });
      byTask.set(c.task_id, list);
    }

    return tasksRes.rows.map((r) => ({
      id: r.id,
      clinicId: r.clinic_id,
      title: r.title,
      description: r.description || '',
      priority: r.priority,
      category: r.category,
      assignedTo: r.assigned_to,
      createdBy: r.created_by,
      dueDate: toIsoDateOnly(r.due_date),
      dueDateFormatted: r.due_date_formatted || formatIsoToEnShort(toIsoDateOnly(r.due_date)),
      completed: Boolean(r.completed),
      comments: byTask.get(r.id) || [],
      relatedPatientId: r.related_patient_id || undefined,
      boxNumber: r.box_number || undefined,
    }));
  }

  async createTask(clinicId: string, input: any): Promise<Task> {
    const id = input.id || generateId('task');
    const dueDateFormatted = input.dueDateFormatted || formatIsoToEnShort(input.dueDate);
    await query(
      `INSERT INTO tasks (
         id, clinic_id, title, description, priority, category, assigned_to,
         created_by, due_date, due_date_formatted, completed, related_patient_id, box_number
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10,FALSE,$11,$12)`,
      [
        id,
        clinicId,
        input.title,
        input.description || '',
        input.priority || 'Normale',
        input.category || 'Médicale',
        input.assignedTo,
        input.createdBy || 'Dr. Vétérinaire',
        input.dueDate,
        dueDateFormatted,
        input.relatedPatientId || null,
        input.boxNumber || null,
      ],
      clinicId
    );
    const all = await this.listTasks(clinicId);
    return all.find((t) => t.id === id)!;
  }

  async updateTask(clinicId: string, id: string, updates: any): Promise<Task | null> {
    const all = await this.listTasks(clinicId);
    const current = all.find((t) => t.id === id);
    if (!current) return null;

    const nextDue = updates.dueDate ?? current.dueDate;
    const nextFmt = updates.dueDateFormatted ?? (updates.dueDate ? formatIsoToEnShort(nextDue) : current.dueDateFormatted);

    await query(
      `UPDATE tasks
       SET title = $3, description = $4, priority = $5, category = $6,
           assigned_to = $7, due_date = $8::date, due_date_formatted = $9,
           completed = $10, updated_at = NOW()
       WHERE clinic_id = $1 AND id = $2`,
      [
        clinicId,
        id,
        updates.title ?? current.title,
        updates.description ?? current.description,
        updates.priority ?? current.priority,
        updates.category ?? current.category,
        updates.assignedTo ?? current.assignedTo,
        nextDue,
        nextFmt,
        updates.completed !== undefined ? Boolean(updates.completed) : current.completed,
      ],
      clinicId
    );

    const updated = await this.listTasks(clinicId);
    return updated.find((t) => t.id === id) || null;
  }

  async addTaskComment(
    clinicId: string,
    taskId: string,
    comment: { author: string; avatar: string; text: string; date: string }
  ): Promise<Task | null> {
    const existing = await query(
      `SELECT id FROM tasks WHERE clinic_id = $1 AND id = $2 LIMIT 1`,
      [clinicId, taskId],
      clinicId
    );
    if (existing.rows.length === 0) return null;
    await query(
      `INSERT INTO task_comments (id, clinic_id, task_id, author, avatar, text, comment_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [generateId('tcomm'), clinicId, taskId, comment.author, comment.avatar, comment.text, comment.date],
      clinicId
    );
    const updated = await this.listTasks(clinicId);
    return updated.find((t) => t.id === taskId) || null;
  }

  async deleteTask(clinicId: string, id: string): Promise<boolean> {
    const res = await query(
      `DELETE FROM tasks WHERE clinic_id = $1 AND id = $2`,
      [clinicId, id],
      clinicId
    );
    return (res.rowCount || 0) > 0;
  }

  // =========================================================================
  // INVENTORY
  // =========================================================================
  async listStocks(clinicId: string): Promise<StockItem[]> {
    const res = await query(
      `SELECT * FROM inventory_items WHERE clinic_id = $1 ORDER BY name ASC`,
      [clinicId],
      clinicId
    );
    return res.rows.map((r) => ({
      id: r.id,
      clinicId: r.clinic_id,
      name: r.name,
      category: r.category,
      supplier: r.supplier || '',
      quantity: Number(r.quantity),
      minThreshold: Number(r.min_threshold),
      unit: r.unit,
      unitPriceDzd: centimesToDzd(Number(r.unit_price_centimes || 0)),
      status: r.status,
    }));
  }

  async listInventoryMovements(clinicId: string, itemId?: string): Promise<InventoryMovement[]> {
    const res = await query(
      `SELECT m.*, i.name AS item_name
       FROM inventory_movements m
       JOIN inventory_items i ON i.id = m.item_id AND i.clinic_id = m.clinic_id
       WHERE m.clinic_id = $1 AND ($2::text IS NULL OR m.item_id = $2)
       ORDER BY m.created_at DESC
       LIMIT 200`,
      [clinicId, itemId || null],
      clinicId
    );
    return res.rows.map((r) => ({
      id: r.id,
      itemId: r.item_id,
      itemName: r.item_name,
      delta: Number(r.delta),
      quantityBefore: Number(r.quantity_before),
      quantityAfter: Number(r.quantity_after),
      reason: r.reason,
      performedBy: r.performed_by,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async createStock(clinicId: string, input: any): Promise<StockItem> {
    const id = input.id || generateId('stk');
    const qty = Number(input.quantity || 0);
    const min = Number(input.minThreshold ?? 5);
    const status = qty <= min ? 'Critique' : 'Normal';
    const priceCentimes = dzdToCentimes(input.unitPriceDzd || 0);

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO inventory_items (id, clinic_id, name, category, supplier, quantity, min_threshold, unit, unit_price_centimes, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id, clinicId, input.name, input.category, input.supplier || '', qty, min, input.unit || 'unités', priceCentimes, status]
      );
      if (qty > 0) {
        await client.query(
          `INSERT INTO inventory_movements (id, clinic_id, item_id, delta, quantity_before, quantity_after, reason, performed_by)
           VALUES ($1,$2,$3,$4,0,$4,'Stock initial',$5)`,
          [generateId('mov'), clinicId, id, qty, input.performedBy || 'Dr. Vétérinaire']
        );
      }
    }, clinicId);

    const all = await this.listStocks(clinicId);
    return all.find((s) => s.id === id)!;
  }

  async adjustStock(clinicId: string, id: string, updates: any): Promise<StockItem | null> {
    return withTransaction(async (client) => {
      const res = await client.query(
        `SELECT * FROM inventory_items WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
        [clinicId, id]
      );
      const row = res.rows[0];
      if (!row) return null;

      const before = Number(row.quantity);
      let after = before;
      if (updates.delta !== undefined) {
        after = Math.max(0, before + Number(updates.delta));
      } else if (updates.quantity !== undefined) {
        after = Math.max(0, Number(updates.quantity));
      }
      const actualDelta = after - before;
      const nextMin = updates.minThreshold !== undefined ? Number(updates.minThreshold) : Number(row.min_threshold);
      const nextStatus =
        updates.status === 'Commande en cours'
          ? 'Commande en cours'
          : after <= nextMin
          ? 'Critique'
          : 'Normal';

      await client.query(
        `UPDATE inventory_items
         SET name = $3, category = $4, supplier = $5, quantity = $6, min_threshold = $7,
             unit = $8, unit_price_centimes = $9, status = $10, updated_at = NOW()
         WHERE clinic_id = $1 AND id = $2`,
        [
          clinicId,
          id,
          updates.name ?? row.name,
          updates.category ?? row.category,
          updates.supplier ?? row.supplier,
          after,
          nextMin,
          updates.unit ?? row.unit,
          updates.unitPriceDzd !== undefined ? dzdToCentimes(updates.unitPriceDzd) : Number(row.unit_price_centimes || 0),
          nextStatus,
        ]
      );

      if (actualDelta !== 0) {
        await client.query(
          `INSERT INTO inventory_movements (id, clinic_id, item_id, delta, quantity_before, quantity_after, reason, performed_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            generateId('mov'),
            clinicId,
            id,
            actualDelta,
            before,
            after,
            updates.reason || (actualDelta > 0 ? 'Réapprovisionnement' : 'Sortie de stock'),
            updates.performedBy || 'Dr. Vétérinaire',
          ]
        );
      }

      return {
        id,
        clinicId,
        name: updates.name ?? row.name,
        category: updates.category ?? row.category,
        supplier: updates.supplier ?? row.supplier,
        quantity: after,
        minThreshold: nextMin,
        unit: updates.unit ?? row.unit,
        unitPriceDzd: updates.unitPriceDzd !== undefined ? Number(updates.unitPriceDzd) : centimesToDzd(Number(row.unit_price_centimes || 0)),
        status: nextStatus as StockItem['status'],
      };
    }, clinicId);
  }

  // =========================================================================
  // FINANCE: INVOICES, PAYMENTS, CASH CLOSINGS (DZD)
  // =========================================================================
  async listInvoices(clinicId: string): Promise<Invoice[]> {
    const invRes = await query(
      `SELECT * FROM invoices WHERE clinic_id = $1 ORDER BY issue_date DESC, created_at DESC`,
      [clinicId],
      clinicId
    );
    const itemsRes = await query(
      `SELECT * FROM invoice_items WHERE clinic_id = $1`,
      [clinicId],
      clinicId
    );
    const itemsByInvoice = new Map<string, any[]>();
    for (const item of itemsRes.rows) {
      const list = itemsByInvoice.get(item.invoice_id) || [];
      list.push({
        id: item.id,
        description: item.description,
        quantity: Number(item.quantity),
        unitPriceDzd: centimesToDzd(Number(item.unit_price_centimes)),
        lineTotalDzd: centimesToDzd(Number(item.line_total_centimes)),
      });
      itemsByInvoice.set(item.invoice_id, list);
    }

    return invRes.rows.map((r) => ({
      id: r.id,
      clinicId: r.clinic_id,
      number: r.invoice_number,
      ownerId: r.owner_id,
      clientName: r.owner_name,
      animalId: r.animal_id,
      patientName: r.animal_name,
      issueDate: toIsoDateOnly(r.issue_date),
      dateFormatted: formatIsoToFr(toIsoDateOnly(r.issue_date)),
      currency: 'DZD',
      subtotalDzd: centimesToDzd(Number(r.subtotal_centimes)),
      taxDzd: centimesToDzd(Number(r.tax_centimes)),
      amountDzd: centimesToDzd(Number(r.total_centimes)),
      paidDzd: centimesToDzd(Number(r.paid_centimes)),
      status: r.status,
      notes: r.notes || '',
      items: itemsByInvoice.get(r.id) || [],
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
    }));
  }

  async createInvoice(clinicId: string, input: any, createdBy: string): Promise<Invoice> {
    const id = generateId('inv');
    const issueDate = input.issueDate || new Date().toISOString().slice(0, 10);
    const prefix = input.status === 'Devis' ? `DEV-${issueDate.slice(0, 4)}-` : `FAC-${issueDate.slice(0, 4)}-`;
    const invoiceNumber = input.number || `${prefix}${crypto.randomInt(1000, 9999)}-${crypto.randomUUID().slice(0, 3).toUpperCase()}`;

    const itemsInput: Array<{ description: string; quantity: number; unitPriceDzd: number }> =
      Array.isArray(input.items) && input.items.length > 0
        ? input.items
        : [
            {
              description: input.notes || 'Prestation vétérinaire',
              quantity: 1,
              unitPriceDzd: Number(input.amountDzd ?? 0),
            },
          ];

    const computedItems = itemsInput.map((it) => {
      const unitCentimes = dzdToCentimes(it.unitPriceDzd);
      const lineTotalCentimes = Math.round(unitCentimes * it.quantity);
      return {
        id: generateId('invi'),
        description: it.description,
        quantity: it.quantity,
        unitPriceCentimes: unitCentimes,
        lineTotalCentimes,
      };
    });

    const subtotalCentimes = sumCentimes(computedItems.map((i) => i.lineTotalCentimes));
    const taxRate = Number(input.taxRatePercent || 0);
    const taxCentimes = Math.round((subtotalCentimes * taxRate) / 100);
    const totalCentimes = subtotalCentimes + taxCentimes;
    const status = input.status || 'En attente';
    const paidCentimes = status === 'Payée' ? totalCentimes : 0;

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO invoices (
           id, clinic_id, invoice_number, owner_id, owner_name, animal_id, animal_name,
           issue_date, currency, subtotal_centimes, tax_centimes, total_centimes, paid_centimes,
           status, notes, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,'DZD',$9,$10,$11,$12,$13,$14,$15)`,
        [
          id,
          clinicId,
          invoiceNumber,
          input.ownerId || null,
          input.clientName,
          input.animalId || null,
          input.patientName,
          issueDate,
          subtotalCentimes,
          taxCentimes,
          totalCentimes,
          paidCentimes,
          status,
          input.notes || '',
          createdBy,
        ]
      );

      for (const item of computedItems) {
        await client.query(
          `INSERT INTO invoice_items (id, clinic_id, invoice_id, description, quantity, unit_price_centimes, line_total_centimes)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [item.id, clinicId, id, item.description, item.quantity, item.unitPriceCentimes, item.lineTotalCentimes]
        );
      }

      if (paidCentimes > 0) {
        await client.query(
          `INSERT INTO payments (id, clinic_id, invoice_id, owner_id, client_name, patient_name, amount_centimes, currency, payment_method, paid_at, description, recorded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'DZD',$8,$9::timestamptz,$10,$11)`,
          [
            generateId('pay'),
            clinicId,
            id,
            input.ownerId || null,
            input.clientName,
            input.patientName,
            paidCentimes,
            input.paymentMethod || 'Espèces',
            `${issueDate}T12:00:00+01:00`,
            input.notes || `Règlement ${invoiceNumber}`,
            createdBy,
          ]
        );
      }
    }, clinicId);

    const list = await this.listInvoices(clinicId);
    return list.find((inv) => inv.id === id)!;
  }

  async updateInvoice(
    clinicId: string,
    id: string,
    updates: any,
    recordedBy: string
  ): Promise<Invoice | null> {
    await withTransaction(async (client) => {
      const res = await client.query(
        `SELECT * FROM invoices WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
        [clinicId, id]
      );
      const row = res.rows[0];
      if (!row) return;

      const totalCentimes = Number(row.total_centimes);
      let paidCentimes = Number(row.paid_centimes);
      let nextStatus = updates.status ?? row.status;

      let paymentDeltaCentimes = 0;
      if (updates.paymentAmountDzd) {
        paymentDeltaCentimes = Math.min(totalCentimes - paidCentimes, dzdToCentimes(updates.paymentAmountDzd));
        paidCentimes += Math.max(0, paymentDeltaCentimes);
        nextStatus = paidCentimes >= totalCentimes ? 'Payée' : 'Partielle';
      } else if (nextStatus === 'Payée' && paidCentimes < totalCentimes) {
        paymentDeltaCentimes = totalCentimes - paidCentimes;
        paidCentimes = totalCentimes;
      }

      await client.query(
        `UPDATE invoices SET status = $3, paid_centimes = $4, notes = $5, updated_at = NOW()
         WHERE clinic_id = $1 AND id = $2`,
        [clinicId, id, nextStatus, paidCentimes, updates.notes ?? row.notes ?? '']
      );

      if (paymentDeltaCentimes > 0) {
        await client.query(
          `INSERT INTO payments (id, clinic_id, invoice_id, owner_id, client_name, patient_name, amount_centimes, currency, payment_method, paid_at, description, recorded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'DZD',$8,NOW(),$9,$10)`,
          [
            generateId('pay'),
            clinicId,
            id,
            row.owner_id,
            row.owner_name,
            row.animal_name,
            paymentDeltaCentimes,
            updates.paymentMethod || 'Espèces',
            `Encaissement ${row.invoice_number}`,
            recordedBy,
          ]
        );
      }
    }, clinicId);

    const list = await this.listInvoices(clinicId);
    return list.find((inv) => inv.id === id) || null;
  }

  async getCashClosingSummary(clinicId: string, date: string): Promise<CashClosingSummary> {
    const payRes = await query(
      `SELECT p.*, i.invoice_number
       FROM payments p
       LEFT JOIN invoices i ON i.id = p.invoice_id
       WHERE p.clinic_id = $1
         AND (p.paid_at AT TIME ZONE 'Africa/Algiers')::date = $2::date
       ORDER BY p.paid_at ASC`,
      [clinicId, date],
      clinicId
    );

    let cbCentimes = 0;
    let cashCentimes = 0;
    let checkCentimes = 0;

    const entries = payRes.rows.map((r) => {
      const amt = Number(r.amount_centimes);
      if (r.payment_method === 'Carte Bancaire') cbCentimes += amt;
      else if (r.payment_method === 'Espèces') cashCentimes += amt;
      else checkCentimes += amt;

      const paidDate = new Date(r.paid_at);
      const time = new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'Africa/Algiers',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(paidDate);

      return {
        id: r.id,
        invoiceId: r.invoice_id,
        invoiceNumber: r.invoice_number,
        time,
        paidAt: paidDate.toISOString(),
        clientName: r.client_name,
        patientName: r.patient_name || '—',
        description: r.description || 'Paiement',
        paymentMethod: r.payment_method,
        amountDzd: centimesToDzd(amt),
        currency: 'DZD' as const,
        recordedBy: r.recorded_by,
      };
    });

    const expectedCentimes = cbCentimes + cashCentimes + checkCentimes;

    const closingRes = await query(
      `SELECT * FROM cash_closings WHERE clinic_id = $1 AND closing_date = $2::date LIMIT 1`,
      [clinicId, date],
      clinicId
    );
    const closedRow = closingRes.rows[0];

    const historyRes = await query(
      `SELECT * FROM cash_closings WHERE clinic_id = $1 ORDER BY closing_date DESC LIMIT 30`,
      [clinicId],
      clinicId
    );

    return {
      date,
      currency: 'DZD',
      cbDzd: centimesToDzd(closedRow ? Number(closedRow.cb_centimes) : cbCentimes),
      cashDzd: centimesToDzd(closedRow ? Number(closedRow.cash_centimes) : cashCentimes),
      checkTransferDzd: centimesToDzd(closedRow ? Number(closedRow.check_transfer_centimes) : checkCentimes),
      totalDzd: centimesToDzd(closedRow ? Number(closedRow.total_centimes) : expectedCentimes),
      expectedDzd: centimesToDzd(expectedCentimes),
      varianceDzd: centimesToDzd(closedRow ? Number(closedRow.variance_centimes) : 0),
      isClosed: Boolean(closedRow),
      closedAt: closedRow ? new Date(closedRow.closed_at).toISOString() : null,
      operatorName: closedRow?.operator_name || null,
      notes: closedRow?.notes || null,
      entries,
      history: historyRes.rows.map((h) => ({
        id: h.id,
        closingDate: toIsoDateOnly(h.closing_date),
        totalDzd: centimesToDzd(Number(h.total_centimes)),
        varianceDzd: centimesToDzd(Number(h.variance_centimes)),
        operatorName: h.operator_name,
        closedAt: new Date(h.closed_at).toISOString(),
      })),
    };
  }

  async closeCashDay(
    clinicId: string,
    input: {
      closingDate: string;
      countedCashDzd?: number;
      countedCbDzd?: number;
      countedCheckTransferDzd?: number;
      notes?: string;
      operatorName: string;
    }
  ): Promise<CashClosingSummary> {
    return withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT id FROM cash_closings WHERE clinic_id = $1 AND closing_date = $2::date LIMIT 1`,
        [clinicId, input.closingDate]
      );
      if (existing.rows.length > 0) {
        throw new Error(`La caisse du ${formatIsoToFr(input.closingDate)} est déjà clôturée.`);
      }

      const summary = await this.getCashClosingSummary(clinicId, input.closingDate);
      const cbCentimes =
        input.countedCbDzd !== undefined ? dzdToCentimes(input.countedCbDzd) : dzdToCentimes(summary.cbDzd);
      const cashCentimes =
        input.countedCashDzd !== undefined ? dzdToCentimes(input.countedCashDzd) : dzdToCentimes(summary.cashDzd);
      const checkCentimes =
        input.countedCheckTransferDzd !== undefined
          ? dzdToCentimes(input.countedCheckTransferDzd)
          : dzdToCentimes(summary.checkTransferDzd);

      const totalCentimes = cbCentimes + cashCentimes + checkCentimes;
      const expectedCentimes = dzdToCentimes(summary.expectedDzd);
      const varianceCentimes = totalCentimes - expectedCentimes;

      await client.query(
        `INSERT INTO cash_closings (
           id, clinic_id, closing_date, currency, cb_centimes, cash_centimes,
           check_transfer_centimes, total_centimes, expected_centimes, variance_centimes,
           operator_name, notes
         ) VALUES ($1,$2,$3::date,'DZD',$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          generateId('close'),
          clinicId,
          input.closingDate,
          cbCentimes,
          cashCentimes,
          checkCentimes,
          totalCentimes,
          expectedCentimes,
          varianceCentimes,
          input.operatorName,
          input.notes || '',
        ]
      );

      return this.getCashClosingSummary(clinicId, input.closingDate);
    }, clinicId);
  }

  // =========================================================================
  // HOSPITALIZATIONS
  // =========================================================================
  async listHospitalizations(clinicId: string): Promise<HospitalizationBox[]> {
    const res = await query(
      `SELECT * FROM hospitalizations WHERE clinic_id = $1 ORDER BY box_code ASC`,
      [clinicId],
      clinicId
    );
    return res.rows.map((r) => ({
      id: r.id,
      boxCode: r.box_code,
      animalId: r.animal_id,
      patientName: r.animal_name,
      species: r.species || '—',
      breed: r.breed || '—',
      ownerId: r.owner_id,
      ownerName: r.owner_name || '—',
      admissionDate: r.admission_date || '—',
      reason: r.reason,
      veterinarian: r.veterinarian || '—',
      status: r.status,
      diet: r.diet || '—',
      lastCare: r.last_care || '—',
      careLogs: Array.isArray(r.care_logs) ? r.care_logs : [],
    }));
  }

  async createHospitalization(clinicId: string, input: any): Promise<HospitalizationBox> {
    const id = generateId('hosp');
    const admissionDate = input.admissionDate || new Date().toISOString().slice(0, 10);
    await query(
      `INSERT INTO hospitalizations (
         id, clinic_id, box_code, animal_id, animal_name, species, breed, owner_id,
         owner_name, admission_date, reason, veterinarian, status, diet, last_care, care_logs
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)`,
      [
        id,
        clinicId,
        input.boxCode,
        input.animalId || null,
        input.patientName,
        input.species || '—',
        input.breed || '—',
        input.ownerId || null,
        input.ownerName || '—',
        admissionDate,
        input.reason,
        input.veterinarian || 'Dr. Vétérinaire',
        input.status || 'Stable',
        input.diet || 'Standard',
        input.lastCare || 'Admission enregistrée',
        JSON.stringify([]),
      ],
      clinicId
    );
    const list = await this.listHospitalizations(clinicId);
    return list.find((h) => h.id === id)!;
  }

  async updateHospitalization(
    clinicId: string,
    id: string,
    updates: any,
    author: string
  ): Promise<HospitalizationBox | null> {
    const list = await this.listHospitalizations(clinicId);
    const current = list.find((b) => b.id === id);
    if (!current) return null;

    const careLogs = [...(current.careLogs || [])];
    let lastCare = updates.lastCare ?? current.lastCare;
    if (updates.careNote) {
      const nowStr = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      careLogs.unshift({
        id: generateId('care'),
        timestamp: new Date().toISOString(),
        note: updates.careNote,
        author,
      });
      lastCare = `Aujourd'hui à ${nowStr} (${updates.careNote})`;
    }

    if (updates.discharge) {
      await query(
        `UPDATE hospitalizations
         SET animal_id = NULL, animal_name = 'Libre', species = '—', breed = '—',
             owner_id = NULL, owner_name = '—', admission_date = '—',
             reason = 'Box désinfecté prêt pour admission', veterinarian = '—',
             status = 'Disponible', diet = '—', last_care = $3, care_logs = $4::jsonb, updated_at = NOW()
         WHERE clinic_id = $1 AND id = $2`,
        [clinicId, id, `Sortie enregistrée par ${author}`, JSON.stringify(careLogs)],
        clinicId
      );
    } else {
      await query(
        `UPDATE hospitalizations
         SET animal_id = $3, animal_name = $4, species = $5, breed = $6, owner_id = $7,
             owner_name = $8, admission_date = $9, reason = $10, veterinarian = $11,
             status = $12, diet = $13, last_care = $14, care_logs = $15::jsonb, updated_at = NOW()
         WHERE clinic_id = $1 AND id = $2`,
        [
          clinicId,
          id,
          updates.animalId !== undefined ? updates.animalId : current.animalId || null,
          updates.patientName ?? current.patientName,
          updates.species ?? current.species,
          updates.breed ?? current.breed,
          updates.ownerId !== undefined ? updates.ownerId : current.ownerId || null,
          updates.ownerName ?? current.ownerName,
          updates.admissionDate ?? current.admissionDate,
          updates.reason ?? current.reason,
          updates.veterinarian ?? current.veterinarian,
          updates.status ?? current.status,
          updates.diet ?? current.diet,
          lastCare,
          JSON.stringify(careLogs),
        ],
        clinicId
      );
    }

    const refreshed = await this.listHospitalizations(clinicId);
    return refreshed.find((b) => b.id === id) || null;
  }

  // =========================================================================
  // REPORTS
  // =========================================================================
  async getReportsOverview(clinicId: string): Promise<ReportsOverview> {
    const [animalsRes, aptsRes, vacRes, invRes, medRes] = await Promise.all([
      query(`SELECT species FROM animals WHERE clinic_id = $1 AND archived_at IS NULL`, [clinicId], clinicId),
      query(`SELECT type FROM appointments WHERE clinic_id = $1`, [clinicId], clinicId),
      query(`SELECT status FROM vaccinations WHERE clinic_id = $1`, [clinicId], clinicId),
      query(
        `SELECT COALESCE(SUM(total_centimes), 0)::bigint AS revenue_centimes
         FROM invoices WHERE clinic_id = $1 AND status IN ('Payée', 'Partielle')`,
        [clinicId],
        clinicId
      ),
      query(
        `SELECT COUNT(*)::int AS cnt FROM medical_records WHERE clinic_id = $1 AND record_type = 'consultation'`,
        [clinicId],
        clinicId
      ),
    ]);

    const totalAnimals = animalsRes.rows.length || 1;
    const speciesCounts: Record<string, number> = { Chat: 0, Chien: 0, Autre: 0 };
    for (const r of animalsRes.rows) {
      speciesCounts[r.species] = (speciesCounts[r.species] || 0) + 1;
    }

    const totalApts = aptsRes.rows.length || 1;
    const actCounts: Record<string, number> = { Vaccin: 0, Consultation: 0, Contrôle: 0, Urgence: 0 };
    for (const r of aptsRes.rows) {
      actCounts[r.type] = (actCounts[r.type] || 0) + 1;
    }

    const vacTotal = vacRes.rows.length;
    const vacDone = vacRes.rows.filter((r) => r.status === 'Effectué').length;
    const vacRate = vacTotal > 0 ? Math.round((vacDone / vacTotal) * 1000) / 10 : 100;

    return {
      consultationsCount: Number(medRes.rows[0]?.cnt || 0) + aptsRes.rows.length,
      newPatientsCount: animalsRes.rows.length,
      vaccinationCompletionRate: vacRate,
      monthlyRevenueDzd: centimesToDzd(Number(invRes.rows[0]?.revenue_centimes || 0)),
      speciesBreakdown: [
        { label: 'Félins (Chats)', count: speciesCounts.Chat, percentage: Math.round((speciesCounts.Chat / totalAnimals) * 100) },
        { label: 'Canins (Chiens)', count: speciesCounts.Chien, percentage: Math.round((speciesCounts.Chien / totalAnimals) * 100) },
        { label: 'NAC & Autres', count: speciesCounts.Autre, percentage: Math.round((speciesCounts.Autre / totalAnimals) * 100) },
      ],
      actTypeBreakdown: [
        { label: 'Vaccinations préventives', count: actCounts.Vaccin, percentage: Math.round((actCounts.Vaccin / totalApts) * 100) },
        { label: 'Consultations médecine générale', count: actCounts.Consultation, percentage: Math.round((actCounts.Consultation / totalApts) * 100) },
        { label: 'Contrôles & suivis', count: actCounts.Contrôle, percentage: Math.round((actCounts.Contrôle / totalApts) * 100) },
        { label: 'Urgences', count: actCounts.Urgence, percentage: Math.round((actCounts.Urgence / totalApts) * 100) },
      ],
    };
  }

  // =========================================================================
  // SMS CONFIG, TEMPLATES, REMINDERS & LOGS
  // =========================================================================
  private smsGatewayColsEnsured = false;

  private async ensureSmsGatewayColumns(): Promise<void> {
    if (this.smsGatewayColsEnsured) return;
    try {
      await query(`
        ALTER TABLE sms_config
          ADD COLUMN IF NOT EXISTS sms_api_url TEXT NOT NULL DEFAULT '',
          ADD COLUMN IF NOT EXISTS sms_api_key TEXT NOT NULL DEFAULT '',
          ADD COLUMN IF NOT EXISTS sms_sender_id VARCHAR(64) NOT NULL DEFAULT 'MyVet',
          ADD COLUMN IF NOT EXISTS sim_plan_label VARCHAR(255) NOT NULL DEFAULT 'Ooredoo 2500 (SMS Illimité Tous Réseaux)'
      `);
      this.smsGatewayColsEnsured = true;
    } catch {
      // Migration 003 provides these columns in managed environments
      this.smsGatewayColsEnsured = true;
    }
  }

  async getSmsConfig(clinicId: string): Promise<SmsConfig> {
    await this.ensureSmsGatewayColumns();
    const res = await query(`SELECT * FROM sms_config WHERE clinic_id = $1 LIMIT 1`, [clinicId], clinicId);
    const r = res.rows[0];
    if (!r) {
      await query(`INSERT INTO sms_config (clinic_id) VALUES ($1) ON CONFLICT DO NOTHING`, [clinicId], clinicId);
      return this.getSmsConfig(clinicId);
    }
    const mode = r.provider_mode === 'PRODUCTION' ? 'PRODUCTION' : 'TEST';
    const storedApiKey = typeof r.sms_api_key === 'string' ? r.sms_api_key : '';
    return {
      id: r.clinic_id,
      clinic_id: r.clinic_id,
      provider_mode: mode,
      smsProviderMode: mode === 'PRODUCTION' ? 'live' : 'test',
      active_provider: r.active_provider,
      api_key_configured: Boolean(storedApiKey.trim() || r.api_key_configured || process.env.SMS_API_KEY),
      smsApiUrl: typeof r.sms_api_url === 'string' ? r.sms_api_url : '',
      smsApiKey: storedApiKey,
      smsSenderId: typeof r.sms_sender_id === 'string' && r.sms_sender_id ? r.sms_sender_id : 'MyVet',
      simPlanLabel:
        typeof r.sim_plan_label === 'string' && r.sim_plan_label
          ? r.sim_plan_label
          : 'Ooredoo 2500 (SMS Illimité Tous Réseaux)',
      enable_vaccination_reminders: Boolean(r.enable_vaccination_reminders),
      vaccination_intervals: r.vaccination_intervals,
      enable_appointment_reminders: Boolean(r.enable_appointment_reminders),
      appointment_interval_hours: Number(r.appointment_interval_hours),
      sending_start_hour: Number(r.sending_start_hour),
      sending_end_hour: Number(r.sending_end_hour),
      timezone: r.timezone,
    };
  }

  async updateSmsConfig(clinicId: string, updates: Partial<SmsConfig>): Promise<SmsConfig> {
    const current = await this.getSmsConfig(clinicId);
    const nextProviderMode =
      updates.smsProviderMode !== undefined
        ? updates.smsProviderMode === 'live'
          ? 'PRODUCTION'
          : 'TEST'
        : updates.provider_mode !== undefined
        ? updates.provider_mode
        : current.provider_mode;
    const nextApiUrl = updates.smsApiUrl !== undefined ? updates.smsApiUrl.trim() : current.smsApiUrl || '';
    const nextApiKey =
      updates.smsApiKey !== undefined && updates.smsApiKey.trim() !== ''
        ? updates.smsApiKey.trim()
        : current.smsApiKey || '';
    const nextSenderId =
      updates.smsSenderId !== undefined ? updates.smsSenderId.trim() || 'MyVet' : current.smsSenderId || 'MyVet';
    const nextSimPlan =
      updates.simPlanLabel !== undefined
        ? updates.simPlanLabel.trim() || 'Ooredoo 2500 (SMS Illimité Tous Réseaux)'
        : current.simPlanLabel || 'Ooredoo 2500 (SMS Illimité Tous Réseaux)';
    const nextKeyConfigured = Boolean(nextApiKey || process.env.SMS_API_KEY);

    await query(
      `UPDATE sms_config
       SET provider_mode = $2, active_provider = $3, api_key_configured = $4,
           sms_api_url = $5, sms_api_key = $6, sms_sender_id = $7, sim_plan_label = $8,
           enable_vaccination_reminders = $9, vaccination_intervals = $10,
           enable_appointment_reminders = $11, appointment_interval_hours = $12,
           sending_start_hour = $13, sending_end_hour = $14,
           timezone = $15, updated_at = NOW()
       WHERE clinic_id = $1`,
      [
        clinicId,
        nextProviderMode,
        updates.active_provider ?? current.active_provider,
        nextKeyConfigured,
        nextApiUrl,
        nextApiKey,
        nextSenderId,
        nextSimPlan,
        updates.enable_vaccination_reminders ?? current.enable_vaccination_reminders,
        updates.vaccination_intervals ?? current.vaccination_intervals,
        updates.enable_appointment_reminders ?? current.enable_appointment_reminders,
        updates.appointment_interval_hours ?? current.appointment_interval_hours,
        updates.sending_start_hour ?? current.sending_start_hour,
        updates.sending_end_hour ?? current.sending_end_hour,
        updates.timezone ?? current.timezone,
      ],
      clinicId
    );
    return this.getSmsConfig(clinicId);
  }

  async listSmsTemplates(clinicId: string): Promise<SmsTemplate[]> {
    const res = await query(
      `SELECT * FROM sms_templates WHERE clinic_id = $1 ORDER BY is_default DESC, title ASC`,
      [clinicId],
      clinicId
    );
    return res.rows.map((r) => ({
      id: r.id,
      category: r.category,
      title: r.title,
      content: r.content,
      language: r.language,
      is_default: Boolean(r.is_default),
    }));
  }

  async upsertSmsTemplate(clinicId: string, input: any): Promise<SmsTemplate> {
    const id = input.id || generateId('tpl');
    await query(
      `INSERT INTO sms_templates (id, clinic_id, category, title, content, language, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE
       SET category = EXCLUDED.category,
           title = EXCLUDED.title,
           content = EXCLUDED.content,
           language = EXCLUDED.language,
           updated_at = NOW()
       WHERE sms_templates.clinic_id = $2`,
      [id, clinicId, input.category, input.title, input.content, input.language || 'fr', Boolean(input.is_default)],
      clinicId
    );
    const list = await this.listSmsTemplates(clinicId);
    return list.find((t) => t.id === id)!;
  }

  async listSmsReminders(clinicId: string): Promise<SmsReminder[]> {
    const res = await query(
      `SELECT r.*, o.name AS owner_name, o.phone AS owner_phone, o.phone_normalized, a.name AS animal_name, a.species
       FROM sms_reminders r
       LEFT JOIN owners o ON o.id = r.owner_id
       LEFT JOIN animals a ON a.id = r.animal_id
       WHERE r.clinic_id = $1
       ORDER BY r.scheduled_at ASC`,
      [clinicId],
      clinicId
    );
    return res.rows.map((r) => ({
      id: r.id,
      owner_id: r.owner_id,
      owner_name: r.owner_name,
      owner_phone: r.owner_phone,
      phone_normalized: r.phone_normalized,
      animal_id: r.animal_id,
      animal_name: r.animal_name,
      species: r.species,
      reminder_type: r.reminder_type,
      scheduled_at: new Date(r.scheduled_at).toISOString(),
      status: r.status,
      idempotency_key: r.idempotency_key,
      attempts: Number(r.attempts || 0),
      last_error: r.last_error,
      sent_at: r.sent_at ? new Date(r.sent_at).toISOString() : null,
      is_simulated: Boolean(r.is_simulated),
    }));
  }

  async getSmsReminderById(clinicId: string, id: string): Promise<ClaimedReminder | null> {
    const res = await query(
      `SELECT r.*, o.name AS owner_name, o.phone AS owner_phone, o.phone_normalized, o.preferred_language,
              o.sms_consent, o.email AS owner_email, a.name AS animal_name, a.species,
              v.vaccine_name, v.next_due_date, apt.date AS appointment_date, apt.start_time AS appointment_time
       FROM sms_reminders r
       LEFT JOIN owners o ON o.id = r.owner_id
       LEFT JOIN animals a ON a.id = r.animal_id
       LEFT JOIN vaccinations v ON v.id = r.vaccination_id
       LEFT JOIN appointments apt ON apt.id = r.appointment_id
       WHERE r.clinic_id = $1 AND r.id = $2 LIMIT 1`,
      [clinicId, id],
      clinicId
    );
    return res.rows[0] ? this.mapClaimedReminder(res.rows[0]) : null;
  }

  private mapClaimedReminder(r: any): ClaimedReminder {
    return {
      id: r.id,
      clinic_id: r.clinic_id,
      owner_id: r.owner_id,
      owner_name: r.owner_name,
      owner_phone: r.owner_phone,
      phone_normalized: r.phone_normalized,
      preferred_language: r.preferred_language || 'fr',
      sms_consent: r.sms_consent !== false,
      owner_email: r.owner_email || null,
      animal_id: r.animal_id,
      animal_name: r.animal_name,
      species: r.species,
      vaccination_id: r.vaccination_id,
      appointment_id: r.appointment_id,
      vaccine_name: r.vaccine_name,
      due_date: r.next_due_date ? toIsoDateOnly(r.next_due_date) : null,
      appointment_date: r.appointment_date ? toIsoDateOnly(r.appointment_date) : null,
      appointment_time: r.appointment_time || null,
      reminder_type: r.reminder_type,
      scheduled_at: new Date(r.scheduled_at).toISOString(),
      status: r.status,
      idempotency_key: r.idempotency_key,
      attempts: Number(r.attempts || 0),
      last_error: r.last_error,
      sent_at: r.sent_at ? new Date(r.sent_at).toISOString() : null,
      is_simulated: Boolean(r.is_simulated),
    };
  }

  async scheduleReminders(
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
  ): Promise<number> {
    let inserted = 0;
    for (const r of reminders) {
      const res = await query(
        `INSERT INTO sms_reminders (
           id, clinic_id, owner_id, animal_id, vaccination_id, appointment_id,
           reminder_type, scheduled_at, status, idempotency_key
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,'Scheduled',$9)
         ON CONFLICT (clinic_id, idempotency_key) DO NOTHING`,
        [
          r.id || generateId('rem'),
          clinicId,
          r.ownerId,
          r.animalId,
          r.vaccinationId || null,
          r.appointmentId || null,
          r.reminderType,
          r.scheduledAt,
          r.idempotencyKey,
        ],
        clinicId
      );
      inserted += res.rowCount || 0;
    }
    return inserted;
  }

  async cancelPendingRemindersForTarget(
    clinicId: string,
    target: { vaccinationId?: string; appointmentId?: string }
  ): Promise<number> {
    if (target.vaccinationId) {
      const res = await query(
        `UPDATE sms_reminders SET status = 'Cancelled', updated_at = NOW()
         WHERE clinic_id = $1 AND vaccination_id = $2 AND status IN ('Scheduled', 'Processing')`,
        [clinicId, target.vaccinationId],
        clinicId
      );
      return res.rowCount || 0;
    }
    if (target.appointmentId) {
      const res = await query(
        `UPDATE sms_reminders SET status = 'Cancelled', updated_at = NOW()
         WHERE clinic_id = $1 AND appointment_id = $2 AND status IN ('Scheduled', 'Processing')`,
        [clinicId, target.appointmentId],
        clinicId
      );
      return res.rowCount || 0;
    }
    return 0;
  }

  async claimDueReminders(
    workerId: string,
    limit: number,
    now: Date,
    clinicId?: string
  ): Promise<ClaimedReminder[]> {
    const leaseExpires = new Date(now.getTime() + 5 * 60_000).toISOString();
    const nowIso = now.toISOString();

    return withTransaction(async (client) => {
      const claimRes = await client.query(
        `WITH candidate AS (
           SELECT id
           FROM sms_reminders
           WHERE ($1::text IS NULL OR clinic_id = $1)
             AND (
               (status = 'Scheduled' AND scheduled_at <= $2::timestamptz)
               OR (status = 'Processing' AND lease_expires_at IS NOT NULL AND lease_expires_at < $2::timestamptz)
             )
           ORDER BY scheduled_at ASC
           LIMIT $3
           FOR UPDATE SKIP LOCKED
         )
         UPDATE sms_reminders r
         SET status = 'Processing',
             locked_at = $2::timestamptz,
             lease_expires_at = $4::timestamptz,
             worker_id = $5,
             updated_at = NOW()
         FROM candidate
         WHERE r.id = candidate.id
         RETURNING r.id`,
        [clinicId || null, nowIso, limit, leaseExpires, workerId]
      );

      if (claimRes.rows.length === 0) return [];
      const ids = claimRes.rows.map((r) => r.id);

      const fullRes = await client.query(
        `SELECT r.*, o.name AS owner_name, o.phone AS owner_phone, o.phone_normalized, o.preferred_language,
                o.sms_consent, o.email AS owner_email, a.name AS animal_name, a.species,
                v.vaccine_name, v.next_due_date, apt.date AS appointment_date, apt.start_time AS appointment_time
         FROM sms_reminders r
         LEFT JOIN owners o ON o.id = r.owner_id
         LEFT JOIN animals a ON a.id = r.animal_id
         LEFT JOIN vaccinations v ON v.id = r.vaccination_id
         LEFT JOIN appointments apt ON apt.id = r.appointment_id
         WHERE r.id = ANY($1::text[])`,
        [ids]
      );
      return fullRes.rows.map((r) => this.mapClaimedReminder(r));
    }, clinicId);
  }

  async updateReminderDispatchState(id: string, patch: any): Promise<void> {
    await query(
      `UPDATE sms_reminders
       SET status = $2,
           attempts = COALESCE($3, attempts),
           scheduled_at = COALESCE($4::timestamptz, scheduled_at),
           locked_at = $5::timestamptz,
           lease_expires_at = $6::timestamptz,
           worker_id = $7,
           provider_id = COALESCE($8, provider_id),
           provider_message_id = COALESCE($9, provider_message_id),
           failure_type = $10,
           is_ambiguous = COALESCE($11, is_ambiguous),
           is_simulated = COALESCE($12, is_simulated),
           last_error = $13,
           sent_at = COALESCE($14::timestamptz, sent_at),
           delivered_at = COALESCE($15::timestamptz, delivered_at),
           updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        patch.status,
        patch.attempts ?? null,
        patch.scheduledAt ?? null,
        patch.lockedAt ?? null,
        patch.leaseExpiresAt ?? null,
        patch.workerId ?? null,
        patch.providerId ?? null,
        patch.providerMessageId ?? null,
        patch.failureType ?? null,
        patch.isAmbiguous ?? null,
        patch.isSimulated ?? null,
        patch.lastError ?? null,
        patch.sentAt ?? null,
        patch.deliveredAt ?? null,
      ]
    );
  }

  async listSmsLogs(clinicId: string): Promise<SmsLog[]> {
    const res = await query(
      `SELECT * FROM sms_logs WHERE clinic_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [clinicId],
      clinicId
    );
    return res.rows.map((r) => ({
      id: r.id,
      reminder_id: r.reminder_id,
      recipient_name: r.recipient_name,
      recipient_phone: r.recipient_phone,
      animal_name: r.animal_name,
      category: r.category,
      message_content: r.message_content,
      encoding: r.encoding,
      segment_count: Number(r.segment_count),
      status: r.status,
      is_simulated: Boolean(r.is_simulated),
      provider_name: r.provider_name,
      provider_message_id: r.provider_message_id,
      provider_response: r.provider_response,
      created_at: new Date(r.created_at).toISOString(),
    }));
  }

  async createSmsLog(clinicId: string, log: Omit<SmsLog, 'id' | 'created_at'>): Promise<SmsLog> {
    const id = generateId('smslog');
    const res = await query(
      `INSERT INTO sms_logs (
         id, clinic_id, reminder_id, recipient_name, recipient_phone, animal_name,
         category, message_content, encoding, segment_count, status, is_simulated,
         provider_name, provider_message_id, provider_response
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING created_at`,
      [
        id,
        clinicId,
        log.reminder_id || null,
        log.recipient_name,
        log.recipient_phone,
        log.animal_name || null,
        log.category,
        log.message_content,
        log.encoding,
        log.segment_count,
        log.status,
        Boolean(log.is_simulated),
        log.provider_name || 'TestSMSProvider',
        log.provider_message_id || null,
        log.provider_response || null,
      ],
      clinicId
    );
    return {
      ...log,
      id,
      created_at: new Date(res.rows[0].created_at).toISOString(),
    };
  }

  async updateSmsStatusByProviderMessageId(
    providerMessageId: string,
    status: SmsDeliveryStatus,
    errorDetail?: string,
    rawPayload?: Record<string, unknown>
  ): Promise<boolean> {
    const logRes = await query(
      `UPDATE sms_logs
       SET status = $2,
           provider_response = COALESCE($3, provider_response)
       WHERE provider_message_id = $1`,
      [providerMessageId, status, rawPayload ? JSON.stringify(rawPayload) : null]
    );
    const remRes = await query(
      `UPDATE sms_reminders
       SET status = $2,
           last_error = COALESCE($3, last_error),
           delivered_at = CASE WHEN $2 = 'Delivered' THEN NOW() ELSE delivered_at END,
           updated_at = NOW()
       WHERE provider_message_id = $1`,
      [providerMessageId, status, errorDetail || null]
    );
    return (logRes.rowCount || 0) + (remRes.rowCount || 0) > 0;
  }

  // =========================================================================
  // AUDIT & MIGRATION
  // =========================================================================
  async writeAuditLog(
    clinicId: string,
    entry: {
      userId?: string;
      userName: string;
      action: string;
      entityType: string;
      entityId?: string;
      details?: Record<string, unknown>;
    }
  ): Promise<void> {
    await query(
      `INSERT INTO audit_logs (id, clinic_id, user_id, user_name, action, entity_type, entity_id, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        generateId('aud'),
        clinicId,
        entry.userId || null,
        entry.userName,
        entry.action,
        entry.entityType,
        entry.entityId || null,
        JSON.stringify(entry.details || {}),
      ],
      clinicId
    );
  }

  async getTableCounts(clinicId: string): Promise<Record<string, number>> {
    const res = await query(
      `SELECT
        (SELECT COUNT(*)::int FROM owners WHERE clinic_id = $1) AS owners,
        (SELECT COUNT(*)::int FROM animals WHERE clinic_id = $1) AS animals,
        (SELECT COUNT(*)::int FROM vaccinations WHERE clinic_id = $1) AS vaccinations,
        (SELECT COUNT(*)::int FROM appointments WHERE clinic_id = $1) AS appointments,
        (SELECT COUNT(*)::int FROM tasks WHERE clinic_id = $1) AS tasks,
        (SELECT COUNT(*)::int FROM inventory_items WHERE clinic_id = $1) AS stocks,
        (SELECT COUNT(*)::int FROM invoices WHERE clinic_id = $1) AS invoices,
        (SELECT COUNT(*)::int FROM hospitalizations WHERE clinic_id = $1) AS hospitalizations,
        (SELECT COUNT(*)::int FROM sms_reminders WHERE clinic_id = $1) AS smsReminders,
        (SELECT COUNT(*)::int FROM sms_logs WHERE clinic_id = $1) AS smsLogs`,
      [clinicId],
      clinicId
    );
    const r = res.rows[0] || {};
    return {
      owners: Number(r.owners || 0),
      animals: Number(r.animals || 0),
      vaccinations: Number(r.vaccinations || 0),
      appointments: Number(r.appointments || 0),
      tasks: Number(r.tasks || 0),
      stocks: Number(r.stocks || 0),
      invoices: Number(r.invoices || 0),
      hospitalizations: Number(r.hospitalizations || 0),
      smsReminders: Number(r.smsreminders || 0),
      smsLogs: Number(r.smslogs || 0),
    };
  }

  async runMigration(clinicId: string, payload: any, importedBy: string): Promise<MigrationReport> {
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
    const warnings: string[] = [];

    const existingBatch = await query(
      `SELECT summary FROM migration_imports WHERE clinic_id = $1 AND batch_hash = $2 AND dry_run = FALSE LIMIT 1`,
      [clinicId, batchHash],
      clinicId
    );

    if (!dryRun && existingBatch.rows.length > 0) {
      return {
        batchHash,
        dryRun: false,
        alreadyImported: true,
        summary: existingBatch.rows[0].summary,
        warnings: ['Ce lot exact a déjà été importé précédemment (idempotence garantie).'],
        databaseCounts: await this.getTableCounts(clinicId),
      };
    }

    const summary = {
      importedOwners: 0,
      skippedOwners: 0,
      importedAnimals: 0,
      skippedAnimals: 0,
      importedAppointments: 0,
      skippedAppointments: 0,
      importedTasks: 0,
      skippedTasks: 0,
      importedStocks: 0,
      skippedStocks: 0,
      importedVaccinations: 0,
      skippedVaccinations: 0,
      importedMedicalRecords: 0,
      skippedMedicalRecords: 0,
      importedInvoices: 0,
      skippedInvoices: 0,
    };

    const clients: any[] = payload.clients || [];
    const patients: any[] = payload.patients || [];
    const appointments: any[] = payload.appointments || [];
    const tasks: any[] = payload.tasks || [];
    const stocks: any[] = payload.stocks || [];
    const vaccinations: any[] = payload.vaccinations || [];

    if (dryRun) {
      summary.importedOwners = clients.length;
      summary.importedAnimals = patients.length;
      summary.importedAppointments = appointments.length;
      summary.importedTasks = tasks.length;
      summary.importedStocks = stocks.length;
      summary.importedVaccinations = vaccinations.length;
      return {
        batchHash,
        dryRun: true,
        alreadyImported: existingBatch.rows.length > 0,
        summary,
        warnings,
        databaseCounts: await this.getTableCounts(clinicId),
      };
    }

    await withTransaction(async (client) => {
      for (const c of clients) {
        if (!c.id || !c.name) {
          summary.skippedOwners++;
          continue;
        }
        const phoneInfo = normalizeAlgerianPhone(String(c.phone || ''));
        if (!phoneInfo.isValid) {
          warnings.push(`Client "${c.name}" (${c.id}) importé avec numéro non standard : ${c.phone || 'vide'}`);
        }
        const res = await client.query(
          `INSERT INTO owners (id, clinic_id, name, phone, phone_normalized, email, address)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (id) DO NOTHING`,
          [
            String(c.id),
            clinicId,
            String(c.name),
            String(c.phone || ''),
            phoneInfo.isValid ? phoneInfo.e164 : String(c.phone || ''),
            String(c.email || ''),
            String(c.address || ''),
          ]
        );
        if ((res.rowCount || 0) > 0) summary.importedOwners++;
        else summary.skippedOwners++;
      }

      for (const p of patients) {
        if (!p.id || !p.name || !p.ownerId) {
          summary.skippedAnimals++;
          continue;
        }
        const ownerCheck = await client.query(
          `SELECT id FROM owners WHERE clinic_id = $1 AND id = $2 LIMIT 1`,
          [clinicId, String(p.ownerId)]
        );
        if (ownerCheck.rows.length === 0) {
          warnings.push(`Patient "${p.name}" ignoré : propriétaire "${p.ownerId}" absent.`);
          summary.skippedAnimals++;
          continue;
        }
        const res = await client.query(
          `INSERT INTO animals (id, clinic_id, owner_id, name, species, breed, color, gender, birth_date, age, weight, microchip, veterinarian, status, avatar_emoji, medical_alerts)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)
           ON CONFLICT (id) DO NOTHING`,
          [
            String(p.id),
            clinicId,
            String(p.ownerId),
            String(p.name),
            ['Chat', 'Chien', 'Autre'].includes(p.species) ? p.species : 'Autre',
            String(p.breed || 'Croisé'),
            String(p.color || '—'),
            p.gender === 'Mâle' ? 'Mâle' : 'Femelle',
            String(p.birthDate || '—'),
            String(p.age || '—'),
            String(p.weight || '—'),
            String(p.microchip || '—'),
            String(p.veterinarian || 'Dr. Vétérinaire'),
            p.status === 'Inactif' ? 'Inactif' : 'Actif',
            String(p.avatarEmoji || '🐾'),
            JSON.stringify(Array.isArray(p.medicalAlerts) ? p.medicalAlerts : []),
          ]
        );
        if ((res.rowCount || 0) > 0) summary.importedAnimals++;
        else summary.skippedAnimals++;
      }

      for (const a of appointments) {
        if (!a.id || !a.patientId || !a.clientId) {
          summary.skippedAppointments++;
          continue;
        }
        const res = await client.query(
          `INSERT INTO appointments (id, clinic_id, animal_id, animal_name, owner_id, owner_name, date, start_time, end_time, type, reason, veterinarian, status, notes)
           SELECT $1,$2,$3,$4,$5,$6,$7::date,$8,$9,$10,$11,$12,$13,$14
           WHERE EXISTS (SELECT 1 FROM animals WHERE clinic_id = $2 AND id = $3)
             AND EXISTS (SELECT 1 FROM owners WHERE clinic_id = $2 AND id = $5)
           ON CONFLICT (id) DO NOTHING`,
          [
            String(a.id),
            clinicId,
            String(a.patientId),
            String(a.patientName || 'Patient'),
            String(a.clientId),
            String(a.clientName || 'Client'),
            String(a.date || '2026-08-14').slice(0, 10),
            String(a.startTime || '09:00'),
            String(a.endTime || '09:30'),
            ['Urgence', 'Consultation', 'Vaccin', 'Contrôle'].includes(a.type) ? a.type : 'Consultation',
            String(a.reason || 'Consultation'),
            String(a.veterinarian || 'Dr. Vétérinaire'),
            ['Confirmé', 'En attente', 'Terminé', 'Annulé', 'Manqué'].includes(a.status) ? a.status : 'Confirmé',
            String(a.notes || ''),
          ]
        );
        if ((res.rowCount || 0) > 0) summary.importedAppointments++;
        else summary.skippedAppointments++;
      }

      for (const t of tasks) {
        if (!t.id || !t.title) {
          summary.skippedTasks++;
          continue;
        }
        const res = await client.query(
          `INSERT INTO tasks (id, clinic_id, title, description, priority, category, assigned_to, created_by, due_date, due_date_formatted, completed)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10,$11)
           ON CONFLICT (id) DO NOTHING`,
          [
            String(t.id),
            clinicId,
            String(t.title),
            String(t.description || ''),
            ['Normale', 'Haute', 'Urgente'].includes(t.priority) ? t.priority : 'Normale',
            ['Médicale', 'Administrative'].includes(t.category) ? t.category : 'Médicale',
            String(t.assignedTo || 'Dr. Vétérinaire'),
            String(t.createdBy || importedBy),
            String(t.dueDate || '2026-08-14').slice(0, 10),
            String(t.dueDateFormatted || 'Aug 14, 2026'),
            Boolean(t.completed),
          ]
        );
        if ((res.rowCount || 0) > 0) summary.importedTasks++;
        else summary.skippedTasks++;
      }

      for (const s of stocks) {
        if (!s.id || !s.name) {
          summary.skippedStocks++;
          continue;
        }
        const res = await client.query(
          `INSERT INTO inventory_items (id, clinic_id, name, category, supplier, quantity, min_threshold, unit, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (id) DO NOTHING`,
          [
            String(s.id),
            clinicId,
            String(s.name),
            ['Vaccin', 'Antibiotique', 'Anti-inflammatoire', 'Matériel', 'Alimentation'].includes(s.category)
              ? s.category
              : 'Matériel',
            String(s.supplier || ''),
            Math.max(0, Number(s.quantity || 0)),
            Math.max(0, Number(s.minThreshold ?? 5)),
            String(s.unit || 'unités'),
            ['Normal', 'Critique', 'Commande en cours'].includes(s.status) ? s.status : 'Normal',
          ]
        );
        if ((res.rowCount || 0) > 0) summary.importedStocks++;
        else summary.skippedStocks++;
      }

      await client.query(
        `INSERT INTO migration_imports (id, clinic_id, batch_hash, source_format, dry_run, status, summary, imported_by)
         VALUES ($1,$2,$3,$4,FALSE,'completed',$5::jsonb,$6)`,
        [generateId('mig'), clinicId, batchHash, String(payload.sourceFormat || 'vetosuite-localstorage'), JSON.stringify(summary), importedBy]
      );
    }, clinicId);

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
