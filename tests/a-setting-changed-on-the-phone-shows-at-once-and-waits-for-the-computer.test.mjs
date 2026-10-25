// A SETTING CHANGED ON THE PHONE SHOWS AT ONCE, AND SAYS IT IS WAITING FOR THE COMPUTER.
//
// A change from the phone is a command its computer carries out on its next
// pass (main/phone-inbox.mjs), up to five seconds later with the Mac awake and
// whenever it next wakes otherwise. Its copy of its settings comes back after
// that. Read straight from the copy, a switch flipped on the phone would flip
// back until then. So the page draws the phone's own value while the command
// waits, keeps it once taken until a newer copy arrives, and says why when the
// computer refused.
import { describe, it, expect } from 'vitest';
import { changesOn, changeKey, computerOf, readingOf } from '../mobile/src/lib/settings-view';
import { phoneView, settingCommand } from '../renderer/src/phone-rows';

const NOW = Date.parse('2026-10-21T20:00:00Z');
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const mac = { device: 'aaaaaaaaaaaa', name: 'Studio', updated_at: iso(60_000), settings: { workspace: { adhdMode: true, memoryGate: { on: false, slots: null } } } };
let n = 0;
const cmd = (payload, { device = mac.device, at = 30_000, taken = null, outcome = null } = {}) => ({
  id: `c-${++n}`, device, project: null, item: null, kind: 'setting', payload, created_at: iso(at), claimed_at: null, taken_at: taken === null ? null : iso(taken), outcome,
});
const adhd = (value) => ({ scope: 'workspace', key: 'adhdMode', value });

describe('which computer the page is about', () => {
  it('is the one heard from last', () => {
    const older = { ...mac, device: 'bbbbbbbbbbbb', updated_at: iso(3600_000) };
    expect(computerOf([older, mac])?.device).toBe(mac.device);
    expect(computerOf([])).toBeNull();
  });
});

describe('a change the computer has not taken yet', () => {
  it('reads as the phone set it, waiting', () => {
    const changes = changesOn(mac, [cmd(adhd(false))], NOW);
    expect(readingOf(changes, adhd().scope, 'adhdMode', true)).toEqual({ value: false, waiting: true, refused: null });
  });

  it('the newest of two wins', () => {
    const changes = changesOn(mac, [cmd(adhd(false), { at: 40_000 }), cmd(adhd(true), { at: 20_000 })], NOW);
    expect(readingOf(changes, 'workspace', 'adhdMode', true).value).toBe(true);
  });

  it('keeps a null it set, not the copy\'s value', () => {
    const changes = changesOn(mac, [cmd({ scope: 'workspace', key: 'memoryGateSlots', value: null })], NOW);
    expect(readingOf(changes, 'workspace', 'memoryGateSlots', 3)).toEqual({ value: null, waiting: true, refused: null });
  });
});

describe('a change the computer took', () => {
  it('stays as set until a copy made after it arrives', () => {
    const taken = cmd(adhd(false), { at: 50_000, taken: 10_000, outcome: 'done' });
    expect(readingOf(changesOn(mac, [taken], NOW), 'workspace', 'adhdMode', true)).toEqual({ value: false, waiting: false, refused: null });
    const newer = { ...mac, updated_at: iso(5_000) };
    expect(readingOf(changesOn(newer, [taken], NOW), 'workspace', 'adhdMode', true)).toEqual({ value: true, waiting: false, refused: null });
  });

  it('reads as the copy, and says why, when refused', () => {
    const refused = cmd(adhd(false), { taken: 10_000, outcome: 'refused: not a setting your phone can change' });
    expect(readingOf(changesOn(mac, [refused], NOW), 'workspace', 'adhdMode', true)).toEqual({ value: true, waiting: false, refused: 'not a setting your phone can change' });
  });

  it('stops saying so after ten minutes', () => {
    const old = cmd(adhd(false), { at: 900_000, taken: 11 * 60_000, outcome: 'refused: no' });
    expect(readingOf(changesOn(mac, [old], NOW), 'workspace', 'adhdMode', true).refused).toBeNull();
  });
});

describe('what is not a change to this computer\'s settings', () => {
  it('leaves out another computer\'s, a thread\'s, and one taken back', () => {
    const changes = changesOn(mac, [
      cmd(adhd(false), { device: 'bbbbbbbbbbbb' }),
      { ...cmd(adhd(false)), kind: 'reply', project: 'p', item: 'w-1' },
      cmd(adhd(false), { taken: 1000, outcome: 'refused: taken back on the phone' }),
    ], NOW);
    expect(changes.size).toBe(0);
    expect(readingOf(changes, 'workspace', 'adhdMode', true)).toEqual({ value: true, waiting: false, refused: null });
  });

  it('is never drawn on a thread or in the inbox', () => {
    const rows = { projects: [{ device: mac.device, project: 'site', name: 'Website' }], threads: [], commands: [cmd(adhd(false)), cmd(adhd(true), { taken: 1000, outcome: 'refused: no' })] };
    const view = phoneView(rows, NOW);
    expect(view.waiting).toEqual([]);
    expect(view.items).toEqual([]);
    expect(settingCommand(mac.device, adhd(false))).toEqual({ device: mac.device, project: null, item: null, kind: 'setting', payload: { scope: 'workspace', key: 'adhdMode', value: false } });
  });

  it('keeps a project\'s setting apart from the same key for every project', () => {
    const changes = changesOn(mac, [cmd({ scope: 'project', product: 'site', key: 'permission', value: 'plan' })], NOW);
    expect(changes.has(changeKey({ scope: 'project', product: 'site', key: 'permission' }))).toBe(true);
    expect(readingOf(changes, 'workspace', 'permission', 'auto').value).toBe('auto');
    expect(readingOf(changes, 'project', 'permission', 'workspace', 'site').value).toBe('plan');
    expect(readingOf(changes, 'project', 'permission', 'workspace', 'kestrel').value).toBe('workspace');
  });
});
