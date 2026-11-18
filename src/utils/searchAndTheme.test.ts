import { test, describe } from 'node:test';
import assert from 'node:assert';
import { INITIAL_PATIENTS, INITIAL_CLIENTS } from '../data/demoData';

describe('Global Search Matching Logic', () => {
  test('matches patients by exact name and case-insensitive name', () => {
    const query = 'nina';
    const matches = INITIAL_PATIENTS.filter(p =>
      p.name.toLowerCase().includes(query) || p.id.toLowerCase().includes(query)
    );
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].name, 'Nina');
    assert.strictEqual(matches[0].id, 'nina');
  });

  test('matches patients by ID', () => {
    const query = 'rocky';
    const matches = INITIAL_PATIENTS.filter(p =>
      p.id.toLowerCase().includes(query) || p.name.toLowerCase().includes(query)
    );
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].id, 'rocky');
  });

  test('matches patients by microchip number', () => {
    const query = '250269608123456';
    const matches = INITIAL_PATIENTS.filter(p =>
      p.microchip.toLowerCase().includes(query)
    );
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].name, 'Rocky');
  });

  test('matches clients by ID and name', () => {
    const queryId = 'c1';
    const matchesById = INITIAL_CLIENTS.filter(c =>
      c.id.toLowerCase().includes(queryId) || c.name.toLowerCase().includes(queryId)
    );
    assert.strictEqual(matchesById.length >= 1, true);
    assert.strictEqual(matchesById[0].name, 'Fatima Fatima');

    const queryName = 'dubois';
    const matchesByName = INITIAL_CLIENTS.filter(c =>
      c.name.toLowerCase().includes(queryName)
    );
    assert.strictEqual(matchesByName.length, 1);
    assert.strictEqual(matchesByName[0].id, 'c2');
  });

  test('matches clients by phone number', () => {
    const queryPhone = '0555555555';
    const matches = INITIAL_CLIENTS.filter(c =>
      c.phone.includes(queryPhone)
    );
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].id, 'c1');
  });
});
