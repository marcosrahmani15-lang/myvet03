import {
  clinicUpdateSchema,
  loginSchema,
  switchClinicSchema,
} from '../../shared/schemas/index.ts';
import {
  clearSessionCookies,
  createSessionCookieForUser,
  requireAuth,
  resolveSession,
} from '../middleware/auth.ts';
import type { ClinicStore } from '../store/index.ts';
import { verifyPassword } from '../utils/crypto.ts';
import {
  type ApiJsonResponse,
  type HttpRequest,
  jsonError,
  jsonOk,
  parseBody,
} from '../core/http.ts';

export async function handleAuthRoute(
  req: HttpRequest,
  subPath: string,
  store: ClinicStore
): Promise<ApiJsonResponse | null> {
  const cookieHeader = req.headers.cookie as string | undefined;

  if (subPath === '/auth/session' && req.method === 'GET') {
    const session = await resolveSession(cookieHeader, store);
    return jsonOk(session);
  }

  if (subPath === '/auth/login' && req.method === 'POST') {
    const input = parseBody(loginSchema, req.body);
    const rateKey = `${req.ip || 'unknown'}:${input.identifier.toLowerCase()}`;

    const attemptCheck = await store.checkAndRecordLoginAttempt(
      rateKey,
      5,
      15 * 60_000,
      15 * 60_000
    );
    if (!attemptCheck.allowed) {
      return jsonError(
        429,
        `Trop de tentatives de connexion. Réessayez dans ${attemptCheck.retryAfterSec || 60} secondes.`
      );
    }

    const user = await store.findUserByIdentifier(input.identifier);
    if (!user || !user.isActive || !verifyPassword(input.password, user.passwordHash)) {
      return jsonError(401, 'Identifiant ou mot de passe incorrect.');
    }

    const memberships = await store.getUserMemberships(user.id);
    if (memberships.length === 0) {
      return jsonError(403, 'Aucun cabinet associé à ce compte.');
    }

    const chosenMembership = input.clinicId
      ? memberships.find((m) => m.clinicId === input.clinicId)
      : memberships.find((m) => m.isDefault) || memberships[0];

    if (!chosenMembership) {
      return jsonError(403, 'Accès non autorisé à ce cabinet.');
    }

    const clinic = await store.getClinicById(chosenMembership.clinicId);
    if (!clinic) {
      return jsonError(404, 'Cabinet introuvable.');
    }

    await store.clearLoginAttempts(rateKey);
    await store.writeAuditLog(clinic.id, {
      userId: user.id,
      userName: user.fullName,
      action: 'LOGIN',
      entityType: 'session',
      entityId: user.id,
    });

    const cookies = createSessionCookieForUser(user.id, clinic.id, chosenMembership.role);
    return jsonOk(
      {
        authenticated: true,
        isDevAutoLogin: false,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          fullName: user.fullName,
          avatarInitials: user.avatarInitials,
        },
        activeClinic: clinic,
        activeRole: chosenMembership.role,
        memberships,
      },
      200,
      cookies
    );
  }

  if (subPath === '/auth/logout' && req.method === 'POST') {
    const cookies = clearSessionCookies();
    return jsonOk({ authenticated: false, loggedOut: true }, 200, cookies);
  }

  if (subPath === '/auth/switch-clinic' && req.method === 'POST') {
    const auth = await requireAuth(cookieHeader, store);
    const { clinicId } = parseBody(switchClinicSchema, req.body);

    const membership = auth.session.memberships.find((m) => m.clinicId === clinicId);
    if (!membership) {
      return jsonError(403, 'Vous n’êtes pas membre de ce cabinet.');
    }

    const clinic = await store.getClinicById(clinicId);
    if (!clinic) {
      return jsonError(404, 'Cabinet introuvable.');
    }

    const cookies = createSessionCookieForUser(auth.userId, clinic.id, membership.role);
    return jsonOk(
      {
        ...auth.session,
        isDevAutoLogin: false,
        activeClinic: clinic,
        activeRole: membership.role,
      },
      200,
      cookies
    );
  }

  if (subPath === '/clinic' && (req.method === 'PATCH' || req.method === 'PUT')) {
    const auth = await requireAuth(cookieHeader, store, ['super_admin', 'clinic_admin']);
    const data = parseBody(clinicUpdateSchema, req.body);
    const updated = await store.updateClinic(auth.clinicId, data);
    await store.writeAuditLog(auth.clinicId, {
      userId: auth.userId,
      userName: auth.userName,
      action: 'UPDATE_CLINIC',
      entityType: 'clinic',
      entityId: auth.clinicId,
      details: data,
    });
    return jsonOk(updated);
  }

  return null;
}
