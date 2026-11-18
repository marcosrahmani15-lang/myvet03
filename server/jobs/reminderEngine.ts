import { analyzeSMSContent } from '../../shared/utils/smsSegmentation.ts';
import { normalizeAlgerianPhone } from '../../shared/utils/phone.ts';
import type { ClinicStore } from '../store/index.ts';
import {
  clampToSendingWindow,
  isWithinSendingWindow,
  renderSmsTemplate,
  resolveSmsProvider,
} from '../services/sms/index.ts';
import { generateId } from '../utils/crypto.ts';

const MAX_ATTEMPTS = 3;

export async function scheduleVaccinationReminders(
  store: ClinicStore,
  clinicId: string,
  vaccinationId: string
): Promise<number> {
  const vac = await store.getVaccinationById(clinicId, vaccinationId);
  if (!vac) return 0;

  await store.cancelPendingRemindersForTarget(clinicId, { vaccinationId: vac.id });

  const config = await store.getSmsConfig(clinicId);
  if (!config.enable_vaccination_reminders) return 0;

  const owner = await store.getOwnerById(clinicId, vac.ownerId);
  if (!owner || owner.smsConsent === false) return 0;

  const intervals = config.vaccination_intervals
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 365);

  const uniqueDays = Array.from(new Set(intervals.length > 0 ? intervals : [7, 3, 1]));
  const dueAnchor = new Date(`${vac.nextDueDate}T08:00:00+01:00`);
  if (Number.isNaN(dueAnchor.getTime())) return 0;

  const remindersToInsert = uniqueDays.map((daysBefore) => {
    const targetDate = new Date(dueAnchor.getTime() - daysBefore * 86_400_000);
    const clamped = clampToSendingWindow(
      targetDate,
      config.sending_start_hour,
      config.sending_end_hour,
      config.timezone
    );
    return {
      id: generateId('rem'),
      ownerId: vac.ownerId,
      animalId: vac.animalId,
      vaccinationId: vac.id,
      reminderType: `VACCINATION_${daysBefore}D`,
      scheduledAt: clamped.toISOString(),
      idempotencyKey: `vac-${vac.id}-${daysBefore}d-${vac.nextDueDate}`,
    };
  });

  return store.scheduleReminders(clinicId, remindersToInsert);
}

export async function syncAppointmentReminders(
  store: ClinicStore,
  clinicId: string,
  appointmentId: string
): Promise<number> {
  const apt = await store.getAppointmentById(clinicId, appointmentId);
  await store.cancelPendingRemindersForTarget(clinicId, { appointmentId });

  if (!apt) return 0;
  if (apt.status === 'Annulé' || apt.status === 'Terminé' || apt.status === 'Manqué') {
    return 0;
  }

  const config = await store.getSmsConfig(clinicId);
  if (!config.enable_appointment_reminders) return 0;

  const owner = await store.getOwnerById(clinicId, apt.clientId);
  if (!owner || owner.smsConsent === false) return 0;

  const aptDate = new Date(`${apt.date}T${apt.startTime}:00+01:00`);
  if (Number.isNaN(aptDate.getTime())) return 0;

  const leadHours = Math.max(1, config.appointment_interval_hours || 24);
  const target = new Date(aptDate.getTime() - leadHours * 3600_000);
  const clamped = clampToSendingWindow(
    target,
    config.sending_start_hour,
    config.sending_end_hour,
    config.timezone
  );

  return store.scheduleReminders(clinicId, [
    {
      id: generateId('rem'),
      ownerId: apt.clientId,
      animalId: apt.patientId,
      appointmentId: apt.id,
      reminderType: `APPOINTMENT_${leadHours}H`,
      scheduledAt: clamped.toISOString(),
      idempotencyKey: `apt-${apt.id}-${apt.date}-${apt.startTime}-${leadHours}h`,
    },
  ]);
}

export interface ProcessRemindersResult {
  workerId: string;
  claimed: number;
  processed: number;
  sent: number;
  deferred: number;
  failed: number;
  cancelled: number;
  details: Array<{ reminderId: string; status: string; reason?: string }>;
}

export async function buildReminderSmsMessage(
  store: ClinicStore,
  job: {
    clinic_id: string;
    reminder_type: string;
    preferred_language?: 'fr' | 'ar';
    owner_name?: string;
    animal_name?: string;
    vaccine_name?: string | null;
    due_date?: string | null;
    appointment_date?: string | null;
    appointment_time?: string | null;
  }
): Promise<string> {
  const templates = await store.listSmsTemplates(job.clinic_id);
  const category = job.reminder_type.startsWith('VACCINATION') ? 'VACCINATION' : 'APPOINTMENT';
  const lang = job.preferred_language || 'fr';
  const tpl =
    templates.find((t) => t.category === category && t.language === lang) ||
    templates.find((t) => t.category === category && t.is_default) ||
    templates.find((t) => t.category === category);

  const fallbackTemplate =
    category === 'VACCINATION'
      ? 'Cabinet My Vet: Bonjour {{ownerName}}, le rappel vaccin ({{vaccineName}}) pour {{animalName}} est prévu le {{dueDate}}. Tel: 0797 63 87 04.'
      : 'Cabinet My Vet: Rappel de votre RDV pour {{animalName}} le {{date}} à {{time}}. Ouled Fayet. Tel: 0797 63 87 04.';

  const rawContent = tpl?.content || fallbackTemplate;
  const rendered = renderSmsTemplate(rawContent, {
    ownerName: job.owner_name || 'Client',
    animalName: job.animal_name || 'votre compagnon',
    vaccineName: job.vaccine_name || 'Vaccin annuel',
    dueDate: job.due_date || '',
    date: job.appointment_date || '',
    time: job.appointment_time || '',
  });

  // Also replace single-brace editorial placeholders supported in UI template builder
  return rendered
    .replace(/\{proprietaire\}/gi, job.owner_name || 'Client')
    .replace(/\{animal\}/gi, job.animal_name || 'votre compagnon')
    .replace(/\{vaccin\}/gi, job.vaccine_name || 'Vaccin annuel')
    .replace(/\{date\}/gi, job.due_date || job.appointment_date || '')
    .replace(/\{heure\}/gi, job.appointment_time || '')
    .replace(/\{cabinet\}/gi, 'Cabinet My Vet')
    .replace(/\{telephone_cabinet\}/gi, '0797 63 87 04');
}

export async function processDueReminders(
  store: ClinicStore,
  options: { clinicId?: string; limit?: number; now?: Date; bypassWindow?: boolean } = {}
): Promise<ProcessRemindersResult> {
  const now = options.now || new Date();
  const workerId = `worker-${generateId('w')}`;
  const limit = options.limit ?? 50;

  const claimed = await store.claimDueReminders(workerId, limit, now, options.clinicId);
  const result: ProcessRemindersResult = {
    workerId,
    claimed: claimed.length,
    processed: 0,
    sent: 0,
    deferred: 0,
    failed: 0,
    cancelled: 0,
    details: [],
  };

  for (const job of claimed) {
    result.processed++;
    const config = await store.getSmsConfig(job.clinic_id);

    // 1. Respect owner consent
    if (!job.sms_consent) {
      await store.updateReminderDispatchState(job.id, {
        status: 'Cancelled',
        lockedAt: null,
        leaseExpiresAt: null,
        workerId: null,
        lastError: 'Consentement SMS désactivé pour ce propriétaire',
      });
      result.cancelled++;
      result.details.push({ reminderId: job.id, status: 'Cancelled', reason: 'No SMS consent' });
      continue;
    }

    // 2. Enforce Africa/Algiers legal sending window
    if (
      !options.bypassWindow &&
      !isWithinSendingWindow(now, config.sending_start_hour, config.sending_end_hour, config.timezone)
    ) {
      const nextWindow = clampToSendingWindow(
        now,
        config.sending_start_hour,
        config.sending_end_hour,
        config.timezone
      );
      await store.updateReminderDispatchState(job.id, {
        status: 'Scheduled',
        scheduledAt: nextWindow.toISOString(),
        lockedAt: null,
        leaseExpiresAt: null,
        workerId: null,
      });
      result.deferred++;
      result.details.push({
        reminderId: job.id,
        status: 'Deferred',
        reason: `Outside sending window (${config.sending_start_hour}h-${config.sending_end_hour}h ${config.timezone})`,
      });
      continue;
    }

    // 3. Validate Algerian phone
    const phoneInfo = normalizeAlgerianPhone(job.phone_normalized || job.owner_phone);
    if (!phoneInfo.isValid) {
      await store.updateReminderDispatchState(job.id, {
        status: 'Failed',
        attempts: (job.attempts || 0) + 1,
        lockedAt: null,
        leaseExpiresAt: null,
        workerId: null,
        failureType: 'PERMANENT',
        lastError: phoneInfo.error || 'Numéro invalide',
      });
      result.failed++;
      result.details.push({ reminderId: job.id, status: 'Failed', reason: phoneInfo.error });
      continue;
    }

    // 4. Load matching SMS template and render message
    const message = await buildReminderSmsMessage(store, job);

    const seg = analyzeSMSContent(message);
    const provider = resolveSmsProvider(config);
    const attempts = (job.attempts || 0) + 1;

    const dispatch = await provider.sendSms({
      toE164: phoneInfo.e164,
      senderId: config.smsSenderId || 'MyVet',
      message,
      recipientName: job.owner_name || 'Client',
      category: job.reminder_type,
      metadata: {
        reminderId: job.id,
        clinicId: job.clinic_id,
      },
    });

    await store.createSmsLog(job.clinic_id, {
      reminder_id: job.id,
      recipient_name: job.owner_name || 'Client',
      recipient_phone: phoneInfo.e164,
      animal_name: job.animal_name || null,
      category: job.reminder_type,
      message_content: message,
      encoding: seg.encoding,
      segment_count: seg.segmentCount,
      status: dispatch.status,
      is_simulated: dispatch.isSimulated,
      provider_name: dispatch.providerName,
      provider_message_id: dispatch.providerMessageId,
      provider_response: JSON.stringify(dispatch.rawResponse),
    });

    if (dispatch.success) {
      await store.updateReminderDispatchState(job.id, {
        status: dispatch.status,
        attempts,
        lockedAt: null,
        leaseExpiresAt: null,
        workerId: null,
        providerId: dispatch.providerName,
        providerMessageId: dispatch.providerMessageId,
        isSimulated: dispatch.isSimulated,
        lastError: null,
        sentAt: now.toISOString(),
      });
      result.sent++;
      result.details.push({ reminderId: job.id, status: dispatch.status });
    } else if (dispatch.failureType === 'RETRYABLE_TEMPORARY' && attempts < MAX_ATTEMPTS) {
      const backoffMs = attempts * 5 * 60_000;
      await store.updateReminderDispatchState(job.id, {
        status: 'Scheduled',
        attempts,
        scheduledAt: new Date(now.getTime() + backoffMs).toISOString(),
        lockedAt: null,
        leaseExpiresAt: null,
        workerId: null,
        failureType: 'RETRYABLE_TEMPORARY',
        isAmbiguous: Boolean(dispatch.isAmbiguous),
        lastError: dispatch.errorMessage || 'Erreur temporaire passerelle',
      });
      result.deferred++;
      result.details.push({ reminderId: job.id, status: 'RetryScheduled', reason: dispatch.errorMessage });
    } else {
      await store.updateReminderDispatchState(job.id, {
        status: 'Failed',
        attempts,
        lockedAt: null,
        leaseExpiresAt: null,
        workerId: null,
        failureType: attempts >= MAX_ATTEMPTS ? 'MAX_ATTEMPTS' : dispatch.failureType || 'PERMANENT',
        isAmbiguous: Boolean(dispatch.isAmbiguous),
        lastError: dispatch.errorMessage || 'Échec d’envoi SMS',
      });
      result.failed++;
      result.details.push({ reminderId: job.id, status: 'Failed', reason: dispatch.errorMessage });
    }
  }

  return result;
}
