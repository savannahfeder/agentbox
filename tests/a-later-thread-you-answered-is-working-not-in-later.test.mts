// A LATER THREAD YOU ANSWERED IS WORKING, NOT IN LATER.
//
// On 2026-11-16 a power tester on the browser copy, every thread in the cloud,
// put a thread in Later until tomorrow 8:00am, opened it from the board's
// Later column and picked option 1. The cloud claimed it and the agent ran,
// but the thread showed "Thinking just now" over "Back to inbox · In Later
// until tomorrow 8:00am". Measured in the copy's ledger: snoozedUntil written
// by the person at 19:51, the pick written as an answer 11 minutes later, and
// no write lifting the Later after it. A typed reply lifts Later with its own
// write; a pick never did, and the window read snoozedUntil whatever was said
// after it (list-rules hiddenUntil).
import { describe, it, expect } from 'vitest';
import { foldWorkItems } from '../shared/work-items.mts';
import { deferredUntil, hiddenUntil } from '../renderer/src/list-rules.ts';

const MIN = 60_000;
const putAway = 1_794_800_668_190;
const tomorrow8 = 1_794_844_800_000;
const picked = putAway + 11 * MIN;
const now = picked + 30_000;

const base = [
  { id: 'w-1', ts: putAway - 10 * MIN, source: 'founder', patch: { title: 'Make onboarding next step obvious', status: 'open', kind: 'directive', labels: ['founder'] } },
  { id: 'w-1', ts: putAway - MIN, source: 'agent', patch: { result: '**Pick a button: A or B?**\n\n1. Go with A (recommended)\n2. Go with B' } },
  { id: 'w-1', ts: putAway, source: 'founder', patch: { snoozedUntil: tomorrow8 } },
];
const thread = (...more: object[]) => foldWorkItems([...base, ...more], now).get('w-1')!;
// What the thread header and the board read (App.tsx returnAt).
const laterUntil = (i: ReturnType<typeof thread>) => Math.max(deferredUntil(i), hiddenUntil(i));

describe('a Later thread you answered is working, not in Later', () => {
  it('a pick after putting it in Later lifts Later, as the cloud claims it', () => {
    const i = thread(
      { id: 'w-1', ts: picked, source: 'founder', patch: { answer: 'Option 1: Go with A (recommended)' } },
      { id: 'w-1', ts: picked + 18_000, source: 'agent', epoch: 3, claim: { holder: 'mcp-cloud-x', leaseUntil: picked + 5 * MIN }, patch: { status: 'claimed' } },
    );
    expect(i.status).toBe('claimed');
    expect(laterUntil(i)).toBe(0);
  });

  it('a follow-up sent while it works keeps it out of Later too', () => {
    const i = thread(
      { id: 'w-1', ts: picked, source: 'founder', patch: { answer: 'Option 1: Go with A (recommended)' } },
      { id: 'w-1', ts: picked + 26_000, source: 'founder', patch: { answer: 'Update the ticket to use A only.' } },
    );
    expect(laterUntil(i)).toBe(0);
  });

  it('a Later thread nobody answered still says Later', () => {
    expect(laterUntil(thread())).toBe(tomorrow8);
  });

  it('a reply sent before putting it in Later leaves it in Later', () => {
    const i = foldWorkItems([
      ...base.slice(0, 2),
      { id: 'w-1', ts: putAway - 30_000, source: 'founder', patch: { answer: 'Go with A' } },
      base[2],
    ], now).get('w-1')!;
    expect(laterUntil(i)).toBe(tomorrow8);
  });

  it('a pick taken back puts it back in Later', () => {
    const i = thread(
      { id: 'w-1', ts: picked, source: 'founder', patch: { answer: 'Option 1: Go with A (recommended)' } },
      { id: 'w-1', ts: picked + 5_000, source: 'founder', patch: { answer: '(withdrawn)', status: 'open' } },
    );
    expect(laterUntil(i)).toBe(tomorrow8);
  });

  it('a Later the agent wrote never hid the thread, answered or not', () => {
    const i = foldWorkItems([base[0], base[1], { ...base[2], source: 'agent' }], now).get('w-1')!;
    expect(hiddenUntil(i)).toBe(0);
  });
});
