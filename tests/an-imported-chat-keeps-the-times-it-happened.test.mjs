// AN IMPORTED CHAT KEEPS THE TIMES IT HAPPENED.
//
// Every row the import made was stamped with the moment of the import, so
// both power testers (w-62228098e6) brought in fourteen chats and read
// "just now" on every one, the Oct 15 chat included, in an order that had
// nothing to do with when they had them; inside a thread their first message
// said "Today 3:45am", the minute they pressed the button.
//
// A row made for a chat now carries the chat's own times: made and asked when
// the chat started, answered and filed when it last moved. A Codex chat that
// already had a row (asked about, or turned down) is written at the moment of
// import, because the ledger keeps the newest line of each field and an older
// one would lose to what the row already says.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';

const NOW = Date.UTC(2026, 9, 24, 4, 0, 0);
const HOUR = 3600e3;

async function world() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-import-times-'));
  const accountRoot = path.join(root, 'accounts', 'test-account');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot: root, accountId: 'test-account', accountRoot, products: [] }).init();
  const folder = path.join(root, 'kestrel');
  const { slug } = store.createProduct({ name: 'Kestrel', repoPath: folder });
  return { store, slug, folder };
}

const claude = (id, over = {}) => ({
  id, source: 'terminal', folder: '/k', title: `Chat ${id}`, firstSaid: `do ${id}`, lastSaid: 'Done. Tests pass.',
  waiting: false, startedAt: NOW - 9 * 24 * HOUR, when: NOW - 9 * 24 * HOUR + HOUR, ...over,
});
const codex = (id, over = {}) => ({ ...claude(id), source: 'codex', prompt: `do ${id}`, last: 'Done.', ...over });
const row = (store, label) => store.listItems().find((i) => i.labels.includes(label));

describe('a Claude Code chat brought in', () => {
  it('is made when the chat started and answered when it last moved', async () => {
    const w = await world();
    w.store.importThreadRows(w.slug, [claude('a')], { now: NOW, land: 'sorted' });
    const r = row(w.store, 'thread:a');
    expect(r.createdAt).toBe(NOW - 9 * 24 * HOUR);
    expect(r.wrote.body.ts).toBe(NOW - 9 * 24 * HOUR);
    expect(r.wrote.result.ts).toBeGreaterThanOrEqual(NOW - 9 * 24 * HOUR + HOUR);
    expect(r.wrote.result.ts).toBeLessThan(NOW - 9 * 24 * HOUR + HOUR + 1000);
    expect(r.status).toBe('done');
    expect(r.wrote.status.ts).toBeGreaterThan(r.wrote.result.ts);
    expect(r.wrote.status.ts).toBeLessThan(NOW);
  });

  it('keeps the order the chats happened in, whatever order they were picked in', async () => {
    const w = await world();
    w.store.importThreadRows(w.slug, [
      claude('older', { startedAt: NOW - 30 * HOUR, when: NOW - 29 * HOUR, waiting: true }),
      claude('newer', { startedAt: NOW - 2 * HOUR, when: NOW - HOUR, waiting: true }),
    ], { now: NOW, land: 'sorted' });
    expect(row(w.store, 'thread:newer').updatedAt).toBeGreaterThan(row(w.store, 'thread:older').updatedAt);
  });

  it('falls back to the moment of import for a chat with no times, or times ahead of the clock', async () => {
    const w = await world();
    w.store.importThreadRows(w.slug, [
      claude('none', { startedAt: undefined, when: undefined }),
      claude('ahead', { startedAt: NOW + HOUR, when: NOW + 2 * HOUR }),
    ], { now: NOW });
    expect(row(w.store, 'thread:none').createdAt).toBeLessThanOrEqual(NOW);
    expect(row(w.store, 'thread:none').createdAt).toBeGreaterThan(NOW - 60e3);
    expect(row(w.store, 'thread:ahead').createdAt).toBeLessThanOrEqual(NOW);
  });

  it('starts a chat that started before its first line was read, at its last move', async () => {
    const w = await world();
    w.store.importThreadRows(w.slug, [claude('nostart', { startedAt: 0, when: NOW - HOUR })], { now: NOW });
    expect(row(w.store, 'thread:nostart').createdAt).toBe(NOW - HOUR);
  });
});

describe('a Codex chat brought in', () => {
  it('is made when the chat started and answered when it last moved', async () => {
    const w = await world();
    w.store.importCodexThreads(w.slug, [codex('c', { folder: w.folder })], { now: NOW, land: 'sorted' });
    const r = row(w.store, 'codex:c');
    expect(r.createdAt).toBe(NOW - 9 * 24 * HOUR);
    expect(r.wrote.result.ts).toBeGreaterThanOrEqual(NOW - 9 * 24 * HOUR + HOUR);
    expect(r.wrote.result.ts).toBeLessThan(NOW);
    expect(r.status).toBe('done');
    expect(r.body).toBe('do c');
  });

  it('is written at the moment of import over a row it already had, so the import wins', async () => {
    const w = await world();
    w.store.importCodexThreads(w.slug, [codex('d', { folder: w.folder })], { now: NOW - 60e3 });
    const id = row(w.store, 'codex:d').id;
    w.store.modules.workItemsDisk.updateWorkItem(w.store.productDir(w.slug), id, { status: 'done' }, { source: 'founder', now: NOW - 30e3 });
    w.store.importCodexThreads(w.slug, [codex('d', { folder: w.folder, waiting: true })], { now: NOW });
    expect(row(w.store, 'codex:d').status).toBe('open');
  });
});
