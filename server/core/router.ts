import { getClinicStore, type ClinicStore } from '../store/index.ts';
import {
  type ApiJsonResponse,
  type HttpRequest,
  handleRouteError,
  jsonError,
} from './http.ts';
import { handleAuthRoute } from '../handlers/auth.ts';
import { handleClinicalRoute } from '../handlers/clinical.ts';
import { handleOperationsRoute } from '../handlers/operations.ts';
import { handleFinanceRoute } from '../handlers/finance.ts';
import { handleSmsRoute } from '../handlers/sms.ts';
import { handleSystemRoute } from '../handlers/system.ts';

export const SMS_DIRECT_ROUTES = ['/sms/config', '/sms/send-direct', '/sms/send-log/:id'] as const;

export async function dispatchApiRequest(
  req: HttpRequest,
  injectedStore?: ClinicStore
): Promise<ApiJsonResponse> {
  try {
    const store = injectedStore || getClinicStore();
    const cleanPath = req.path.replace(/^\/api/, '') || '/';

    const handlers = [
      handleSystemRoute,
      handleAuthRoute,
      handleClinicalRoute,
      handleOperationsRoute,
      handleFinanceRoute,
      handleSmsRoute, // Handles /sms/send-direct, /sms/reminders, /sms/history, /sms/config, /sms/templates, etc.
    ];

    for (const handler of handlers) {
      const response = await handler(req, cleanPath, store);
      if (response) return response;
    }

    return jsonError(404, `Route API introuvable : ${req.method} /api${cleanPath}`);
  } catch (err) {
    return handleRouteError(err);
  }
}
