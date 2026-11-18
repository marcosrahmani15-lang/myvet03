import { beforeEach, describe, expect, it } from 'vitest';
import { dispatchApiRequest } from '../server/core/router.ts';
import type { HttpRequest } from '../server/core/http.ts';
import { MemoryClinicStore } from '../server/store/memoryStore.ts';

function req(method: string, path: string, body?: any, query: Record<string, string> = {}): HttpRequest {
  return {
    method,
    url: path,
    path,
    query,
    headers: {},
    body: body ?? {},
    ip: '127.0.0.1',
  };
}

describe('Clinical, Inventory, Hospitalization & DZD Finance Flows', () => {
  let store: MemoryClinicStore;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.AUTO_DEV_LOGIN;
    store = new MemoryClinicStore();
  });

  it('archives owners/animals with medical/financial history instead of deleting, while deleting fresh ones', async () => {
    // Existing animal with history -> archive
    const archiveRes = await dispatchApiRequest(req('DELETE', '/api/animals/nina'), store);
    expect(archiveRes.status).toBe(200);
    expect(archiveRes.body.action).toBe('archived');

    // Fresh owner -> hard delete
    const freshOwner = await dispatchApiRequest(
      req('POST', '/api/owners', { name: 'Temporary Client', phone: '0551 11 22 33' }),
      store
    );
    expect(freshOwner.status).toBe(201);
    const delOwner = await dispatchApiRequest(
      req('DELETE', `/api/owners/${freshOwner.body.id}`),
      store
    );
    expect(delOwner.status).toBe(200);
    expect(delOwner.body.action).toBe('deleted');
  });

  it('supports medical records CRUD (note, document, reminder toggle, document delete)', async () => {
    const docRes = await dispatchApiRequest(
      req('POST', '/api/medical-records', {
        animalId: 'rocky',
        recordType: 'document',
        title: 'Radio patte arrière.pdf',
        payload: { name: 'Radio patte arrière.pdf', type: 'Imagerie', size: '1.2 Mo', date: '14/08/2026' },
      }),
      store
    );
    expect(docRes.status).toBe(201);

    const remRes = await dispatchApiRequest(
      req('POST', '/api/medical-records', {
        animalId: 'rocky',
        recordType: 'reminder',
        payload: { title: 'Retrait points', dueDate: '2026-08-22', priority: 'Haute', completed: false },
      }),
      store
    );
    expect(remRes.status).toBe(201);

    const toggleRes = await dispatchApiRequest(
      req('PATCH', `/api/medical-records/${remRes.body.id}/toggle`),
      store
    );
    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body.completed).toBe(true);

    const delDoc = await dispatchApiRequest(
      req('DELETE', `/api/medical-records/${docRes.body.id}`),
      store
    );
    expect(delDoc.status).toBe(200);
  });

  it('creates DZD invoices, records payment, updates cash closing totals, and closes day with exact variance', async () => {
    const invRes = await dispatchApiRequest(
      req('POST', '/api/invoices', {
        ownerId: 'c1',
        clientName: 'Fatima Mansouri',
        animalId: 'nina',
        patientName: 'Nina',
        issueDate: '2026-08-20',
        amountDzd: 4500,
        status: 'En attente',
        paymentMethod: 'Espèces',
        items: [{ description: 'Consultation + Bilan', quantity: 1, unitPriceDzd: 4500 }],
      }),
      store
    );
    expect(invRes.status).toBe(201);
    expect(invRes.body.currency).toBe('DZD');
    expect(invRes.body.amountDzd).toBe(4500);

    // Pay invoice -> creates payment record for 2026-08-20
    const payRes = await dispatchApiRequest(
      req('PATCH', `/api/invoices/${invRes.body.id}`, {
        status: 'Payée',
        paymentMethod: 'Espèces',
      }),
      store
    );
    expect(payRes.status).toBe(200);
    expect(payRes.body.status).toBe('Payée');

    const todayIso = new Date().toISOString().slice(0, 10);

    // Check cash closing summary before close on today's collection date
    const summaryRes = await dispatchApiRequest(
      req('GET', '/api/cash-closings', undefined, { date: todayIso }),
      store
    );
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.currency).toBe('DZD');
    expect(summaryRes.body.cashDzd).toBeGreaterThanOrEqual(4500);
    expect(summaryRes.body.totalDzd).toBeGreaterThanOrEqual(4500);

    const expectedTotal = summaryRes.body.expectedDzd;

    // Close cash day with expected - 200 DZD counted -> variance -200 DZD
    const closeRes = await dispatchApiRequest(
      req('POST', '/api/cash-closings', {
        closingDate: todayIso,
        countedCashDzd: Math.max(0, summaryRes.body.cashDzd - 200),
        countedCbDzd: summaryRes.body.cbDzd,
        countedCheckTransferDzd: summaryRes.body.checkTransferDzd,
        notes: 'Écart test 200 DZD',
      }),
      store
    );
    expect(closeRes.status).toBe(201);
    expect(closeRes.body.expectedDzd).toBe(expectedTotal);
    expect(closeRes.body.varianceDzd).toBe(-200);

    // Second closing for same date rejected
    const duplicateClose = await dispatchApiRequest(
      req('POST', '/api/cash-closings', {
        closingDate: todayIso,
        countedCashDzd: 4500,
      }),
      store
    );
    expect(duplicateClose.status).toBe(400);
  });

  it('adjusts inventory stocks, records movement ledger, and updates critical status automatically', async () => {
    const stockRes = await dispatchApiRequest(
      req('POST', '/api/inventory', {
        name: 'Seringues 5ml',
        category: 'Matériel',
        supplier: 'MedVet Alger',
        quantity: 20,
        minThreshold: 10,
        unit: 'boîtes',
        unitPriceDzd: 650,
      }),
      store
    );
    expect(stockRes.status).toBe(201);
    expect(stockRes.body.status).toBe('Normal');

    const adjRes = await dispatchApiRequest(
      req('PATCH', `/api/inventory/${stockRes.body.id}`, {
        delta: -15,
        reason: 'Consommation hebdomadaire',
      }),
      store
    );
    expect(adjRes.status).toBe(200);
    expect(adjRes.body.quantity).toBe(5);
    expect(adjRes.body.status).toBe('Critique');

    const movRes = await dispatchApiRequest(
      req('GET', '/api/inventory/movements', undefined, { itemId: stockRes.body.id }),
      store
    );
    expect(movRes.status).toBe(200);
    expect(movRes.body.length).toBeGreaterThanOrEqual(2);
  });

  it('admits, adds care log, and discharges hospitalization box', async () => {
    const admitRes = await dispatchApiRequest(
      req('POST', '/api/hospitalizations', {
        boxCode: 'Box 09',
        animalId: 'felix',
        patientName: 'Félix',
        species: 'Chat',
        breed: 'Siamois',
        ownerId: 'c3',
        ownerName: 'Samira Lambert',
        reason: 'Observation post-anesthésie',
        veterinarian: 'Dr. Vétérinaire',
        status: 'Stable',
      }),
      store
    );
    expect(admitRes.status).toBe(201);

    const careRes = await dispatchApiRequest(
      req('PATCH', `/api/hospitalizations/${admitRes.body.id}`, {
        careNote: 'Perfusion NaCl 0.9% vérifiée',
      }),
      store
    );
    expect(careRes.status).toBe(200);
    expect(careRes.body.careLogs.length).toBeGreaterThanOrEqual(1);
    expect(careRes.body.careLogs[0].note).toBe('Perfusion NaCl 0.9% vérifiée');

    const dischargeRes = await dispatchApiRequest(
      req('PATCH', `/api/hospitalizations/${admitRes.body.id}`, {
        discharge: true,
        status: 'Sorti',
      }),
      store
    );
    expect(dischargeRes.status).toBe(200);
    expect(dischargeRes.body.status).toBe('Disponible');
  });
});
