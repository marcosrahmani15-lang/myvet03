import {
  cashClosingCreateSchema,
  invoiceCreateSchema,
  invoiceUpdateSchema,
} from '../../shared/schemas/index.ts';
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

export async function handleFinanceRoute(
  req: HttpRequest,
  subPath: string,
  store: ClinicStore
): Promise<ApiJsonResponse | null> {
  const cookieHeader = req.headers.cookie as string | undefined;

  // =========================================================================
  // INVOICES (DZD)
  // =========================================================================
  if (subPath === '/invoices' && req.method === 'GET') {
    const auth = await requireAuth(cookieHeader, store);
    return jsonOk(await store.listInvoices(auth.clinicId));
  }

  if (subPath === '/invoices' && req.method === 'POST') {
    const auth = await requireAuth(cookieHeader, store, [
      'super_admin',
      'clinic_admin',
      'veterinarian',
      'receptionist',
    ]);
    const input = parseBody(invoiceCreateSchema, req.body);
    const created = await store.createInvoice(auth.clinicId, input, auth.userName);
    await store.writeAuditLog(auth.clinicId, {
      userId: auth.userId,
      userName: auth.userName,
      action: 'CREATE_INVOICE',
      entityType: 'invoice',
      entityId: created.id,
      details: { number: created.number, amountDzd: created.amountDzd, currency: 'DZD' },
    });
    return jsonOk(created, 201);
  }

  const invIdMatch = /^\/invoices\/([^/]+)$/.exec(subPath);
  if (invIdMatch && (req.method === 'PATCH' || req.method === 'PUT')) {
    const auth = await requireAuth(cookieHeader, store, [
      'super_admin',
      'clinic_admin',
      'veterinarian',
      'receptionist',
    ]);
    const updates = parseBody(invoiceUpdateSchema, req.body);
    const updated = await store.updateInvoice(
      auth.clinicId,
      decodeURIComponent(invIdMatch[1]),
      updates,
      auth.userName
    );
    if (!updated) return jsonError(404, 'Facture introuvable');
    return jsonOk(updated);
  }

  // =========================================================================
  // CASH CLOSINGS (DZD)
  // =========================================================================
  if (subPath === '/cash-closings' && req.method === 'GET') {
    const auth = await requireAuth(cookieHeader, store);
    const date = getQueryParam(req, 'date') || '2026-08-14';
    return jsonOk(await store.getCashClosingSummary(auth.clinicId, date));
  }

  if (subPath === '/cash-closings' && req.method === 'POST') {
    const auth = await requireAuth(cookieHeader, store, [
      'super_admin',
      'clinic_admin',
      'veterinarian',
      'receptionist',
    ]);
    const input = parseBody(cashClosingCreateSchema, req.body);
    const result = await store.closeCashDay(auth.clinicId, {
      ...input,
      operatorName: auth.userName,
    });
    await store.writeAuditLog(auth.clinicId, {
      userId: auth.userId,
      userName: auth.userName,
      action: 'CLOSE_CASH_DAY',
      entityType: 'cash_closing',
      entityId: input.closingDate,
      details: { totalDzd: result.totalDzd, varianceDzd: result.varianceDzd, currency: 'DZD' },
    });
    return jsonOk(result, 201);
  }

  // =========================================================================
  // REPORTS
  // =========================================================================
  if (subPath === '/reports/overview' && req.method === 'GET') {
    const auth = await requireAuth(cookieHeader, store);
    return jsonOk(await store.getReportsOverview(auth.clinicId));
  }

  if (subPath === '/reports/financial' && req.method === 'GET') {
    const auth = await requireAuth(cookieHeader, store);
    const [overview, invoices] = await Promise.all([
      store.getReportsOverview(auth.clinicId),
      store.listInvoices(auth.clinicId),
    ]);
    return jsonOk({
      currency: 'DZD',
      monthlyRevenueDzd: overview.monthlyRevenueDzd,
      paidCount: invoices.filter((i) => i.status === 'Payée').length,
      pendingCount: invoices.filter((i) => i.status === 'En attente').length,
      quoteCount: invoices.filter((i) => i.status === 'Devis').length,
    });
  }

  if (subPath === '/reports/medical' && req.method === 'GET') {
    const auth = await requireAuth(cookieHeader, store);
    const overview = await store.getReportsOverview(auth.clinicId);
    return jsonOk({
      consultationsCount: overview.consultationsCount,
      newPatientsCount: overview.newPatientsCount,
      vaccinationCompletionRate: overview.vaccinationCompletionRate,
      speciesBreakdown: overview.speciesBreakdown,
      actTypeBreakdown: overview.actTypeBreakdown,
    });
  }

  return null;
}
