// 2026-11-16: the phone app dotted threads as unread that had been read on the
// desktop. The phone kept its own list of what it had opened
// (mobile/src/lib/unread.ts) and told the desktop when it opened one, but the
// desktop never told the phone: its read list lives in the window's
// localStorage and nothing sent it anywhere. So every thread read at the desk
// was still unread on the phone. Measured by checking each hop: the window's
// list never reached main, the settings copy, or the phone.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { phoneSettingsOf, phoneSeenOf, SEEN_SENT } from '../shared/phone-settings.mts';
import { phoneSlug } from '../renderer/src/phone-rows';
import { isUnread, readSeen, seenOnComputers } from '../mobile/src/lib/unread';

const NOW = Date.parse('2026-11-16T03:00:00Z');
const DEV = 'a1b2c3d4e5f6';
const OTHER = 'ffffffffffff';
const A = phoneSlug(DEV, 'alpha');
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

function memory() {
  const kept = new Map<string, string>();
  return { kept, getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => { kept.set(k, String(v)); } };
}
const answered = (id: string, at: number) => ({ product: A, id, createdAt: NOW - 86_400_000, wrote: { result: { ts: at, source: 'agent' } } });
const row = (device: string, seen: Record<string, number>) => ({ device, settings: { seen } });

describe('the desktop says what it has read', () => {
  it('the settings copy carries it, newest first and no more than it sends', () => {
    const many = Object.fromEntries(Array.from({ length: SEEN_SENT + 20 }, (_, n) => [`w-${n}`, NOW - n]));
    const copy = phoneSettingsOf({ ok: true, workspace: {}, seen: many }, { version: '1' }) as { seen: Record<string, number> };
    expect(Object.keys(copy.seen)).toHaveLength(SEEN_SENT);
    expect(copy.seen['w-0']).toBe(NOW);
    expect(copy.seen[`w-${SEEN_SENT}`]).toBeUndefined();
  });

  it('only thread ids and real moments go: Mark Unread\'s 0 and anything else stay home', () => {
    expect(phoneSeenOf({ 'w-1': NOW, 'w-2': 0, '../x': NOW, 'w-3': Number.NaN, 'w-4': 'soon' })).toEqual({ 'w-1': NOW });
    expect(phoneSeenOf(null)).toEqual({});
  });

  it('a copy from a desktop that says nothing has no list at all', () => {
    expect(phoneSettingsOf({ ok: true, workspace: {} }, { version: '1' })).not.toHaveProperty('seen');
  });

  it('the window sends its list to main, and main puts it in the copy', () => {
    expect(read('renderer/src/App.tsx')).toMatch(/api\.seenHere\(/);
    expect(read('main/ipc.mts')).toMatch(/'zero:seen-here'/);
    expect(read('main/main.mts')).toMatch(/seen: ipc\.seenForPhone\(\)/);
    expect(read('shared/bridge-map.mts')).toMatch(/seenHere: 'zero:seen-here'/);
  });
});

describe('the phone takes it', () => {
  it('a thread opened on the desktop after its answer is read on the phone', () => {
    const store = memory();
    const seen = readSeen(store, NOW - 86_400_000 * 2);
    const item = answered('w-1', NOW - 60_000);
    expect(isUnread(item, seen)).toBe(true);
    const after = seenOnComputers(seen, [row(DEV, { 'w-1': NOW - 30_000 })], [item], store);
    expect(isUnread(item, after)).toBe(false);
    expect(readSeen(store).at[`${A}/w-1`]).toBe(NOW - 30_000);
  });

  it('opened on the desktop before the answer came, it is still unread', () => {
    const store = memory();
    const seen = readSeen(store, NOW - 86_400_000 * 2);
    const item = answered('w-1', NOW - 60_000);
    expect(isUnread(item, seenOnComputers(seen, [row(DEV, { 'w-1': NOW - 120_000 })], [item], store))).toBe(true);
  });

  it('another computer\'s thread with the same id is not marked', () => {
    const store = memory();
    const seen = readSeen(store, NOW - 86_400_000 * 2);
    const item = answered('w-1', NOW - 60_000);
    expect(isUnread(item, seenOnComputers(seen, [row(OTHER, { 'w-1': NOW })], [item], store))).toBe(true);
  });

  it('a later open on the phone is kept, and nothing new is written when nothing changed', () => {
    const store = memory();
    const seen = { at: { [`${A}/w-1`]: NOW }, since: NOW - 86_400_000 * 2 };
    const item = answered('w-1', NOW - 60_000);
    const after = seenOnComputers(seen, [row(DEV, { 'w-1': NOW - 30_000 })], [item], store);
    expect(after).toBe(seen);
    expect(store.kept.size).toBe(0);
  });

  it('Mark Unread on the phone is not undone by an older open on the desktop', () => {
    const store = memory();
    const seen = { at: { [`${A}/w-1`]: 0 }, since: NOW - 86_400_000 * 2 };
    const item = answered('w-1', NOW - 60_000);
    expect(isUnread(item, seenOnComputers(seen, [row(DEV, { 'w-1': NOW - 30_000 })], [item], store))).toBe(true);
  });

  it('the inbox folds each new settings copy in', () => {
    expect(read('mobile/src/state/cloud.tsx')).toMatch(/seenOnComputers\(/);
  });
});
