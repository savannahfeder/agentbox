// A THREAD YOU ASKED ABOUT WAITS IN IN PROGRESS, NOT LATER (2026-11-20).
//
// Two testers on the rerun: asking for help or a review moved their thread
// to Later. "Later only has what I put off; my thread stays in In progress."
// And Later on every member's copy held a nameless "WAITS ON SAM / PAYMENTS
// API" row: Theo's own thread in the project he shares, whose wait reaches
// every member's ledger without its title (read off Sam's and Lena's
// ledgers). A thread you asked someone about is now In progress, saying
// whom it waits on, and a teammate's row in a shared project is never in
// your Later. Measured on the list rules and the window's Later list.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { askedPatch } from '../shared/thread-ask.mts';
import { belongsInInbox, belongsInProgress, waitsInLater } from '../renderer/src/list-rules.ts';

const at = 1_000_000;
const asked = (o = {}) => ({
  id: 'w-1', status: 'blocked', labels: ['founder'], title: 'Idempotency', result: 'Where?',
  ...askedPatch(['p-theo'], 'Asked Theo for help with this step', at, 'help'),
  wrote: { result: { source: 'agent', ts: at - 10 }, blockedBy: { source: 'founder', ts: at }, asked: { source: 'founder', ts: at } }, ...o,
});

describe('a thread you asked a teammate about', () => {
  it('is In progress, not Later or Needs you', () => {
    expect(waitsInLater(asked(), [])).toBe(false);
    expect(belongsInProgress(asked(), { now: at + 1 })).toBe(true);
    expect(belongsInInbox(asked(), { now: at + 1 })).toBe(false);
  });
  it('comes to Needs you when they comment', () => {
    expect(belongsInInbox(asked({ waitingComments: [{ by: 'p-theo', ts: at + 5, text: 'Postgres' }] }), { now: at + 6 })).toBe(true);
  });
  it('a plain wait you set still goes to Later', () => {
    const plain = asked({ asked: undefined, wrote: { result: { source: 'agent', ts: at - 10 }, blockedBy: { source: 'founder', ts: at } } });
    expect(waitsInLater(plain, [])).toBe(true);
    expect(belongsInProgress(plain, { now: at + 1 })).toBe(false);
  });
  it('is In progress no longer once the wait ends', () => {
    expect(belongsInProgress(asked({ blockedBy: [] }), { now: at + 1 })).toBe(false);
  });
});

describe('Later on a member\'s copy', () => {
  it('leaves out a teammate\'s rows in a project they share', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    const later = app.slice(app.indexOf('const snoozed = useMemo(() => ['), app.indexOf('// Repeating tasks. They are RULES'));
    expect(later).toContain('&& teamProgress(i)');
  });
});
