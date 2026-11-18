import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { dispatchApiRequest } from '../server/core/router.ts';
import type { HttpRequest } from '../server/core/http.ts';
import { processDueReminders } from '../server/jobs/reminderEngine.ts';
import { buildGatewayPayload, detectGatewayFormat } from '../server/services/sms/index.ts';
import { MemoryClinicStore } from '../server/store/memoryStore.ts';

function req(method: string, path: string, body?: any, headers: Record<string, string> = {}): HttpRequest {
  return {
    method,
    url: path,
    path,
    query: {},
    headers,
    body: body ?? {},
    ip: '127.0.0.1',
  };
}

describe('SMS Reminder Engine, Queue Controls & Non-Destructive LocalStorage Migration', () => {
  const originalEnv = { ...process.env };
  let store: MemoryClinicStore;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.AUTO_DEV_LOGIN;
    delete process.env.SMS_WEBHOOK_SECRET;
    store = new MemoryClinicStore();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('schedules J-7/3/1 reminders on vaccination creation and prevents duplicate dispatch on rerun', async () => {
    const vacRes = await dispatchApiRequest(
      req('POST', '/api/vaccinations', {
        animalId: 'rocky',
        vaccineName: 'CHPPi-L',
        administeredDate: '2026-08-01',
        nextDueDate: '2026-08-15',
        veterinarian: 'Dr. Vétérinaire',
      }),
      store
    );
    expect(vacRes.status).toBe(201);
    expect(vacRes.body.scheduledReminders).toBe(3);

    const queueRes = await dispatchApiRequest(req('GET', '/api/sms/reminders'), store);
    const rockyReminders = queueRes.body.filter((r: any) => r.vaccination_id === vacRes.body.id);
    expect(rockyReminders.length).toBe(3);

    // Run reminder processor after all 3 dates (within sending window 10:00 Algiers time = 09:00 UTC)
    const daytimeNow = new Date('2026-08-15T10:00:00+01:00');
    const firstRun = await processDueReminders(store, {
      clinicId: 'clinic-myvet-ouled-fayet',
      now: daytimeNow,
    });
    expect(firstRun.sent).toBeGreaterThanOrEqual(3);

    // Second run must NOT resend already sent reminders
    const secondRun = await processDueReminders(store, {
      clinicId: 'clinic-myvet-ouled-fayet',
      now: daytimeNow,
    });
    expect(secondRun.sent).toBe(0);
  });

  it('defers due reminders outside legal sending window (08h-20h Africa/Algiers) unless bypassWindow is set', async () => {
    // Schedule an immediate appointment reminder
    const aptRes = await dispatchApiRequest(
      req('POST', '/api/appointments', {
        patientId: 'felix',
        date: '2026-08-16',
        startTime: '11:00',
        endTime: '11:30',
        type: 'Consultation',
        reason: 'Contrôle',
        veterinarian: 'Dr. Vétérinaire',
      }),
      store
    );
    expect(aptRes.status).toBe(201);

    // Process at 02:30 AM Algiers time (outside 08:00-20:00 window)
    const nightTime = new Date('2026-08-15T23:30:00+01:00');
    const deferredRun = await processDueReminders(store, {
      clinicId: 'clinic-myvet-ouled-fayet',
      now: nightTime,
      bypassWindow: false,
    });
    expect(deferredRun.deferred).toBeGreaterThanOrEqual(1);
    expect(deferredRun.sent).toBe(0);
  });

  it('supports manual send-now, cancel, signed/unsigned webhook, and simulated test SMS endpoint', async () => {
    const vacRes = await dispatchApiRequest(
      req('POST', '/api/vaccinations', {
        animalId: 'maya',
        vaccineName: 'Antirabique',
        administeredDate: '2026-08-01',
        nextDueDate: '2026-09-20',
      }),
      store
    );
    expect(vacRes.status).toBe(201);

    const queue = await dispatchApiRequest(req('GET', '/api/sms/reminders'), store);
    const createdRems = queue.body.filter((r: any) => r.vaccination_id === vacRes.body.id);
    expect(createdRems.length).toBe(3);

    // Send first reminder immediately
    const sendNowRes = await dispatchApiRequest(
      req('POST', `/api/sms/send-now/${createdRems[0].id}`),
      store
    );
    expect(sendNowRes.status).toBe(200);
    expect(sendNowRes.body.success).toBe(true);
    expect(sendNowRes.body.isSimulated).toBe(true);
    expect(sendNowRes.body.status).toBe('Sent');

    // Simulate signed delivery webhook callback updating Sent -> Delivered
    process.env.SMS_WEBHOOK_SECRET = 'test-webhook-secret';
    const webhookBody = {
      providerMessageId: sendNowRes.body.log.provider_message_id,
      status: 'Delivered',
    };
    const sig = crypto
      .createHmac('sha256', process.env.SMS_WEBHOOK_SECRET)
      .update(JSON.stringify(webhookBody))
      .digest('hex');

    const unsignedRes = await dispatchApiRequest(
      req('POST', '/api/sms/webhook', webhookBody),
      store
    );
    expect(unsignedRes.status).toBe(401);

    const webhookRes = await dispatchApiRequest(
      req('POST', '/api/sms/webhook', webhookBody, { 'x-sms-signature': sig }),
      store
    );
    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.updated).toBe(true);

    // Cancel second reminder
    const cancelRes = await dispatchApiRequest(
      req('POST', `/api/sms/cancel/${createdRems[1].id}`),
      store
    );
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.cancelled).toBe(true);

    // Verify Test SMS endpoint normalizes Algerian phone and logs simulation
    const testSms = await dispatchApiRequest(
      req('POST', '/api/sms/test', {
        phone: '0555 99 88 77',
        recipientName: 'Client Test',
        message: 'Cabinet My Vet: Test SMS DZD',
      }),
      store
    );
    expect(testSms.status).toBe(200);
    expect(testSms.body.phone.e164).toBe('+213555998877');
    expect(testSms.body.isSimulated).toBe(true);
  });

  it('previews localStorage migration with dryRun and stays idempotent on repeated real imports', async () => {
    const legacyPayload = {
      dryRun: true,
      clients: [
        { id: 'leg-c1', name: 'Nabil Bencherif', phone: '0550 77 66 55', email: 'nabil@dz.com', address: 'Alger' },
      ],
      patients: [
        { id: 'leg-p1', name: 'Rex', species: 'Chien', breed: 'Malinois', gender: 'Mâle', ownerId: 'leg-c1' },
      ],
      invoices: [
        { id: 'leg-i1', number: 'FAC-LEG-01', clientName: 'Nabil Bencherif', patientName: 'Rex', date: '2026-08-01', amount: 4000, status: 'Payée', paymentMethod: 'Espèces' },
      ],
    };

    const dryRunRes = await dispatchApiRequest(req('POST', '/api/system/migrate', legacyPayload), store);
    expect(dryRunRes.status).toBe(200);
    expect(dryRunRes.body.dryRun).toBe(true);
    expect(dryRunRes.body.summary.importedOwners).toBe(1);
    expect(dryRunRes.body.summary.importedInvoices).toBe(1);

    // Dry run must NOT have written the client
    const ownersBefore = await dispatchApiRequest(req('GET', '/api/owners'), store);
    expect(ownersBefore.body.some((o: any) => o.name === 'Nabil Bencherif')).toBe(false);

    // Real import
    const importRes = await dispatchApiRequest(
      req('POST', '/api/system/migrate', { ...legacyPayload, dryRun: false }),
      store
    );
    expect(importRes.status).toBe(200);
    expect(importRes.body.alreadyImported).toBe(false);
    expect(importRes.body.summary.importedOwners).toBe(1);
    expect(importRes.body.summary.importedAnimals).toBe(1);
    expect(importRes.body.summary.importedInvoices).toBe(1);

    const ownersAfter = await dispatchApiRequest(req('GET', '/api/owners'), store);
    expect(ownersAfter.body.some((o: any) => o.name === 'Nabil Bencherif')).toBe(true);

    // Second identical import is safely deduplicated
    const replayRes = await dispatchApiRequest(
      req('POST', '/api/system/migrate', { ...legacyPayload, dryRun: false }),
      store
    );
    expect(replayRes.status).toBe(200);
    expect(replayRes.body.alreadyImported).toBe(true);
  });

  it('supports POST /api/sms/send-direct for iPhone bridge & gateway and formats Pushcut/TextBee payloads', async () => {
    // 1. iPhone bridge logs SENT immediately, records patient communication, and returns sms: URI
    const iphoneRes = await dispatchApiRequest(
      req('POST', '/api/sms/send-direct', {
        clientId: 'c1',
        patientId: 'nina',
        recipientPhone: '0555 55 55 55',
        message: 'Bonjour Fatima, Nina est prête à être récupérée.',
        category: 'PICKUP',
        dispatchMethod: 'iphone_bridge',
      }),
      store
    );
    expect(iphoneRes.status).toBe(200);
    expect(iphoneRes.body.success).toBe(true);
    expect(iphoneRes.body.dispatchMethod).toBe('iphone_bridge');
    expect(iphoneRes.body.status).toBe('SENT');
    expect(iphoneRes.body.phone.e164).toBe('+213555555555');
    expect(iphoneRes.body.smsUri).toContain('sms:+213555555555?&body=');
    expect(iphoneRes.body.log.provider_name).toBe('iPhone_Messages_Bridge');
    expect(iphoneRes.body.log.recipient_name).toBe('Fatima Mansouri');
    expect(iphoneRes.body.log.animal_name).toBe('Nina');

    const records = await store.listMedicalRecords('clinic-myvet-ouled-fayet', 'nina');
    expect(records.some((r) => r.recordType === 'communication' && r.channel === 'SMS iPhone')).toBe(true);

    // 2. Gateway dispatch with Pushcut / TextBee / Generic payload formatters
    const pushcutUrl = 'https://api.pushcut.io/secret123/notifications/MyVetSMS';
    expect(detectGatewayFormat(pushcutUrl)).toBe('pushcut');
    expect(
      buildGatewayPayload(pushcutUrl, 'MyVet', {
        toE164: '+213555555555',
        senderId: 'MyVet',
        message: 'Test Pushcut',
        recipientName: 'Fatima',
        category: 'DIRECT',
      })
    ).toMatchObject({
      input: { phone: '+213555555555', message: 'Test Pushcut' },
    });

    const textbeeUrl = 'https://api.textbee.dev/api/v1/gateway/devices/dev1/send-sms';
    expect(detectGatewayFormat(textbeeUrl)).toBe('textbee');
    expect(
      buildGatewayPayload(textbeeUrl, 'MyVet', {
        toE164: '+213661223344',
        senderId: 'MyVet',
        message: 'Test TextBee',
        recipientName: 'Karim',
        category: 'DIRECT',
      })
    ).toEqual({
      recipients: ['+213661223344'],
      message: 'Test TextBee',
    });

    // 3. Rejects invalid phone numbers
    const badRes = await dispatchApiRequest(
      req('POST', '/api/sms/send-direct', {
        recipientPhone: '123',
        message: 'Invalid',
        dispatchMethod: 'iphone_bridge',
      }),
      store
    );
    expect(badRes.status).toBe(400);
  });

  it('persists SIM gateway config in-app, masks apiKey, and dispatches live 1-click SMS + send-log/:id', async () => {
    const originalFetch = globalThis.fetch;
    try {
      // 1. Configure TextBee SIM gateway via PUT /api/sms/config
      const putRes = await dispatchApiRequest(
        req('PUT', '/api/sms/config', {
          smsProviderMode: 'live',
          smsApiUrl: 'https://api.textbee.dev/api/v1/gateway/devices/dev-ooredoo-1/send-sms',
          smsApiKey: 'secret-textbee-key-9876',
          smsSenderId: 'MyVetCabinet',
          simPlanLabel: 'Ooredoo 2500 (SMS Illimité Tous Réseaux)',
        }),
        store
      );
      expect(putRes.status).toBe(200);
      expect(putRes.body.smsProviderMode).toBe('live');
      expect(putRes.body.provider_mode).toBe('PRODUCTION');
      expect(putRes.body.api_key_configured).toBe(true);
      expect(putRes.body.smsApiKeyMasked).toBe('••••9876');
      expect(putRes.body.smsApiKey).toBeUndefined();
      expect(putRes.body.simPlanLabel).toBe('Ooredoo 2500 (SMS Illimité Tous Réseaux)');

      // 2. Omitting smsApiKey on a subsequent PUT preserves the saved key
      const updatePlanRes = await dispatchApiRequest(
        req('PUT', '/api/sms/config', {
          smsProviderMode: 'live',
          smsSenderId: 'MyVetDZ',
        }),
        store
      );
      expect(updatePlanRes.status).toBe(200);
      expect(updatePlanRes.body.api_key_configured).toBe(true);
      expect(updatePlanRes.body.smsApiKeyMasked).toBe('••••9876');
      expect(updatePlanRes.body.smsApiKey).toBeUndefined();

      const getRes = await dispatchApiRequest(req('GET', '/api/sms/config'), store);
      expect(getRes.status).toBe(200);
      expect(getRes.body.smsApiKey).toBeUndefined();
      expect(getRes.body.smsApiKeyMasked).toBe('••••9876');
      expect(getRes.body.smsSenderId).toBe('MyVetDZ');

      // 3. Mock globalThis.fetch returning HTTP 200 -> 1-click send-direct defaults to 'gateway'
      const fetchCalls: Array<{ url: string; init: RequestInit }> = [];
      globalThis.fetch = (async (url: any, init: any) => {
        fetchCalls.push({ url: String(url), init });
        return new Response(JSON.stringify({ id: 'tb-msg-101', status: 'queued' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch;

      const sendOkRes = await dispatchApiRequest(
        req('POST', '/api/sms/send-direct', {
          clientId: 'c1',
          patientId: 'nina',
          recipientPhone: '0661 12 34 56',
          message: 'Bonjour, Nina est prête au cabinet MyVet.',
          category: 'PICKUP',
        }),
        store
      );
      expect(sendOkRes.status).toBe(200);
      expect(sendOkRes.body.success).toBe(true);
      expect(sendOkRes.body.dispatchMethod).toBe('gateway');
      expect(sendOkRes.body.isSimulated).toBe(false);
      expect(sendOkRes.body.status).toBe('SENT');
      expect(sendOkRes.body.phone.e164).toBe('+213661123456');
      expect(sendOkRes.body.log.status).toBe('SENT');
      expect(sendOkRes.body.log.provider_message_id).toBe('tb-msg-101');

      expect(fetchCalls.length).toBe(1);
      expect(fetchCalls[0].url).toBe('https://api.textbee.dev/api/v1/gateway/devices/dev-ooredoo-1/send-sms');
      expect(JSON.parse(String(fetchCalls[0].init.body))).toEqual({
        recipients: ['+213661123456'],
        message: 'Bonjour, Nina est prête au cabinet MyVet.',
      });

      // 4. Verify Android SMS Gate payload detection & HTTP 500 failure recording
      const androidGateUrl = 'https://api.sms-gate.app/3rdparty/v1/message';
      expect(detectGatewayFormat(androidGateUrl)).toBe('android_sms_gate');
      expect(
        buildGatewayPayload(androidGateUrl, 'MyVet', {
          toE164: '+213770112233',
          senderId: 'MyVet',
          message: 'Test Android Gate',
          recipientName: 'Amine',
          category: 'DIRECT',
        })
      ).toEqual({
        textMessage: { text: 'Test Android Gate' },
        phoneNumbers: ['+213770112233'],
      });

      await dispatchApiRequest(
        req('PUT', '/api/sms/config', {
          smsProviderMode: 'live',
          smsApiUrl: androidGateUrl,
        }),
        store
      );

      globalThis.fetch = (async () => {
        return new Response(JSON.stringify({ error: 'SIM offline' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch;

      const sendFailRes = await dispatchApiRequest(
        req('POST', '/api/sms/send-direct', {
          recipientPhone: '0770 11 22 33',
          message: 'Test échec SIM',
        }),
        store
      );
      expect(sendFailRes.status).toBe(200);
      expect(sendFailRes.body.success).toBe(false);
      expect(sendFailRes.body.status).toBe('FAILED');
      expect(sendFailRes.body.errorMessage).toContain('HTTP 500');
      expect(sendFailRes.body.log.status).toBe('FAILED');

      const historyRes = await dispatchApiRequest(req('GET', '/api/sms/history'), store);
      expect(historyRes.body.some((l: any) => l.status === 'FAILED' && l.recipient_phone === '+213770112233')).toBe(true);
      expect(historyRes.body.some((l: any) => l.status === 'SENT' && l.recipient_phone === '+213661123456')).toBe(true);

      // 5. POST /api/sms/send-log/:id dispatches queued reminder via live SIM gateway
      const vacRes = await dispatchApiRequest(
        req('POST', '/api/vaccinations', {
          animalId: 'rocky',
          vaccineName: 'Rage',
          administeredDate: '2026-08-01',
          nextDueDate: '2026-10-10',
        }),
        store
      );
      expect(vacRes.status).toBe(201);
      const queueRes = await dispatchApiRequest(req('GET', '/api/sms/reminders'), store);
      const rem = queueRes.body.find((r: any) => r.vaccination_id === vacRes.body.id);
      expect(rem).toBeDefined();

      globalThis.fetch = (async (url: any, init: any) => {
        fetchCalls.push({ url: String(url), init });
        return new Response(JSON.stringify({ messageId: 'asg-999' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch;

      const sendLogRes = await dispatchApiRequest(req('POST', `/api/sms/send-log/${rem.id}`), store);
      expect(sendLogRes.status).toBe(200);
      expect(sendLogRes.body.success).toBe(true);
      expect(sendLogRes.body.isSimulated).toBe(false);
      expect(sendLogRes.body.status).toBe('SENT');
      expect(JSON.parse(String(fetchCalls[1].init.body))).toMatchObject({
        phoneNumbers: [expect.stringMatching(/^\+213/)],
        textMessage: { text: expect.any(String) },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
