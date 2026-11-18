import type { ClinicSession, UserRole } from '../../shared/types/domain.ts';
import { getServerEnv } from '../config/env.ts';
import type { ClinicStore } from '../store/index.ts';
import { signSessionToken, verifySessionToken } from '../utils/crypto.ts';

export const SESSION_COOKIE_NAME = 'myvet_session';
export const DEV_LOGOUT_COOKIE_NAME = 'myvet_dev_logged_out';

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) result[key] = decodeURIComponent(val);
  }
  return result;
}

export function buildCookieHeader(
  name: string,
  value: string,
  options: { maxAgeSeconds?: number; isProduction?: boolean } = {}
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (options.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${options.maxAgeSeconds}`);
  }
  if (options.isProduction) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export async function resolveSession(
  cookieHeader: string | undefined,
  store: ClinicStore
): Promise<ClinicSession> {
  const env = getServerEnv();
  const cookies = parseCookies(cookieHeader);
  const token = cookies[SESSION_COOKIE_NAME];

  if (token) {
    const parsed = verifySessionToken(token, env.sessionSecret);
    if (parsed) {
      const user = await store.findUserById(parsed.userId);
      if (user && user.isActive) {
        const memberships = await store.getUserMemberships(user.id);
        const activeMembership = memberships.find((m) => m.clinicId === parsed.clinicId);
        if (activeMembership) {
          const activeClinic = await store.getClinicById(activeMembership.clinicId);
          if (activeClinic) {
            return {
              authenticated: true,
              isDevAutoLogin: false,
              user: {
                id: user.id,
                email: user.email,
                username: user.username,
                fullName: user.fullName,
                avatarInitials: user.avatarInitials,
              },
              activeClinic,
              activeRole: activeMembership.role,
              memberships,
            };
          }
        }
      }
    }
  }

  // Dev auto-login ONLY when NODE_ENV !== 'production', AUTO_DEV_LOGIN !== 'false', and not explicitly logged out
  if (env.autoDevLogin && cookies[DEV_LOGOUT_COOKIE_NAME] !== '1') {
    const devUser = await store.findUserById('user-dr-vet');
    if (devUser && devUser.isActive) {
      const memberships = await store.getUserMemberships(devUser.id);
      const defaultMem = memberships.find((m) => m.isDefault) || memberships[0];
      if (defaultMem) {
        const activeClinic = await store.getClinicById(defaultMem.clinicId);
        if (activeClinic) {
          return {
            authenticated: true,
            isDevAutoLogin: true,
            user: {
              id: devUser.id,
              email: devUser.email,
              username: devUser.username,
              fullName: devUser.fullName,
              avatarInitials: devUser.avatarInitials,
            },
            activeClinic,
            activeRole: defaultMem.role,
            memberships,
          };
        }
      }
    }
  }

  return {
    authenticated: false,
    isDevAutoLogin: false,
    user: null,
    activeClinic: null,
    activeRole: null,
    memberships: [],
  };
}

export class AuthError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function requireAuth(
  cookieHeader: string | undefined,
  store: ClinicStore,
  allowedRoles?: UserRole[]
): Promise<{
  session: ClinicSession;
  clinicId: string;
  userId: string;
  userName: string;
  role: UserRole;
}> {
  const session = await resolveSession(cookieHeader, store);
  if (!session.authenticated || !session.user || !session.activeClinic || !session.activeRole) {
    throw new AuthError(401, 'Authentification requise. Veuillez vous connecter à votre cabinet MyVet.');
  }

  if (allowedRoles && !allowedRoles.includes(session.activeRole)) {
    throw new AuthError(403, 'Permissions insuffisantes pour effectuer cette action.');
  }

  return {
    session,
    clinicId: session.activeClinic.id,
    userId: session.user.id,
    userName: session.user.fullName,
    role: session.activeRole,
  };
}

export function createSessionCookieForUser(
  userId: string,
  clinicId: string,
  role: UserRole
): string[] {
  const env = getServerEnv();
  const token = signSessionToken({ userId, clinicId, role }, env.sessionSecret);
  return [
    buildCookieHeader(SESSION_COOKIE_NAME, token, {
      maxAgeSeconds: 12 * 60 * 60,
      isProduction: env.isProduction,
    }),
    buildCookieHeader(DEV_LOGOUT_COOKIE_NAME, '0', {
      maxAgeSeconds: 0,
      isProduction: env.isProduction,
    }),
  ];
}

export function clearSessionCookies(): string[] {
  const env = getServerEnv();
  const cookies = [
    buildCookieHeader(SESSION_COOKIE_NAME, '', {
      maxAgeSeconds: 0,
      isProduction: env.isProduction,
    }),
  ];
  if (!env.isProduction) {
    cookies.push(
      buildCookieHeader(DEV_LOGOUT_COOKIE_NAME, '1', {
        maxAgeSeconds: 24 * 60 * 60,
        isProduction: false,
      })
    );
  }
  return cookies;
}

export function verifyCronSecret(headers: Record<string, string | string[] | undefined>): boolean {
  const env = getServerEnv();
  const auth = String(headers.authorization || headers.Authorization || '');
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

  if (env.cronSecret) {
    return bearer === env.cronSecret;
  }

  // When CRON_SECRET is unset: only allow in non-production dev/test
  if (!env.isProduction) {
    return true;
  }

  return false;
}
