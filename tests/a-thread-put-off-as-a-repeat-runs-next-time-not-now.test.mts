// A THREAD PUT OFF AS A REPEAT RUNS AT ITS NEXT TIME, NOT NOW (w-8b637c7802).
//
// Two rounds of testers pressed L on an answered thread, typed "every monday
// 9am" and pressed Enter. A run started at once, named for last Monday, and
// the thread they put off stayed in Needs you, so the same job sat in two
// tabs. Reproduced in the live copy on a Tuesday: the new rule's first period
// (Monday) counted as owed, so a run "· Tue, Nov 3" was made on the spot, and
// Needs you went from 9 to 10.
//
// A repeat made from a thread that already ran counts the current period as
// served by that thread. A new repeating task typed in the composer still
// starts at once (tests/a-new-repeating-task-starts-at-once).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Repeats } from '../main/repeats.mts';
import { loadStore } from '../main/store-modules.mts';
import { isOwed, nextRunAt } from '../shared/repeats.mts';

let dir, repeats;
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-next-'));
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'p', name: 'P' }));
  repeats = new Repeats(await loadStore());
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();
const MONDAYS_9 = { title: 'List advisories', body: 'list them', every: 'week', on: 1, at: '09:00' };

describe('a repeat made from a thread', () => {
  it('on a Monday before 9am runs at 9am that day, not now', () => {
    const now = at(2026, 11, 2, 3);
    const rule = repeats.setRule(dir, { ...MONDAYS_9, startsNext: true }, now);
    expect(isOwed(rule, now)).toBe(false);
    expect(isOwed(rule, at(2026, 11, 2, 8, 59))).toBe(false);
    expect(isOwed(rule, at(2026, 11, 2, 9))).toBe(true);
    expect(nextRunAt(rule, now)).toBe(at(2026, 11, 2, 9));
  });

  it('on a Tuesday waits for the next Monday', () => {
    const now = at(2026, 11, 3, 18);
    const rule = repeats.setRule(dir, { ...MONDAYS_9, startsNext: true }, now);
    expect(isOwed(rule, now)).toBe(false);
    expect(isOwed(rule, at(2026, 11, 9, 8))).toBe(false);
    expect(isOwed(rule, at(2026, 11, 9, 9))).toBe(true);
  });

  it('on a daily rule after its hour waits for tomorrow', () => {
    const now = at(2026, 11, 3, 10);
    const rule = repeats.setRule(dir, { title: 'Standup', every: 'day', at: '09:00', startsNext: true }, now);
    expect(isOwed(rule, now)).toBe(false);
    expect(isOwed(rule, at(2026, 11, 4, 9))).toBe(true);
  });

  it('keeps the watermark after the app reads the file again', () => {
    const now = at(2026, 11, 3, 18);
    const made = repeats.setRule(dir, { ...MONDAYS_9, startsNext: true }, now);
    expect(repeats.due(dir, now)).toEqual([]);
    expect(repeats.get(dir, made.id, now).served).toBe('2026-11-02');
  });
});

describe('a run of a repeating task put off on a new rhythm', () => {
  it('moves the rule without starting a run now', () => {
    const made = repeats.setRule(dir, { ...MONDAYS_9, startsNext: true }, at(2026, 11, 3, 18));
    const now = at(2026, 11, 3, 19);
    const moved = repeats.patchRule(dir, made.id, { every: 'day', at: '08:00', startsNext: true }, now);
    expect(isOwed(moved, now)).toBe(false);
    expect(isOwed(moved, at(2026, 11, 4, 8))).toBe(true);
  });

  it('a change from the edit screen, which does not ask for it, behaves as before', () => {
    const made = repeats.setRule(dir, { ...MONDAYS_9, startsNext: true }, at(2026, 11, 3, 18));
    const now = at(2026, 11, 3, 19);
    const moved = repeats.patchRule(dir, made.id, { every: 'day', at: '08:00' }, now);
    expect(isOwed(moved, now)).toBe(true);
    expect('startsNext' in moved).toBe(false);
  });
});

describe('a new repeating task from the composer', () => {
  it('still owes its first run at once', () => {
    const now = at(2026, 11, 3, 18);
    const rule = repeats.setRule(dir, MONDAYS_9, now);
    expect(isOwed(rule, now)).toBe(true);
    expect(rule.served).toBe('');
  });
});

describe('the way there', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

  it('the handler and the store pass it through', () => {
    const ipc = read('main/ipc.mts');
    const handler = ipc.slice(ipc.indexOf("ipcMain.handle('zero:compose-repeat'"), ipc.indexOf("ipcMain.handle('zero:set-repeat'"));
    expect(handler).toMatch(/startsNext/);
    expect(read('main/store.mts')).toMatch(/composeRepeat\(slug(?:: string)?, \{[^}]*startsNext/);
  });

  it('the app asks for it when the repeat is made from a thread', () => {
    const app = read('renderer/src/App.tsx');
    const apply = app.slice(app.indexOf('const applyRepeat = async'), app.indexOf('const applyRepeat = async') + 4000);
    expect(apply).toMatch(/composeRepeat\(\{[\s\S]*?startsNext: true/);
  });

  // Round two of testers: a renamed thread's repeat showed the old typo, and
  // an unrenamed one its whole first message, as its name in Later.
  it('names the repeat what the thread is called, and gives its runs the whole message', () => {
    const app = read('renderer/src/App.tsx');
    const apply = app.slice(app.indexOf('const applyRepeat = async'), app.indexOf('const applyRepeat = async') + 4000);
    expect(apply).toMatch(/title: rowTitle\(item\), body: repeatBody\(item\)/);
  });
});

describe('what a repeat made from a thread tells its runs', () => {
  it('is the whole of what you wrote', async () => {
    const { repeatBody } = await import('../renderer/src/repeat-from-thread.ts');
    expect(repeatBody({ title: 'summarise what changed in the product this week for the team' })).toBe('summarise what changed in the product this week for the team');
    expect(repeatBody({ title: 'Pricing page', body: 'The annual toggle shows monthly prices.' })).toBe('Pricing page\n\nThe annual toggle shows monthly prices.');
  });
});
