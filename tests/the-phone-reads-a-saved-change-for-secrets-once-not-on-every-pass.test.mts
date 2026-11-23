// The phone reads a saved change for secrets once, not on every pass.
//
// 2026-11-23: over a night with every fix so far loaded, the app's own CPU
// record put the phone inbox's pass at 15% of the main thread's busy time, 7
// to 10% of it under phoneChangeOf. Each pass asked for every carried thread's
// saved change, and each ask ran the secret patterns over every file path in
// it, then kept the first 40. A saved change is the same object until its file
// is rewritten, so it is now read for secrets once, and only the paths kept.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { phoneChangeOf, PHONE_CHANGE_FILES } from '../shared/phone-snapshot.mts';

const HOME = '/Users/someone';
const summary = (i: number, files = 60) => ({
  plus: files, minus: 0, committed: true, uncommitted: false, knowsYou: true,
  files: Array.from({ length: files }, (_, n) => ({ path: `${HOME}/repo/src/thread-${i}/file-${n}.mts`, plus: 1, minus: 0 })),
});
// hideSecrets looks for file paths with matchAll, once for each text it reads.
const textsRead = (fn: () => void) => {
  const spy = vi.spyOn(String.prototype, 'matchAll');
  try { fn(); return spy.mock.calls.length; } finally { spy.mockRestore(); }
};
afterEach(() => vi.restoreAllMocks());

describe('a saved change as the phone carries it', () => {
  it('is read for secrets once, however many passes ask for it', () => {
    const carried = Array.from({ length: 300 }, (_, i) => summary(i));
    const first = carried.map((s) => phoneChangeOf(s, { home: HOME }));
    const again = textsRead(() => {
      for (let pass = 0; pass < 5; pass += 1) carried.forEach((s, i) => expect(phoneChangeOf(s, { home: HOME })).toBe(first[i]));
    });
    expect(again).toBe(0);
  });

  it('reads only the paths it keeps', () => {
    const big = summary(1, 5000);
    const read = textsRead(() => { phoneChangeOf(big, { home: HOME }); });
    expect(read).toBe(PHONE_CHANGE_FILES);
    const out = phoneChangeOf(big, { home: HOME })!;
    expect(out.files).toHaveLength(PHONE_CHANGE_FILES);
    expect(out.more).toBe(5000 - PHONE_CHANGE_FILES);
  });

  it('is read again when the change is rewritten', () => {
    const was = summary(2);
    const first = phoneChangeOf(was, { home: HOME })!;
    const rewritten = { ...was, files: [...was.files, { path: `${HOME}/repo/src/new.mts`, plus: 3, minus: 0 }], plus: 63 };
    const next = phoneChangeOf(rewritten, { home: HOME })!;
    expect(next).not.toBe(first);
    expect(next.plus).toBe(63);
    expect(next.more).toBe(61 - PHONE_CHANGE_FILES);
  });

  it('still hides a key in a path, and writes the home folder as ~', () => {
    const out = phoneChangeOf({
      plus: 2, minus: 0, committed: null, uncommitted: true, knowsYou: null,
      files: [
        { path: `${HOME}/repo/config/api_key=sk-Abcdefghij0123456789Klmnopqrst`, plus: 1, minus: 0 },
        { path: `${HOME}/repo/README.md`, plus: 1, minus: 0 },
      ],
    }, { home: HOME })!;
    expect(out.files[0].path).not.toContain('sk-Abcdefghij0123456789Klmnopqrst');
    expect(out.files[1].path).toBe('~/repo/README.md');
    expect(JSON.stringify(out)).not.toContain(HOME);
  });

  it('does not answer one home folder with another\'s reading', () => {
    const s = summary(3, 2);
    const mine = phoneChangeOf(s, { home: HOME })!;
    const theirs = phoneChangeOf(s, { home: '/Users/another' })!;
    expect(mine.files[0].path.startsWith('~/')).toBe(true);
    expect(theirs.files[0].path.startsWith(HOME)).toBe(true);
  });

  it('is still nothing for a change that touched no files', () => {
    expect(phoneChangeOf({ plus: 0, minus: 0, files: [] }, { home: HOME })).toBeNull();
    expect(phoneChangeOf(null, { home: HOME })).toBeNull();
  });
});
