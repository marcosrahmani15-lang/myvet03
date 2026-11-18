import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dispatchApiRequest } from '../server/core/router.ts';
import type { HttpRequest } from '../server/core/http.ts';
import { MemoryClinicStore } from '../server/store/memoryStore.ts';

function makeReq(
  method: string,
  path: string,
  options: { body?: any; cookie?: string; headers?: Record<string, string>; ip?: string } = {}
): HttpRequest {
  return {
    method,
    url: path,
    path,
    query: {},
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.headers || {}),
    },
    body: options.body ?? {},
    ip: options.ip || '127.0.0.1',
  };
}

function extractCookieHeader(setCookies: string[] | undefined): string {
  if (!setCookies) return '';
  return setCookies.map((c) => c.split(';')[0]).join('; ');
}

describe('Authentication, Production Fail-Closed, RBAC & Multi-Clinic Tenant Isolation', () => {
  const originalEnv = { ...process.env };
  let store: MemoryClinicStore;

  beforeEach(() => {
    store = new MemoryClinicStore();
    process.env.NODE_ENV = 'test';
    delete process.env.DATABASE_URL;
    delete process.env.AUTO_DEV_LOGIN;
    delete process.env.REQUIRE_LOGIN;
    delete process.env.VERCEL_ENV;
    process.env.SESSION_SECRET = 'test-secret-key-at-least-32-chars-long';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('auto-authenticates default clinic seamlessly in both dev and production when no login wall is enabled', async () => {
    const res = await dispatchApiRequest(makeReq('GET', '/api/auth/session'), store);
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.isDevAutoLogin).toBe(true);
    expect(res.body.activeClinic.id).toBe('clinic-myvet-ouled-fayet');

    process.env.NODE_ENV = 'production';
    const prodSession = await dispatchApiRequest(makeReq('GET', '/api/auth/session'), store);
    expect(prodSession.status).toBe(200);
    expect(prodSession.body.authenticated).toBe(true);
    expect(prodSession.body.activeClinic.id).toBe('clinic-myvet-ouled-fayet');
  });

  it('fails closed with 503 DATABASE_UNAVAILABLE when NODE_ENV=production without DATABASE_URL', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;

    // No injected store -> uses getClinicStore() which MUST throw DatabaseUnavailableError -> 503
    const ownersRes = await dispatchApiRequest(makeReq('GET', '/api/owners'));
    expect(ownersRes.status).toBe(503);
    expect(ownersRes.body.code).toBe('DATABASE_UNAVAILABLE');

    const healthRes = await dispatchApiRequest(makeReq('GET', '/api/health'));
    expect(healthRes.status).toBe(503);
    expect(healthRes.body.code).toBe('DATABASE_UNAVAILABLE');
  });

  it('requires explicit login when REQUIRE_LOGIN=true and issues HMAC cookie', async () => {
    process.env.NODE_ENV = 'production';
    process.env.REQUIRE_LOGIN = 'true';

    const unauthSession = await dispatchApiRequest(makeReq('GET', '/api/auth/session'), store);
    expect(unauthSession.status).toBe(200);
    expect(unauthSession.body.authenticated).toBe(false);

    const protectedRes = await dispatchApiRequest(makeReq('GET', '/api/owners'), store);
    expect(protectedRes.status).toBe(401);

    const loginRes = await dispatchApiRequest(
      makeReq('POST', '/api/auth/login', {
        body: { identifier: 'dr.vet@myvet.dz', password: 'MyVet2026!' },
      }),
      store
    );
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.authenticated).toBe(true);
    expect(loginRes.body.isDevAutoLogin).toBe(false);

    const cookie = extractCookieHeader(loginRes.cookies);
    expect(cookie).toContain('myvet_session=');

    const authedOwners = await dispatchApiRequest(
      makeReq('GET', '/api/owners', { cookie }),
      store
    );
    expect(authedOwners.status).toBe(200);
    expect(Array.isArray(authedOwners.body)).toBe(true);
  });

  it('enforces login rate limiting (429 on 5th failed attempt) when REQUIRE_LOGIN=true', async () => {
    process.env.NODE_ENV = 'production';
    process.env.REQUIRE_LOGIN = 'true';

    for (let i = 0; i < 4; i++) {
      const bad = await dispatchApiRequest(
        makeReq('POST', '/api/auth/login', {
          body: { identifier: 'dr.vet@myvet.dz', password: 'wrong-password' },
          ip: '10.10.10.99',
        }),
        store
      );
      expect(bad.status).toBe(401);
    }

    const blocked = await dispatchApiRequest(
      makeReq('POST', '/api/auth/login', {
        body: { identifier: 'dr.vet@myvet.dz', password: 'MyVet2026!' },
        ip: '10.10.10.99',
      }),
      store
    );
    expect(blocked.status).toBe(429);
  });

  it('enforces RBAC so receptionists cannot change clinic SMS config or delete animals', async () => {
    process.env.NODE_ENV = 'production';

    const loginRec = await dispatchApiRequest(
      makeReq('POST', '/api/auth/login', {
        body: { identifier: 'accueil@myvet.dz', password: 'MyVet2026!' },
      }),
      store
    );
    expect(loginRec.status).toBe(200);
    const cookie = extractCookieHeader(loginRec.cookies);

    const smsUpdateRes = await dispatchApiRequest(
      makeReq('PUT', '/api/sms/config', {
        cookie,
        body: { provider_mode: 'PRODUCTION' },
      }),
      store
    );
    expect(smsUpdateRes.status).toBe(403);

    const deleteAnimalRes = await dispatchApiRequest(
      makeReq('DELETE', '/api/animals/nina', { cookie }),
      store
    );
    expect(deleteAnimalRes.status).toBe(403);
  });

  it('isolates data strictly between clinics when switching clinic', async () => {
    process.env.NODE_ENV = 'production';

    // Inject a test-only secondary clinic so production seeds remain Ouled Fayet only
    const testClinicId = 'clinic-test-isolation';
    (store as any).clinics.push({
      id: testClinicId,
      name: 'My Vet — Test Isolation',
      slug: 'myvet-test-isolation',
      slogan: 'Test Tenant',
      address: 'Test Address',
      phone: '0550 11 22 33',
      email: 'isolation@myvet.dz',
      timezone: 'Africa/Algiers',
      currency: 'DZD',
    });
    (store as any).memberships.push({
      userId: 'user-dr-vet',
      clinicId: testClinicId,
      clinicName: 'My Vet — Test Isolation',
      clinicSlug: 'myvet-test-isolation',
      role: 'clinic_admin',
      title: 'Test Admin',
      isDefault: false,
    });
    (store as any).owners.push({
      id: 'c-test-iso-1',
      clinicId: testClinicId,
      name: 'Nadia TestTenant',
      phone: '0550 99 88 77',
      phoneNormalized: '+213550998877',
      email: 'nadia.t@email.dz',
      address: 'Alger',
      preferredLanguage: 'fr',
      smsConsent: true,
      notes: 'Test-only tenant',
      animalsCount: 0,
      archivedAt: null,
    });
    (store as any).smsConfigs.set(testClinicId, {
      id: testClinicId,
      clinic_id: testClinicId,
      provider_mode: 'TEST',
      active_provider: 'Ooredoo_Business_Algeria',
      api_key_configured: false,
      enable_vaccination_reminders: true,
      vaccination_intervals: '7,3,1',
      enable_appointment_reminders: true,
      appointment_interval_hours: 24,
      sending_start_hour: 8,
      sending_end_hour: 20,
      timezone: 'Africa/Algiers',
    });

    const loginAdmin = await dispatchApiRequest(
      makeReq('POST', '/api/auth/login', {
        body: { identifier: 'dr.vet@myvet.dz', password: 'MyVet2026!' },
      }),
      store
    );
    let cookie = extractCookieHeader(loginAdmin.cookies);

    // Ouled Fayet sees Fatima, does not see test tenant's Nadia
    const ofOwners = await dispatchApiRequest(makeReq('GET', '/api/owners', { cookie }), store);
    expect(ofOwners.body.some((o: any) => o.name === 'Fatima Mansouri')).toBe(true);
    expect(ofOwners.body.some((o: any) => o.name === 'Nadia TestTenant')).toBe(false);

    // Switch to test-only secondary clinic
    const switchRes = await dispatchApiRequest(
      makeReq('POST', '/api/auth/switch-clinic', {
        cookie,
        body: { clinicId: testClinicId },
      }),
      store
    );
    expect(switchRes.status).toBe(200);
    cookie = extractCookieHeader(switchRes.cookies);

    // Create owner inside secondary clinic
    const createdSecondaryOwner = await dispatchApiRequest(
      makeReq('POST', '/api/owners', {
        cookie,
        body: { name: 'Yasmine SecondClinic', phone: '0550 22 33 44' },
      }),
      store
    );
    expect(createdSecondaryOwner.status).toBe(201);

    const secondaryOwners = await dispatchApiRequest(makeReq('GET', '/api/owners', { cookie }), store);
    expect(secondaryOwners.body.some((o: any) => o.name === 'Yasmine SecondClinic')).toBe(true);
    expect(secondaryOwners.body.some((o: any) => o.name === 'Fatima Mansouri')).toBe(false);

    // Switch back to Ouled Fayet and verify Yasmine SecondClinic is invisible
    const switchBack = await dispatchApiRequest(
      makeReq('POST', '/api/auth/switch-clinic', {
        cookie,
        body: { clinicId: 'clinic-myvet-ouled-fayet' },
      }),
      store
    );
    cookie = extractCookieHeader(switchBack.cookies);
    const ofOwnersAfter = await dispatchApiRequest(makeReq('GET', '/api/owners', { cookie }), store);
    expect(ofOwnersAfter.body.some((o: any) => o.name === 'Yasmine SecondClinic')).toBe(false);

    // Cross-tenant GET by ID returns 404
    const crossGet = await dispatchApiRequest(
      makeReq('GET', `/api/owners/${createdSecondaryOwner.body.id}`, { cookie }),
      store
    );
    expect(crossGet.status).toBe(404);
  });
});
