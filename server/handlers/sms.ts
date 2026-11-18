import {
  smsConfigUpdateSchema,
  smsDirectSchema,
  smsTemplateSchema,
  smsTestSchema,
  smsWebhookSchema,
} from '../../shared/schemas/index.ts';
import { normalizeAlgerianPhone } from '../../shared/utils/phone.ts';
import { analyzeSMSContent } from '../../shared/utils/smsSegmentation.ts';
import { buildReminderSmsMessage } from '../jobs/reminderEngine.ts';
import { requireAuth } from '../middleware/auth.ts';
import type { SmsConfig } from '../../shared/types/domain.ts';
import {
  GenericHttpSmsAdapter,
  maskApiKey,
  renderSmsTemplate,
  resolveSmsProvider,
} from '../services/sms/index.ts';
import { getServerEnv } from '../config/env.ts';
import type { ClinicStore } from '../store/index.ts';
import {
  type ApiJsonResponse,
  type HttpRequest,
  jsonError,
  jsonOk,
  parseBody,
} from '../core/http.ts';

function sanitizeSmsConfigResponse(cfg: SmsConfig): Omit<SmsConfig, 'smsApiKey'> {
  const env = getServerEnv();
  const mode =
    cfg.smsProviderMode === 'live' || cfg.provider_mode === 'PRODUCTION' ? 'PRODUCTION' : 'TEST';
  const effectiveUrl = (cfg.smsApiUrl || '').trim() || env.smsApiUrl || '';
  const effectiveKey = (cfg.smsApiKey || '').trim() || env.smsApiKey || '';
  const effectiveSender = (cfg.smsSenderId || '').trim() || env.smsSenderId || 'MyVet';
  const effectivePlan =
    (cfg.simPlanLabel || '').trim() || 'Ooredoo 2500 (SMS Illimité Tous Réseaux)';

  const { smsApiKey: _omitted, ...rest } = cfg;
  return {
    ...rest,
    provider_mode: mode,
    smsProviderMode: mode === 'PRODUCTION' ? 'live' : 'test',
    smsApiUrl: effectiveUrl,
    smsApiKeyMasked: maskApiKey(effectiveKey),
    api_key_configured: Boolean(effectiveKey),
    smsSenderId: effectiveSender,
    simPlanLabel: effectivePlan,
  };
}

export async function handleSmsRoute(
  req: HttpRequest,
  subPath: string,
  store: ClinicStore
): Promise<ApiJsonResponse | null> {
  const cookieHeader = req.headers.cookie as string | undefined;

  if ((subPath === '/sms/reminders' || subPath === '/sms/queue') && req.method === 'GET') {
    const auth = await requireAuth(cookieHeader, store);
    return jsonOk(await store.listSmsReminders(auth.clinicId));
  }

  if ((subPath === '/sms/history' || subPath === '/sms/logs') && req.method === 'GET') {
    const auth = await requireAuth(cookieHeader, store);
    return jsonOk(await store.listSmsLogs(auth.clinicId));
  }

  if (subPath === '/sms/config' && req.method === 'GET') {
    const auth = await requireAuth(cookieHeader, store);
    const cfg = await store.getSmsConfig(auth.clinicId);
    return jsonOk(sanitizeSmsConfigResponse(cfg));
  }

  if (subPath === '/sms/config' && (req.method === 'PUT' || req.method === 'PATCH')) {
    const auth = await requireAuth(cookieHeader, store, ['super_admin', 'clinic_admin']);
    const updates = parseBody(smsConfigUpdateSchema, req.body);
    if (
      updates.sending_start_hour !== undefined &&
      updates.sending_end_hour !== undefined &&
      updates.sending_end_hour <= updates.sending_start_hour
    ) {
      return jsonError(400, "L'heure de fin d'envoi doit être postérieure à l'heure de début.");
    }
    const updated = await store.updateSmsConfig(auth.clinicId, updates);
    const sanitizedAuditDetails = {
      ...updates,
      ...(updates.smsApiKey !== undefined
        ? { smsApiKey: updates.smsApiKey ? '***' : '' }
        : {}),
    };
    await store.writeAuditLog(auth.clinicId, {
      userId: auth.userId,
      userName: auth.userName,
      action: 'UPDATE_SMS_CONFIG',
      entityType: 'sms_config',
      entityId: auth.clinicId,
      details: sanitizedAuditDetails,
    });
    return jsonOk(sanitizeSmsConfigResponse(updated));
  }

  if (subPath === '/sms/templates' && req.method === 'GET') {
    const auth = await requireAuth(cookieHeader, store);
    return jsonOk(await store.listSmsTemplates(auth.clinicId));
  }

  if (subPath === '/sms/templates' && req.method === 'POST') {
    const auth = await requireAuth(cookieHeader, store, ['super_admin', 'clinic_admin', 'veterinarian']);
    const input = parseBody(smsTemplateSchema, req.body);
    return jsonOk(await store.upsertSmsTemplate(auth.clinicId, input), 201);
  }

  const tplIdMatch = /^\/sms\/templates\/([^/]+)$/.exec(subPath);
  if (tplIdMatch && (req.method === 'PATCH' || req.method === 'PUT')) {
    const auth = await requireAuth(cookieHeader, store, ['super_admin', 'clinic_admin', 'veterinarian']);
    const input = parseBody(smsTemplateSchema, { ...req.body, id: decodeURIComponent(tplIdMatch[1]) });
    return jsonOk(await store.upsertSmsTemplate(auth.clinicId, input));
  }

  if (subPath === '/sms/test' && req.method === 'POST') {
    const auth = await requireAuth(cookieHeader, store, [
      'super_admin',
      'clinic_admin',
      'veterinarian',
      'receptionist',
    ]);
    const input = parseBody(smsTestSchema, req.body);
    const phoneInfo = normalizeAlgerianPhone(input.phone);
    if (!phoneInfo.isValid) {
      return jsonError(400, phoneInfo.error || 'Numéro algérien invalide');
    }

    const config = await store.getSmsConfig(auth.clinicId);
    const provider = resolveSmsProvider(config);
    const seg = analyzeSMSContent(input.message);

    const dispatch = await provider.sendSms({
      toE164: phoneInfo.e164,
      senderId: config.smsSenderId || 'MyVet',
      message: input.message,
      recipientName: input.recipientName,
      category: input.category,
    });

    const log = await store.createSmsLog(auth.clinicId, {
      reminder_id: null,
      recipient_name: input.recipientName,
      recipient_phone: phoneInfo.e164,
      animal_name: input.animalName,
      category: input.category,
      message_content: input.message,
      encoding: seg.encoding,
      segment_count: seg.segmentCount,
      status: dispatch.status,
      is_simulated: dispatch.isSimulated,
      provider_name: dispatch.providerName,
      provider_message_id: dispatch.providerMessageId,
      provider_response: JSON.stringify(dispatch.rawResponse),
    });

    return jsonOk({
      success: dispatch.success,
      isSimulated: dispatch.isSimulated,
      status: dispatch.status,
      providerMessageId: dispatch.providerMessageId,
      phone: phoneInfo,
      segmentation: seg,
      log,
    });
  }

  if (subPath === '/sms/send-direct' && req.method === 'POST') {
    const auth = await requireAuth(cookieHeader, store, [
      'super_admin',
      'clinic_admin',
      'veterinarian',
      'receptionist',
    ]);
    const input = parseBody(smsDirectSchema, req.body);
    const phoneInfo = normalizeAlgerianPhone(input.recipientPhone);
    if (!phoneInfo.isValid) {
      return jsonError(400, phoneInfo.error || 'Numéro algérien invalide');
    }

    const owner = input.clientId ? await store.getOwnerById(auth.clinicId, input.clientId) : null;
    const animal = input.patientId ? await store.getAnimalById(auth.clinicId, input.patientId) : null;
    const recipientName = input.recipientName?.trim() || owner?.name || 'Client';
    const animalName = input.animalName?.trim() || animal?.name || null;
    const category = input.category || 'DIRECT';
    const dispatchMethod = input.dispatchMethod || 'gateway';
    const seg = analyzeSMSContent(input.message);
    const smsUri = `sms:${phoneInfo.e164}?&body=${encodeURIComponent(input.message)}`;

    if (dispatchMethod === 'iphone_bridge') {
      const providerMessageId = `iphone-${Date.now()}`;
      const log = await store.createSmsLog(auth.clinicId, {
        reminder_id: input.reminderId || null,
        recipient_name: recipientName,
        recipient_phone: phoneInfo.e164,
        animal_name: animalName,
        category,
        message_content: input.message,
        encoding: seg.encoding,
        segment_count: seg.segmentCount,
        status: 'SENT',
        is_simulated: false,
        provider_name: 'iPhone_Messages_Bridge',
        provider_message_id: providerMessageId,
        provider_response: JSON.stringify({
          dispatchMethod: 'iphone_bridge',
          channel: 'iOS / macOS Messages / Windows Phone Link',
          smsUri,
          dispatchedBy: auth.userName,
          clientId: owner?.id || input.clientId || null,
          patientId: animal?.id || input.patientId || null,
        }),
      });

      if (input.reminderId) {
        const rem = await store.getSmsReminderById(auth.clinicId, input.reminderId);
        if (rem) {
          await store.updateReminderDispatchState(input.reminderId, {
            status: 'Sent',
            attempts: (rem.attempts || 0) + 1,
            lockedAt: null,
            leaseExpiresAt: null,
            workerId: null,
            providerId: 'iPhone_Messages_Bridge',
            providerMessageId,
            isSimulated: false,
            lastError: null,
            sentAt: new Date().toISOString(),
          });
        }
      }

      if (animal) {
        try {
          await store.createMedicalRecord(auth.clinicId, {
            animalId: animal.id,
            recordType: 'communication',
            author: auth.userName,
            title: 'SMS iPhone direct',
            payload: {
              channel: 'SMS iPhone',
              recipient: recipientName,
              phone: phoneInfo.e164,
              message: input.message,
              category,
              status: 'SENT',
            },
          });
        } catch {
          // Do not block SMS dispatch if medical communication log fails
        }
      }

      await store.writeAuditLog(auth.clinicId, {
        userId: auth.userId,
        userName: auth.userName,
        action: 'SEND_DIRECT_SMS_IPHONE',
        entityType: 'sms_log',
        entityId: log.id,
        details: {
          recipientPhone: phoneInfo.e164,
          clientId: owner?.id || input.clientId || null,
          patientId: animal?.id || input.patientId || null,
          category,
        },
      });

      return jsonOk({
        success: true,
        dispatchMethod: 'iphone_bridge',
        isSimulated: false,
        status: 'SENT',
        providerMessageId,
        smsUri,
        phone: phoneInfo,
        segmentation: seg,
        log,
      });
    }

    // dispatchMethod === 'gateway' (1-click SIM Gateway or Test Simulator based on clinic config)
    const config = await store.getSmsConfig(auth.clinicId);
    const env = getServerEnv();
    const provider = resolveSmsProvider(config);

    const dispatch = await provider.sendSms({
      toE164: phoneInfo.e164,
      senderId: config.smsSenderId || env.smsSenderId || 'MyVet',
      message: input.message,
      recipientName,
      category,
      metadata: {
        ...(owner?.id || input.clientId ? { clientId: owner?.id || input.clientId! } : {}),
        ...(animal?.id || input.patientId ? { patientId: animal?.id || input.patientId! } : {}),
        ...(input.reminderId ? { reminderId: input.reminderId } : {}),
      },
    });

    const logStatus = dispatch.success ? 'SENT' : 'FAILED';
    const reminderStatus = dispatch.success ? 'Sent' : 'Failed';

    const log = await store.createSmsLog(auth.clinicId, {
      reminder_id: input.reminderId || null,
      recipient_name: recipientName,
      recipient_phone: phoneInfo.e164,
      animal_name: animalName,
      category,
      message_content: input.message,
      encoding: seg.encoding,
      segment_count: seg.segmentCount,
      status: logStatus,
      is_simulated: dispatch.isSimulated,
      provider_name: dispatch.providerName,
      provider_message_id: dispatch.providerMessageId,
      provider_response: JSON.stringify({
        ...dispatch.rawResponse,
        ...(dispatch.errorMessage ? { errorMessage: dispatch.errorMessage } : {}),
      }),
    });

    if (input.reminderId) {
      const rem = await store.getSmsReminderById(auth.clinicId, input.reminderId);
      if (rem) {
        await store.updateReminderDispatchState(input.reminderId, {
          status: reminderStatus,
          attempts: (rem.attempts || 0) + 1,
          lockedAt: null,
          leaseExpiresAt: null,
          workerId: null,
          providerId: dispatch.providerName,
          providerMessageId: dispatch.providerMessageId,
          isSimulated: dispatch.isSimulated,
          lastError: dispatch.success ? null : dispatch.errorMessage || 'Échec envoi passerelle SIM',
          sentAt: dispatch.success ? new Date().toISOString() : null,
        });
      }
    }

    if (animal && dispatch.success) {
      try {
        await store.createMedicalRecord(auth.clinicId, {
          animalId: animal.id,
          recordType: 'communication',
          author: auth.userName,
          title: 'SMS direct (Passerelle SIM)',
          payload: {
            channel: dispatch.isSimulated ? 'SMS (Simulateur)' : 'SMS (Passerelle SIM)',
            recipient: recipientName,
            phone: phoneInfo.e164,
            message: input.message,
            category,
            status: logStatus,
          },
        });
      } catch {
        // Non-blocking medical history note
      }
    }

    await store.writeAuditLog(auth.clinicId, {
      userId: auth.userId,
      userName: auth.userName,
      action: 'SEND_DIRECT_SMS_GATEWAY',
      entityType: 'sms_log',
      entityId: log.id,
      details: {
        recipientPhone: phoneInfo.e164,
        success: dispatch.success,
        status: logStatus,
        providerName: dispatch.providerName,
      },
    });

    return jsonOk({
      success: dispatch.success,
      dispatchMethod: 'gateway',
      isSimulated: dispatch.isSimulated,
      status: logStatus,
      errorMessage: dispatch.errorMessage,
      providerMessageId: dispatch.providerMessageId,
      smsUri,
      phone: phoneInfo,
      segmentation: seg,
      log,
    });
  }

  const retryMatch = /^\/sms\/retry\/([^/]+)$/.exec(subPath);
  if (retryMatch && req.method === 'POST') {
    const auth = await requireAuth(cookieHeader, store, ['super_admin', 'clinic_admin', 'veterinarian']);
    const id = decodeURIComponent(retryMatch[1]);
    const rem = await store.getSmsReminderById(auth.clinicId, id);
    if (!rem) return jsonError(404, 'Rappel SMS introuvable');
    if (rem.status !== 'Failed' && rem.status !== 'Scheduled' && rem.status !== 'Unknown') {
      return jsonError(400, `Impossible de relancer un rappel au statut "${rem.status}".`);
    }
    await store.updateReminderDispatchState(id, {
      status: 'Scheduled',
      scheduledAt: new Date().toISOString(),
      lockedAt: null,
      leaseExpiresAt: null,
      workerId: null,
      lastError: null,
    });
    return jsonOk({ retried: true, reminderId: id });
  }

  const sendLogMatch = /^\/sms\/(send-now|send-log)\/([^/]+)$/.exec(subPath);
  if (sendLogMatch && req.method === 'POST') {
    const auth = await requireAuth(cookieHeader, store, ['super_admin', 'clinic_admin', 'veterinarian', 'receptionist']);
    const routeVariant = sendLogMatch[1];
    const id = decodeURIComponent(sendLogMatch[2]);
    const rem = await store.getSmsReminderById(auth.clinicId, id);
    if (!rem) return jsonError(404, 'Rappel SMS introuvable');

    const phoneInfo = normalizeAlgerianPhone(rem.owner_phone || rem.phone_normalized || '');
    if (!phoneInfo.isValid) {
      return jsonError(400, phoneInfo.error || 'Numéro algérien invalide pour ce rappel');
    }

    const config = await store.getSmsConfig(auth.clinicId);
    const provider = resolveSmsProvider(config);
    const customMsg =
      typeof req.body?.message === 'string' && req.body.message.trim().length >= 3
        ? req.body.message.trim()
        : await buildReminderSmsMessage(store, rem);
    const seg = analyzeSMSContent(customMsg);

    const dispatch = await provider.sendSms({
      toE164: phoneInfo.e164,
      senderId: config.smsSenderId || 'MyVet',
      message: customMsg,
      recipientName: rem.owner_name || 'Propriétaire',
      category: rem.reminder_type,
      metadata: {
        reminderId: id,
        clinicId: auth.clinicId,
      },
    });

    const reminderStatus =
      routeVariant === 'send-log'
        ? dispatch.success
          ? 'Sent'
          : 'Failed'
        : dispatch.status;
    const responseStatus =
      routeVariant === 'send-log'
        ? dispatch.success
          ? 'SENT'
          : 'FAILED'
        : dispatch.status;

    await store.updateReminderDispatchState(id, {
      status: reminderStatus,
      attempts: (rem.attempts || 0) + 1,
      lockedAt: null,
      leaseExpiresAt: null,
      workerId: null,
      providerId: dispatch.providerName,
      providerMessageId: dispatch.providerMessageId,
      isSimulated: dispatch.isSimulated,
      lastError: dispatch.success ? null : dispatch.errorMessage || 'Échec envoi passerelle SIM',
      sentAt: dispatch.success ? new Date().toISOString() : null,
      deliveredAt: dispatch.status === 'Delivered' ? new Date().toISOString() : null,
    });

    const log = await store.createSmsLog(auth.clinicId, {
      reminder_id: id,
      recipient_name: rem.owner_name || 'Propriétaire',
      recipient_phone: phoneInfo.e164,
      animal_name: rem.animal_name || null,
      category: rem.reminder_type,
      message_content: customMsg,
      encoding: seg.encoding,
      segment_count: seg.segmentCount,
      status: responseStatus,
      is_simulated: dispatch.isSimulated,
      provider_name: dispatch.providerName,
      provider_message_id: dispatch.providerMessageId,
      provider_response: JSON.stringify({
        ...dispatch.rawResponse,
        ...(dispatch.errorMessage ? { errorMessage: dispatch.errorMessage } : {}),
      }),
    });

    return jsonOk({
      success: dispatch.success,
      isSimulated: dispatch.isSimulated,
      status: responseStatus,
      errorMessage: dispatch.errorMessage,
      phone: phoneInfo,
      log,
    });
  }

  const cancelMatch = /^\/sms\/cancel\/([^/]+)$/.exec(subPath);
  if (cancelMatch && req.method === 'POST') {
    const auth = await requireAuth(cookieHeader, store, ['super_admin', 'clinic_admin', 'veterinarian']);
    const id = decodeURIComponent(cancelMatch[1]);
    const rem = await store.getSmsReminderById(auth.clinicId, id);
    if (!rem) return jsonError(404, 'Rappel SMS introuvable');
    await store.updateReminderDispatchState(id, {
      status: 'Cancelled',
      lockedAt: null,
      leaseExpiresAt: null,
      workerId: null,
    });
    return jsonOk({ cancelled: true, reminderId: id });
  }

  if (subPath === '/sms/webhook' && req.method === 'POST') {
    const env = getServerEnv();
    if (env.smsWebhookSecret) {
      const sig = String(req.headers['x-sms-signature'] || req.headers['x-webhook-signature'] || '');
      const adapter = new GenericHttpSmsAdapter({
        apiUrl: env.smsApiUrl || '',
        apiKey: env.smsApiKey || '',
        senderId: env.smsSenderId,
        webhookSecret: env.smsWebhookSecret,
      });
      const raw = req.rawBody || JSON.stringify(req.body || {});
      if (!adapter.verifyWebhookSignature(raw, sig)) {
        return jsonError(401, 'Signature webhook SMS invalide');
      }
    }

    const evt = parseBody(smsWebhookSchema, req.body);
    const updated = await store.updateSmsStatusByProviderMessageId(
      evt.providerMessageId,
      evt.status,
      evt.errorDetail,
      evt.rawPayload
    );
    return jsonOk({ acknowledged: true, updated });
  }

  if (subPath === '/sms/calculate-segments' && req.method === 'POST') {
    const text = String(req.body?.message || req.body?.text || '');
    return jsonOk(analyzeSMSContent(text));
  }

  if (subPath === '/sms/preview' && req.method === 'POST') {
    const template = String(req.body?.template || '');
    const variables = (req.body?.variables || {}) as Record<string, string>;
    const rendered = renderSmsTemplate(template, variables);
    return jsonOk({
      rendered,
      segmentation: analyzeSMSContent(rendered),
    });
  }

  return null;
}
