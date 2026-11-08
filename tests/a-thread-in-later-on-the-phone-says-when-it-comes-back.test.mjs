// A THREAD IN LATER ON THE PHONE SAYS WHEN IT COMES BACK, NOT QUEUED.
//
// The 2026-11-06 phone workday (issue 26): a new thread sent for Monday 8:00am
// sat in Later reading "Queued · just now", the same as one about to start;
// Mon 8:00am was only on the toast. The desktop's Later rows show the time a
// thread comes back (page-rules.ts `backWords`) and keep the words about
// waiting a turn to In progress (Pages.tsx); the phone row used when it was
// sent and the Queued it gives anything the computer has not taken.
import { describe, it, expect } from 'vitest';
import { phoneView, phoneSlug } from '../renderer/src/phone-rows';
import { madeHere } from '../shared/phone-snapshot.mjs';
import { phoneTabs } from '../mobile/src/lib/tabs';
import { backWords } from '../renderer/src/threads/page-rules';

const NOW = Date.parse('2026-11-06T18:00:00Z');
const MONDAY = Date.parse('2026-11-09T16:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const DEV = 'a1b2c3d4e5f6';
const NEW_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const thread = (item, extra = {}) => ({ device: DEV, project: 'alpha', item, snapshot: { v: 2, item: { id: item, title: `T ${item}`, status: 'open', updatedAt: NOW - 1e5, ...extra }, history: [] } });
const sent = (payload) => ({ id: NEW_ID, device: DEV, project: 'alpha', item: null, kind: 'new', payload, created_at: iso(NOW - 1000), taken_at: null, outcome: null });
const tabsOf = (threads, commands = []) => phoneTabs(phoneView({ projects: [{ device: DEV, project: 'alpha', name: 'Alpha' }], threads, commands }, NOW), NOW);
const find = (tabs, id) => Object.entries(tabs).flatMap(([tab, rows]) => rows.map((r) => ({ ...r, tab }))).find((r) => r.id === id);

describe('a thread sent from the phone for later', () => {
  it('is in Later, says when it runs, and is not Queued', () => {
    const row = find(tabsOf([], [sent({ title: 'Write the weekly notes', body: '', runAt: MONDAY })]), madeHere(NEW_ID));
    expect(row.tab).toBe('snoozed');
    expect(row.when).toBe(backWords({ runAt: MONDAY, wrote: { runAt: { ts: NOW, source: 'founder' } } }, NOW));
    expect(row.when).not.toBe('just now');
    expect(row.queued).toBe(false);
  });
  it('sent to start now, still reads Queued until the computer takes it', () => {
    const row = find(tabsOf([], [sent({ title: 'Ship it', body: '' })]), madeHere(NEW_ID));
    expect(row.tab).not.toBe('snoozed');
    expect(row.queued).toBe(true);
  });
});

describe('a thread put in Later', () => {
  it('says when it comes back', () => {
    const until = NOW + 3 * 3600_000;
    const row = find(tabsOf([thread('w-1', { snoozedUntil: until, wrote: { snoozedUntil: { ts: NOW - 1e5, source: 'founder' } } })]), 'w-1');
    expect(row.tab).toBe('snoozed');
    expect(row.when).toBe(backWords({ snoozedUntil: until, wrote: { snoozedUntil: { ts: NOW - 1e5, source: 'founder' } } }, NOW));
  });
  it('added to Later with no time keeps how long ago it was sent', () => {
    const row = find(tabsOf([thread('w-1', { start: 'later', createdAt: NOW - 3600_000 })]), 'w-1');
    expect(row.tab).toBe('snoozed');
    expect(row.when).toMatch(/ago|h$|m$/);
  });
});
