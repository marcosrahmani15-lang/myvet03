import {
  animalCreateSchema,
  animalUpdateSchema,
  appointmentCreateSchema,
  appointmentUpdateSchema,
  medicalRecordCreateSchema,
  ownerCreateSchema,
  ownerUpdateSchema,
  vaccinationCreateSchema,
  vaccinationUpdateSchema,
} from '../../shared/schemas/index.ts';
import {
  scheduleVaccinationReminders,
  syncAppointmentReminders,
} from '../jobs/reminderEngine.ts';
import { requireAuth } from '../middleware/auth.ts';
import type { ClinicStore } from '../store/index.ts';
import {
  type ApiJsonResponse,
  type HttpRequest,
  getQueryParam,
  jsonError,
  jsonOk,
  parseBody,
} from '../core/http.ts';

export async function handleClinicalRoute(
  req: HttpRequest,
  subPath: string,
  store: ClinicStore
): Promise<ApiJsonResponse | null> {
  const cookieHeader = req.headers.cookie as string | undefined;

  // =========================================================================
  // OWNERS / CLIENTS
  // =========================================================================
  if (subPath === '/owners' && req.method === 'GET') {
    const auth = await requireAuth(cookieHeader, store);
    const includeArchived = getQueryParam(req, 'includeArchived') === 'true';
    const list = await store.listOwners(auth.clinicId, includeArchived);
    return jsonOk(list);
  }

  if (subPath === '/owners' && req.method === 'POST') {
    const auth = await requireAuth(cookieHeader, store, [
      'super_admin',
      'clinic_admin',
      'veterinarian',
      'receptionist',
    ]);
    const input = parseBody(ownerCreateSchema, req.body);
    const created = await store.createOwner(auth.clinicId, input);
    await store.writeAuditLog(auth.clinicId, {
      userId: auth.userId,
      userName: auth.userName,
      action: 'CREATE_OWNER',
      entityType: 'owner',
      entityId: created.id,
    });
    return jsonOk(created, 201);
  }

  const ownerIdMatch = /^\/owners\/([^/]+)$/.exec(subPath);
  if (ownerIdMatch) {
    const id = decodeURIComponent(ownerIdMatch[1]);
    if (req.method === 'GET') {
      const auth = await requireAuth(cookieHeader, store);
      const owner = await store.getOwnerById(auth.clinicId, id);
      if (!owner) return jsonError(404, 'Propriétaire introuvable');
      return jsonOk(owner);
    }
    if (req.method === 'PATCH' || req.method === 'PUT') {
      const auth = await requireAuth(cookieHeader, store, [
        'super_admin',
        'clinic_admin',
        'veterinarian',
        'receptionist',
      ]);
      const updates = parseBody(ownerUpdateSchema, req.body);
      const updated = await store.updateOwner(auth.clinicId, id, updates);
      if (!updated) return jsonError(404, 'Propriétaire introuvable');
      return jsonOk(updated);
    }
    if (req.method === 'DELETE') {
      const auth = await requireAuth(cookieHeader, store, ['super_admin', 'clinic_admin', 'veterinarian']);
      const result = await store.archiveOrDeleteOwner(auth.clinicId, id);
      if (!result) return jsonError(404, 'Propriétaire introuvable');
      await store.writeAuditLog(auth.clinicId, {
        userId: auth.userId,
        userName: auth.userName,
        action: result.action === 'archived' ? 'ARCHIVE_OWNER' : 'DELETE_OWNER',
        entityType: 'owner',
        entityId: id,
      });
      return jsonOk(result);
    }
  }

  // =========================================================================
  // ANIMALS / PATIENTS
  // =========================================================================
  if (subPath === '/animals' && req.method === 'GET') {
    const auth = await requireAuth(cookieHeader, store);
    const includeArchived = getQueryParam(req, 'includeArchived') === 'true';
    const list = await store.listAnimals(auth.clinicId, includeArchived);
    return jsonOk(list);
  }

  if (subPath === '/animals' && req.method === 'POST') {
    const auth = await requireAuth(cookieHeader, store, [
      'super_admin',
      'clinic_admin',
      'veterinarian',
      'receptionist',
      'assistant',
    ]);
    const input = parseBody(animalCreateSchema, req.body);
    const created = await store.createAnimal(auth.clinicId, input);
    await store.writeAuditLog(auth.clinicId, {
      userId: auth.userId,
      userName: auth.userName,
      action: 'CREATE_ANIMAL',
      entityType: 'animal',
      entityId: created.id,
    });
    return jsonOk(created, 201);
  }

  const animalIdMatch = /^\/animals\/([^/]+)$/.exec(subPath);
  if (animalIdMatch) {
    const id = decodeURIComponent(animalIdMatch[1]);
    if (req.method === 'GET') {
      const auth = await requireAuth(cookieHeader, store);
      const animal = await store.getAnimalById(auth.clinicId, id);
      if (!animal) return jsonError(404, 'Patient introuvable');
      return jsonOk(animal);
    }
    if (req.method === 'PATCH' || req.method === 'PUT') {
      const auth = await requireAuth(cookieHeader, store, [
        'super_admin',
        'clinic_admin',
        'veterinarian',
        'receptionist',
        'assistant',
      ]);
      const updates = parseBody(animalUpdateSchema, req.body);
      const updated = await store.updateAnimal(auth.clinicId, id, updates);
      if (!updated) return jsonError(404, 'Patient introuvable');
      return jsonOk(updated);
    }
    if (req.method === 'DELETE') {
      const auth = await requireAuth(cookieHeader, store, ['super_admin', 'clinic_admin', 'veterinarian']);
      const result = await store.archiveOrDeleteAnimal(auth.clinicId, id);
      if (!result) return jsonError(404, 'Patient introuvable');
      await store.writeAuditLog(auth.clinicId, {
        userId: auth.userId,
        userName: auth.userName,
        action: result.action === 'archived' ? 'ARCHIVE_ANIMAL' : 'DELETE_ANIMAL',
        entityType: 'animal',
        entityId: id,
      });
      return jsonOk(result);
    }
  }

  // =========================================================================
  // MEDICAL RECORDS (Consultations, Vitals, Notes, Documents, Treatments, Reminders)
  // =========================================================================
  if (subPath === '/medical-records' && req.method === 'GET') {
    const auth = await requireAuth(cookieHeader, store);
    const animalId = getQueryParam(req, 'animalId') || getQueryParam(req, 'patientId');
    const records = await store.listMedicalRecords(auth.clinicId, animalId);
    return jsonOk(records);
  }

  if (subPath === '/medical-records' && req.method === 'POST') {
    const auth = await requireAuth(cookieHeader, store, [
      'super_admin',
      'clinic_admin',
      'veterinarian',
      'assistant',
    ]);
    const input = parseBody(medicalRecordCreateSchema, req.body);
    const created = await store.createMedicalRecord(auth.clinicId, {
      ...input,
      author: input.author || auth.userName,
    });
    return jsonOk(created, 201);
  }

  const medToggleMatch = /^\/medical-records\/([^/]+)\/toggle$/.exec(subPath);
  if (medToggleMatch && (req.method === 'PATCH' || req.method === 'POST')) {
    const auth = await requireAuth(cookieHeader, store);
    const updated = await store.toggleMedicalReminder(auth.clinicId, decodeURIComponent(medToggleMatch[1]));
    if (!updated) return jsonError(404, 'Rappel clinique introuvable');
    return jsonOk(updated);
  }

  const medIdMatch = /^\/medical-records\/([^/]+)$/.exec(subPath);
  if (medIdMatch && req.method === 'DELETE') {
    const auth = await requireAuth(cookieHeader, store, ['super_admin', 'clinic_admin', 'veterinarian']);
    const ok = await store.deleteMedicalDocument(auth.clinicId, decodeURIComponent(medIdMatch[1]));
    if (!ok) return jsonError(404, 'Document introuvable');
    return jsonOk({ deleted: true });
  }

  // =========================================================================
  // VACCINATIONS
  // =========================================================================
  if (subPath === '/vaccinations' && req.method === 'GET') {
    const auth = await requireAuth(cookieHeader, store);
    const animalId = getQueryParam(req, 'patientId') || getQueryParam(req, 'animalId');
    const list = await store.listVaccinations(auth.clinicId, animalId);
    return jsonOk(list);
  }

  if (subPath === '/vaccinations' && req.method === 'POST') {
    const auth = await requireAuth(cookieHeader, store, ['super_admin', 'clinic_admin', 'veterinarian']);
    const input = parseBody(vaccinationCreateSchema, req.body);
    const created = await store.createVaccination(auth.clinicId, input);
    const scheduledCount = await scheduleVaccinationReminders(store, auth.clinicId, created.id);
    await store.writeAuditLog(auth.clinicId, {
      userId: auth.userId,
      userName: auth.userName,
      action: 'CREATE_VACCINATION',
      entityType: 'vaccination',
      entityId: created.id,
      details: { scheduledReminders: scheduledCount },
    });
    return jsonOk({ ...created, scheduledReminders: scheduledCount }, 201);
  }

  const vacIdMatch = /^\/vaccinations\/([^/]+)$/.exec(subPath);
  if (vacIdMatch) {
    const id = decodeURIComponent(vacIdMatch[1]);
    if (req.method === 'PATCH' || req.method === 'PUT') {
      const auth = await requireAuth(cookieHeader, store, ['super_admin', 'clinic_admin', 'veterinarian']);
      const updates = parseBody(vaccinationUpdateSchema, req.body);
      const updated = await store.updateVaccination(auth.clinicId, id, updates);
      if (!updated) return jsonError(404, 'Vaccination introuvable');
      await scheduleVaccinationReminders(store, auth.clinicId, updated.id);
      return jsonOk(updated);
    }
    if (req.method === 'DELETE') {
      const auth = await requireAuth(cookieHeader, store, ['super_admin', 'clinic_admin', 'veterinarian']);
      await store.cancelPendingRemindersForTarget(auth.clinicId, { vaccinationId: id });
      const deleted = await store.deleteVaccination(auth.clinicId, id);
      if (!deleted) return jsonError(404, 'Vaccination introuvable');
      return jsonOk({ deleted: true });
    }
  }

  // =========================================================================
  // APPOINTMENTS
  // =========================================================================
  if (subPath === '/appointments' && req.method === 'GET') {
    const auth = await requireAuth(cookieHeader, store);
    const list = await store.listAppointments(auth.clinicId);
    return jsonOk(list);
  }

  if (subPath === '/appointments' && req.method === 'POST') {
    const auth = await requireAuth(cookieHeader, store, [
      'super_admin',
      'clinic_admin',
      'veterinarian',
      'receptionist',
    ]);
    const input = parseBody(appointmentCreateSchema, req.body);
    const created = await store.createAppointment(auth.clinicId, input);
    const scheduledCount = await syncAppointmentReminders(store, auth.clinicId, created.id);
    await store.writeAuditLog(auth.clinicId, {
      userId: auth.userId,
      userName: auth.userName,
      action: 'CREATE_APPOINTMENT',
      entityType: 'appointment',
      entityId: created.id,
      details: { scheduledReminders: scheduledCount },
    });
    return jsonOk(created, 201);
  }

  const aptIdMatch = /^\/appointments\/([^/]+)$/.exec(subPath);
  if (aptIdMatch) {
    const id = decodeURIComponent(aptIdMatch[1]);
    if (req.method === 'PATCH' || req.method === 'PUT') {
      const auth = await requireAuth(cookieHeader, store, [
        'super_admin',
        'clinic_admin',
        'veterinarian',
        'receptionist',
      ]);
      const updates = parseBody(appointmentUpdateSchema, req.body);
      const updated = await store.updateAppointment(auth.clinicId, id, updates);
      if (!updated) return jsonError(404, 'Rendez-vous introuvable');
      await syncAppointmentReminders(store, auth.clinicId, updated.id);
      return jsonOk(updated);
    }
    if (req.method === 'DELETE') {
      const auth = await requireAuth(cookieHeader, store, ['super_admin', 'clinic_admin', 'veterinarian', 'receptionist']);
      await store.cancelPendingRemindersForTarget(auth.clinicId, { appointmentId: id });
      const deleted = await store.deleteAppointment(auth.clinicId, id);
      if (!deleted) return jsonError(404, 'Rendez-vous introuvable');
      return jsonOk({ deleted: true });
    }
  }

  return null;
}
