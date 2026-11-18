import { migrationRequestSchema } from '../../shared/schemas/index.ts';
import { getServerEnv } from '../config/env.ts';
import { checkPostgresHealth } from '../database/pool.ts';
import { processDueReminders } from '../jobs/reminderEngine.ts';
import { requireAuth, verifyCronSecret } from '../middleware/auth.ts';
import type { ClinicStore } from '../store/index.ts';
import {
  type ApiJsonResponse,
  type HttpRequest,
  jsonError,
  jsonOk,
  parseBody,
} from '../core/http.ts';

export async function handleSystemRoute(
  req: HttpRequest,
  subPath: string,
  store: ClinicStore
): Promise<ApiJsonResponse | null> {
  const env = getServerEnv();
  const cookieHeader = req.headers.cookie as string | undefined;

  // =========================================================================
  // HEALTH CHECK
  // =========================================================================
  if (subPath === '/health' && req.method === 'GET') {
    const pgHealth = await checkPostgresHealth();
    if (env.isProduction && !pgHealth.connected) {
      return jsonOk(
        {
          status: 'unhealthy',
          environment: env.nodeEnv,
          database: {
            provider: 'PostgreSQL (Supabase)',
            connected: false,
            configured: pgHealth.configured,
            error: pgHealth.error || 'PostgreSQL unavailable in production',
          },
          timestamp: new Date().toISOString(),
        },
        503
      );
    }

    return jsonOk({
      status: pgHealth.connected ? 'ok' : 'dev_sandbox',
      environment: env.nodeEnv,
      database: {
        provider: pgHealth.connected
          ? 'PostgreSQL (Supabase)'
          : 'DevSandboxStore (Non-Production — configure DATABASE_URL)',
        connected: pgHealth.connected,
        configured: pgHealth.configured,
        latencyMs: pgHealth.latencyMs,
      },
      smsMode: env.smsProviderMode,
      timestamp: new Date().toISOString(),
    });
  }

  // =========================================================================
  // SYSTEM STATUS (Authenticated)
  // =========================================================================
  if (subPath === '/system/status' && req.method === 'GET') {
    const auth = await requireAuth(cookieHeader, store);
    const [pgHealth, counts, smsConfig] = await Promise.all([
      checkPostgresHealth(),
      store.getTableCounts(auth.clinicId),
      store.getSmsConfig(auth.clinicId),
    ]);

    return jsonOk({
      application: 'MyVet Veterinary Management System',
      country: 'Algeria',
      currency: 'DZD',
      clinic: auth.session.activeClinic?.name || 'Cabinet Vétérinaire My Vet',
      clinicId: auth.clinicId,
      environment: env.nodeEnv,
      database: {
        provider: pgHealth.connected
          ? 'PostgreSQL (Supabase)'
          : 'Mode Sandbox Dev (DATABASE_URL non configuré)',
        connected: pgHealth.connected,
        configured: pgHealth.configured,
        latencyMs: pgHealth.latencyMs,
        tables: counts,
      },
      sms: {
        providerMode: smsConfig.provider_mode,
        activeProvider: smsConfig.active_provider,
        apiKeyConfigured: Boolean(env.smsApiKey),
      },
      scheduling: {
        mode: env.isVercel ? 'Vercel Serverless Cron' : 'Webhook /api/cron/process-reminders',
        endpoint: '/api/cron/process-reminders',
        timezone: smsConfig.timezone || 'Africa/Algiers',
      },
    });
  }

  // =========================================================================
  // DATA MIGRATION (LocalStorage -> PostgreSQL)
  // =========================================================================
  if (subPath === '/system/migration/status' && req.method === 'GET') {
    const auth = await requireAuth(cookieHeader, store);
    const counts = await store.getTableCounts(auth.clinicId);
    return jsonOk({
      clinicId: auth.clinicId,
      engine: store.engineName,
      isPostgres: store.isPostgres,
      counts,
    });
  }

  if (subPath === '/system/migrate' && req.method === 'POST') {
    const auth = await requireAuth(cookieHeader, store, [
      'super_admin',
      'clinic_admin',
      'veterinarian',
    ]);
    const payload = parseBody(migrationRequestSchema, req.body);
    const report = await store.runMigration(auth.clinicId, payload, auth.userName);
    if (!report.dryRun) {
      await store.writeAuditLog(auth.clinicId, {
        userId: auth.userId,
        userName: auth.userName,
        action: 'DATA_MIGRATION_IMPORT',
        entityType: 'migration_import',
        entityId: report.batchHash,
        details: report.summary as unknown as Record<string, unknown>,
      });
    }
    return jsonOk(report);
  }

  // =========================================================================
  // CRON REMINDER PROCESSOR
  // =========================================================================
  if (subPath === '/cron/status' && req.method === 'GET') {
    const auth = await requireAuth(cookieHeader, store);
    const reminders = await store.listSmsReminders(auth.clinicId);
    return jsonOk({
      timezone: 'Africa/Algiers',
      scheduledCount: reminders.filter((r) => r.status === 'Scheduled').length,
      processingCount: reminders.filter((r) => r.status === 'Processing').length,
      sentCount: reminders.filter((r) => r.status === 'Sent' || r.status === 'Delivered').length,
      failedCount: reminders.filter((r) => r.status === 'Failed').length,
    });
  }

  if (subPath === '/cron/process-reminders' && (req.method === 'POST' || req.method === 'GET')) {
    const isCronAuthorized = verifyCronSecret(req.headers);
    let scopedClinicId: string | undefined;

    if (!isCronAuthorized) {
      // Allow authenticated clinic_admin/veterinarian manual trigger from Settings/SMS page
      const auth = await requireAuth(cookieHeader, store, [
        'super_admin',
        'clinic_admin',
        'veterinarian',
      ]);
      scopedClinicId = auth.clinicId;
    }

    const bypassWindow =
      Boolean(req.body?.bypassWindow) ||
      req.headers['x-admin-test-trigger'] === 'true';

    const results = await processDueReminders(store, {
      clinicId: scopedClinicId,
      bypassWindow,
    });

    return jsonOk({
      success: true,
      executedAt: new Date().toISOString(),
      results,
      message: `Traitement terminé : ${results.sent} envoyé(s), ${results.deferred} différé(s), ${results.failed} échec(s).`,
    });
  }

  return null;
}
