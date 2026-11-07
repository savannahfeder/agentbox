// THE PHONE APP DOTS UNREAD THREADS AND SAYS QUEUED (w-9f9c2570e2, 2026-10-27).
//
// Found by reading the web app against the phone app line by line: the web
// app's rows carry an unread dot (renderer/src/unread.ts) and, for a reply or
// a new thread the computer has not taken yet, the word Queued (f8e31e68). The
// phone app's rows had neither: lib/tabs.ts dropped `view.queued`, and nothing
// on the phone remembered which threads had been opened. These pin both rules
// on the phone's own lists.
import { describe, it, expect } from 'vitest';
import { phoneView, phoneSlug } from '../renderer/src/phone-rows';
import { madeHere } from '../shared/phone-snapshot.mjs';
import { phoneTabs } from '../mobile/src/lib/tabs';
import { isUnread, markSeen, readSeen, SEEN_AT_KEY, UNREAD_SINCE_KEY } from '../mobile/src/lib/unread';

const NOW = Date.parse('2026-10-27T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const DEV = 'a1b2c3d4e5f6';
const A = phoneSlug(DEV, 'alpha');
const NEW_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const thread = (item, extra = {}) => ({ device: DEV, project: 'alpha', item, snapshot: { v: 2, item: { id: item, title: `T ${item}`, status: 'blocked', updatedAt: NOW - 1e5, ...extra }, history: [] } });
const cmd = (id, kind, extra = {}) => ({ id, device: DEV, project: 'alpha', item: 'w-1', kind, payload: {}, created_at: iso(NOW - 1000), taken_at: null, outcome: null, ...extra });
const rows = (commands = []) => ({ projects: [{ device: DEV, project: 'alpha', name: 'Alpha' }], threads: [thread('w-1'), thread('w-2')], commands });
const allRows = (tabs) => Object.values(tabs).flat();

function memory() {
  const kept = new Map();
  return { kept, getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => { kept.set(k, String(v)); } };
}

describe('Queued on a row', () => {
  it('a reply the computer has not taken reads Queued, and its neighbour does not', () => {
    const v = phoneView(rows([cmd('c1', 'reply', { payload: { text: 'Yes' } })]), NOW);
    const shown = allRows(phoneTabs(v, NOW));
    expect(shown.find((r) => r.id === 'w-1').queued).toBe(true);
    expect(shown.find((r) => r.id === 'w-2').queued).toBe(false);
  });

  it('a new thread from the phone reads Queued until the computer takes it', () => {
    const v = phoneView(rows([cmd(NEW_ID, 'new', { item: null, payload: { title: 'Ship it', body: 'today' } })]), NOW);
    expect(allRows(phoneTabs(v, NOW)).find((r) => r.id === madeHere(NEW_ID)).queued).toBe(true);
  });

  it('is not Queued once taken, or when the cloud has it', () => {
    for (const extra of [{ taken_at: iso(NOW), outcome: 'done' }, { claimed_at: iso(NOW), claimed_by: 'cloud:run-1' }]) {
      const v = phoneView(rows([cmd('c1', 'reply', { payload: { text: 'Yes' }, ...extra })]), NOW);
      expect(allRows(phoneTabs(v, NOW)).find((r) => r.id === 'w-1').queued).toBe(false);
    }
  });

  it('the inbox draws the word', async () => {
    const fs = await import('node:fs');
    expect(fs.readFileSync('mobile/src/app/index.tsx', 'utf8')).toMatch(/row\.queued && <>.*Queued/);
  });
});

describe('the unread dot', () => {
  const item = (extra = {}) => ({ product: A, id: 'w-1', createdAt: NOW - 3e6, ...extra });

  it('counts what was already there on first launch as read', () => {
    const store = memory();
    const seen = readSeen(store, NOW);
    expect(store.getItem(UNREAD_SINCE_KEY)).toBe(String(NOW));
    expect(isUnread(item({ wrote: { result: { ts: NOW - 1000 } } }), seen)).toBe(false);
    expect(isUnread(item({ wrote: { result: { ts: NOW + 1000 } } }), seen)).toBe(true);
  });

  it('opening a thread reads it, and a newer answer dots it again', () => {
    const store = memory();
    let seen = readSeen(store, NOW - 1e6);
    const answered = item({ wrote: { result: { ts: NOW - 5000 } } });
    expect(isUnread(answered, seen)).toBe(true);
    seen = markSeen(seen, answered, store, NOW);
    expect(isUnread(answered, seen)).toBe(false);
    expect(isUnread(item({ wrote: { result: { ts: NOW + 1 } } }), seen)).toBe(true);
    expect(JSON.parse(store.getItem(SEEN_AT_KEY))[`${A}/w-1`]).toBe(NOW);
  });

  it('opening w-1 on one computer leaves w-1 on another unread', () => {
    const store = memory();
    let seen = readSeen(store, NOW - 1e6);
    const other = { product: phoneSlug('ffffffffffff', 'alpha'), id: 'w-1', createdAt: NOW - 3e6, wrote: { result: { ts: NOW - 5000 } } };
    seen = markSeen(seen, item({ wrote: { result: { ts: NOW - 5000 } } }), store, NOW);
    expect(isUnread(other, seen)).toBe(true);
  });

  it('survives a relaunch, and a broken file reads as nothing opened', () => {
    const store = memory();
    markSeen(readSeen(store, NOW - 1e6), item(), store, NOW);
    expect(readSeen(store, NOW + 1e6).at[`${A}/w-1`]).toBe(NOW);
    store.setItem(SEEN_AT_KEY, '{not json');
    expect(readSeen(store, NOW).at).toEqual({});
  });

  it('the thread marks itself read, and the row draws the dot', async () => {
    const fs = await import('node:fs');
    expect(fs.readFileSync('mobile/src/app/thread/[product]/[id].tsx', 'utf8')).toMatch(/c\.markSeen\(thread\.item\)/);
    expect(fs.readFileSync('mobile/src/app/index.tsx', 'utf8')).toMatch(/unread=\{c\.unread\(item\.item\)\}/);
  });
});
