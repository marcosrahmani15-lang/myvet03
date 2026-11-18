import { ZodError, type ZodType } from 'zod';
import { DatabaseUnavailableError } from '../database/pool.ts';
import { AuthError } from '../middleware/auth.ts';

export interface HttpRequest {
  method: string;
  url: string;
  path: string;
  query: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
  body: any;
  rawBody?: string;
  ip?: string;
}

export interface ApiJsonResponse {
  status: number;
  body: any;
  headers?: Record<string, string>;
  cookies?: string[];
}

export function jsonOk(body: any, status = 200, cookies?: string[]): ApiJsonResponse {
  return { status, body, cookies };
}

export function jsonError(status: number, message: string, details?: any): ApiJsonResponse {
  return {
    status,
    body: {
      error: message,
      ...(details ? { details } : {}),
    },
  };
}

export function parseBody<T>(schema: ZodType<T>, raw: unknown): T {
  return schema.parse(raw ?? {});
}

export function getQueryParam(req: HttpRequest, key: string): string | undefined {
  const val = req.query[key];
  if (Array.isArray(val)) return val[0];
  return val;
}

export function handleRouteError(err: unknown): ApiJsonResponse {
  if (err instanceof AuthError) {
    return jsonError(err.statusCode, err.message);
  }
  if (err instanceof DatabaseUnavailableError) {
    return {
      status: 503,
      body: {
        error: err.message,
        code: err.code,
      },
    };
  }
  if (err instanceof ZodError) {
    const firstIssue = err.issues[0];
    return jsonError(400, firstIssue?.message || 'Données invalides', err.issues);
  }
  if (err instanceof Error) {
    const msg = err.message || 'Erreur serveur';
    const isClientBusinessError =
      msg.includes('introuvable') ||
      msg.includes('indisponible') ||
      msg.includes('déjà clôturée') ||
      msg.includes('postérieure') ||
      msg.includes('invalide');
    if (isClientBusinessError) {
      return jsonError(400, msg);
    }
    console.error('[API Error]', msg);
    return jsonError(500, msg);
  }
  return jsonError(500, 'Erreur interne inattendue');
}
