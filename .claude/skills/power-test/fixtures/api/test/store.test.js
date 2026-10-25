import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { book, list, cancel, reset } from '../src/store.js';

beforeEach(reset);

test('books an appointment', () => {
  const a = book({ who: 'Ada', start: '2026-11-02T09:00', end: '2026-11-02T09:30' });
  assert.equal(a.id, 1);
  assert.equal(list().length, 1);
});

test('refuses the same start time twice', () => {
  book({ who: 'Ada', start: '2026-11-02T09:00', end: '2026-11-02T09:30' });
  assert.throws(() => book({ who: 'Bo', start: '2026-11-02T09:00', end: '2026-11-02T09:15' }));
});

test('refuses an appointment that overlaps another', () => {
  book({ who: 'Ada', start: '2026-11-02T09:00', end: '2026-11-02T10:00' });
  assert.throws(() => book({ who: 'Bo', start: '2026-11-02T09:30', end: '2026-11-02T10:30' }));
});

test('cancels an appointment', () => {
  const a = book({ who: 'Ada', start: '2026-11-02T09:00', end: '2026-11-02T09:30' });
  assert.equal(cancel(a.id), true);
  assert.equal(list().length, 0);
});
