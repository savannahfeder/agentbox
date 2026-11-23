// The phone pass fingerprints a thread once while it does not change.
//
// 2026-11-23: the app's CPU record put 4% of the main thread's busy time in
// one line of the phone inbox's pass, with no agent running as with seven.
// To skip building the copies of threads that did not change, each pass wrote
// every carried thread's row and lines out as text and hashed them, which is
// most of the cost it was there to avoid. A row is the same frozen object
// until its thread changes, and a thread's lines are only ever added to, so
// the same row with the same first and last line is the same thread.
import { afterEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { inputsOf } from '../main/phone-inbox.mts';

const row = (over: Record<string, unknown> = {}) => Object.freeze({ id: 'w-0123456789', title: 'Checkout is slow', status: 'open', updatedAt: 1_790_000_000_000, ...over });
const line = (n: number) => ({ id: 'w-0123456789', ts: 1_790_000_000_000 + n, patch: { note: `step ${n}` } });
// How many times a text was hashed while `fn` ran.
const hashed = (fn: () => void) => {
  const spy = vi.spyOn(crypto, 'createHash');
  try { fn(); return spy.mock.calls.length; } finally { spy.mockRestore(); }
};
afterEach(() => vi.restoreAllMocks());

describe('a thread that did not change', () => {
  it('is fingerprinted once, however many passes ask', () => {
    const item = row();
    const lines = [line(1), line(2), line(3)];
    const first = inputsOf(item, lines.slice());
    let again = '';
    // Each pass is handed a new list of the same lines.
    expect(hashed(() => { for (let pass = 0; pass < 50; pass += 1) again = inputsOf(item, lines.slice()); })).toBe(0);
    expect(again).toBe(first);
  });

  it('is the same fingerprint the text of its row and lines always gave', () => {
    const item = row();
    const lines = [line(1), line(2)];
    const asText = crypto.createHash('sha1').update(JSON.stringify(item)).update('\0').update(JSON.stringify(lines)).digest('base64');
    expect(inputsOf(item, lines)).toBe(asText);
    expect(inputsOf(item, lines.slice())).toBe(asText);
  });
});

describe('a thread that changed', () => {
  it('is fingerprinted again when a line is added, and differs', () => {
    const item = row();
    const lines = [line(1), line(2)];
    const before = inputsOf(item, lines.slice());
    lines.push(line(3));
    let after = '';
    expect(hashed(() => { after = inputsOf(item, lines.slice()); })).toBe(1);
    expect(after).not.toBe(before);
  });

  it('is fingerprinted again when its row is made again, and differs when the row does', () => {
    const lines = [line(1), line(2)];
    const before = inputsOf(row(), lines.slice());
    expect(inputsOf(row({ title: 'Checkout takes nine seconds' }), lines.slice())).not.toBe(before);
    expect(inputsOf(row(), lines.slice())).toBe(before);
  });

  it('is fingerprinted again when its window of lines moves on by one, at the same length', () => {
    const item = row();
    const all = Array.from({ length: 401 }, (_, n) => line(n));
    const before = inputsOf(item, all.slice(0, 400));
    expect(inputsOf(item, all.slice(1, 401))).not.toBe(before);
  });

  it('is fingerprinted again when its lines were read afresh, and is the same for the same words', () => {
    const item = row();
    const before = inputsOf(item, [line(1), line(2)]);
    let after = '';
    expect(hashed(() => { after = inputsOf(item, [line(1), line(2)]); })).toBe(1);
    expect(after).toBe(before);
  });
});

describe('a row that may still be written to', () => {
  it('is fingerprinted every time, so a change made in place is never missed', () => {
    const item = { id: 'w-0123456789', title: 'Checkout is slow', pinned: true };
    const lines = [line(1)];
    const before = inputsOf(item, lines);
    item.title = 'Checkout takes nine seconds';
    expect(inputsOf(item, lines)).not.toBe(before);
  });
});
