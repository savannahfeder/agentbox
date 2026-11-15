// THE PHONE CHANGES A THREAD THROUGH THE DOORS THE DESKTOP USES.
//
// The phone could pin a thread and nothing else of the desktop's thread menu:
// no rename, no priority on its own, no Mark as shipped, no Share with team or
// Make private, no Keep on this Mac, no Try again or Restart, no Move to
// project. Counted against renderer/src/App.tsx itemCommands and
// renderer/src/thread-commands.ts on 2026-11-08: the `thread` scope of a
// `setting` (shared/phone-settings.mjs) took the one key `pinned`. Each now
// rides that scope with a strict value check and goes to the window's own
// handler, so the cloud's command table needs no new kind. A change other than
// a pin also has to name a thread that is on the phone. The copy of a thread
// says when it is kept on the computer, so the phone can offer the other way.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createPhoneInbox, applyThrough } from '../main/phone-inbox.mts';
import { checkSetting, settingRoute } from '../shared/phone-settings.mts';
import { checkCommand } from '../shared/phone-snapshot.mts';
import { phoneSlug, phoneView } from '../renderer/src/phone-rows';
import { phoneSender } from '../renderer/src/phone-send';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const on = (key, value, more = {}) => ({ scope: 'thread', key, product: 'alpha', item: 'w-1', value, ...more });

describe('what the thread scope takes', () => {
  it('a name: words, up to 200', () => {
    expect(checkSetting(on('label', 'Fix the sign-in page'))).toBeNull();
    expect(checkSetting(on('label', 'x'.repeat(200)))).toBeNull();
    expect(checkSetting(on('label', 'x'.repeat(201)))).toBe('not a value that setting takes');
    expect(checkSetting(on('label', '   '))).toBe('not a value that setting takes');
    expect(checkSetting(on('label', 7))).toBe('not a value that setting takes');
  });
  it('a level: a whole number 0 to 9, or none', () => {
    for (const v of [0, 2, 5, 7, 9, null]) expect(checkSetting(on('priority', v))).toBeNull();
    for (const v of [-1, 10, 5.5, '9', true]) expect(checkSetting(on('priority', v))).toBe('not a value that setting takes');
  });
  it('shipped: a moment, 0 or none for not shipped', () => {
    for (const v of [NOW, 0, null]) expect(checkSetting(on('shippedAt', v))).toBeNull();
    for (const v of [-1, 'now', 1.5, true]) expect(checkSetting(on('shippedAt', v))).toBe('not a value that setting takes');
  });
  it('who sees it: the team or only you', () => {
    expect(checkSetting(on('visibility', 'team'))).toBeNull();
    expect(checkSetting(on('visibility', 'private'))).toBeNull();
    expect(checkSetting(on('visibility', 'people'))).toBe('not a value that setting takes');
    expect(checkSetting(on('visibility', 'everyone'))).toBe('not a value that setting takes');
  });
  it('kept on the computer: yes, no to send it to the cloud, or none to leave it to the setting', () => {
    expect(checkSetting(on('onMac', true))).toBeNull();
    expect(checkSetting(on('onMac', false))).toBeNull();
    expect(checkSetting(on('onMac', null))).toBeNull();
    expect(checkSetting(on('onMac', 'yes'))).toBe('not a value that setting takes');
  });
  it('try again and restart: only yes', () => {
    for (const k of ['resume', 'redeliver']) {
      expect(checkSetting(on(k, true))).toBeNull();
      expect(checkSetting(on(k, false))).toBe('not a value that setting takes');
      expect(checkSetting(on(k, 'yes'))).toBe('not a value that setting takes');
    }
  });
  it('a move: another project by its name on the computer', () => {
    expect(checkSetting(on('moveTo', 'beta'))).toBeNull();
    expect(checkSetting(on('moveTo', '../beta'))).toBe('not a value that setting takes');
    expect(checkSetting(on('moveTo', ''))).toBe('not a value that setting takes');
    expect(checkSetting(on('moveTo', 7))).toBe('not a value that setting takes');
  });
  it('a pin as before, and nothing it was never given', () => {
    expect(checkSetting(on('pinned', true))).toBeNull();
    expect(checkSetting(on('pinned', 'yes'))).toBe('not a value that setting takes');
    expect(checkSetting(on('status', 'done'))).toBe('not a setting your phone can change');
    expect(checkSetting(on('title', 'New words'))).toBe('not a setting your phone can change');
    expect(checkSetting(on('label', 'A name', { item: undefined }))).toBe('that needs its thread');
  });
});

describe('the handler each one goes to', () => {
  const at = { product: 'alpha', id: 'w-1' };
  it('the ones the summary writes go to the thread edit', () => {
    expect(settingRoute(on('label', 'Fix it'))).toEqual(['zero:thread-edit', { ...at, patch: { label: 'Fix it' } }]);
    expect(settingRoute(on('priority', 9))).toEqual(['zero:thread-edit', { ...at, patch: { priority: 9 } }]);
    expect(settingRoute(on('visibility', 'private'))).toEqual(['zero:thread-edit', { ...at, patch: { visibility: 'private' } }]);
    // The desktop's Not shipped after all writes 0 (App.tsx `markShipped`).
    expect(settingRoute(on('shippedAt', NOW))).toEqual(['zero:thread-edit', { ...at, patch: { shippedAt: NOW } }]);
    expect(settingRoute(on('shippedAt', null))).toEqual(['zero:thread-edit', { ...at, patch: { shippedAt: 0 } }]);
  });
  it('the rest to the window\'s own doors for them', () => {
    expect(settingRoute(on('onMac', true))).toEqual(['zero:set-thread-on-mac', { onMac: { 'w-1': true } }]);
    expect(settingRoute(on('onMac', null))).toEqual(['zero:set-thread-on-mac', { onMac: { 'w-1': null } }]);
    expect(settingRoute(on('resume', true))).toEqual(['zero:resume-items', { ids: ['w-1'] }]);
    expect(settingRoute(on('redeliver', true))).toEqual(['zero:redeliver', at]);
    expect(settingRoute(on('moveTo', 'beta'))).toEqual(['zero:move-item', { ...at, to: 'beta' }]);
  });
  it('a pin still goes to the pins', () => {
    expect(settingRoute(on('pinned', true))).toEqual(['zero:set-thread-pins', { pins: { 'w-1': true } }]);
    expect(settingRoute(on('pinned', false))).toEqual(['zero:set-thread-pins', { pins: { 'w-1': null } }]);
  });
});

describe('a change other than a pin names a thread on the phone', () => {
  const opts = { projects: ['alpha', 'beta'], hasItem: (p, id) => p === 'alpha' && id === 'w-1' };
  const cmd = (payload) => ({ kind: 'setting', project: null, item: null, payload });
  it('is taken for a thread on the phone', () => {
    expect(checkCommand(cmd(on('label', 'Fix it')), opts)).toBeNull();
    expect(checkCommand(cmd(on('moveTo', 'beta')), opts)).toBeNull();
  });
  it('is refused for a thread or project the phone does not have', () => {
    expect(checkCommand(cmd(on('label', 'Fix it', { item: 'w-9' })), opts)).toBe('that thread is not on your phone');
    expect(checkCommand(cmd(on('resume', true, { product: 'gamma' })), opts)).toBe('that thread is not on your phone');
    expect(checkCommand(cmd(on('moveTo', 'gamma')), opts)).toBe('that project is not on your phone');
  });
  it('a pin is taken as it always was', () => {
    expect(checkCommand(cmd(on('pinned', true, { item: 'w-9' })), opts)).toBeNull();
  });
});

const row = (id, more = {}) => ({ id, title: `Thread ${id}`, status: 'blocked', kind: 'directive', labels: ['founder'], priority: 0, createdAt: NOW - 9e6, updatedAt: NOW - 1000, ...more });
function mac({ onMac = {} } = {}) {
  const cloud = createMemoryCloud();
  cloud.now = () => NOW;
  const me = signUpMemory(cloud, { email: `owner-${Math.random()}@example.com` });
  const backend = memoryBackend(cloud, me);
  const phone = memoryBackend(cloud, me);
  const calls = [];
  const door = (name) => [name, async (_e, args) => { calls.push([name, args]); return { ok: true }; }];
  const channels = new Map([
    ['zero:settings-read', async () => ({ ok: true, workspace: { accounts: [] }, projects: [] })],
    door('zero:thread-edit'), door('zero:set-thread-on-mac'), door('zero:resume-items'), door('zero:redeliver'), door('zero:move-item'),
  ]);
  const inbox = createPhoneInbox({
    backend,
    projects: () => [{ slug: 'alpha', name: 'Alpha' }, { slug: 'beta', name: 'Beta' }],
    listItems: (slug) => (slug === 'alpha' ? [row('w-1'), row('w-2')] : []),
    historyOf: () => [],
    onMacOf: () => onMac,
    apply: applyThrough(channels),
    stateFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'phone-thread-doors-')), 'phone-inbox.json'),
    now: () => NOW,
  });
  const send = (payload) => phone.addPhoneCommand({ device: inbox.device, project: null, item: null, kind: 'setting', payload });
  const outcomes = async () => Object.fromEntries((await phone.phoneCommands()).map((c) => [c.id, c.outcome]));
  const copyOf = async (id) => (await phone.phoneThreads()).find((t) => t.item === id)?.snapshot?.item;
  return { inbox, send, calls, outcomes, copyOf };
}

describe('on the computer', () => {
  it('a rename and a move from the phone reach the window\'s handlers', async () => {
    const m = mac();
    await m.inbox.syncOnce();
    const a = await m.send(on('label', 'Fix the sign-in page'));
    const b = await m.send(on('moveTo', 'beta', { item: 'w-2' }));
    await m.inbox.syncOnce();
    expect(m.calls).toEqual([
      ['zero:thread-edit', { product: 'alpha', id: 'w-1', patch: { label: 'Fix the sign-in page' } }],
      ['zero:move-item', { product: 'alpha', id: 'w-2', to: 'beta' }],
    ]);
    const out = await m.outcomes();
    expect([out[a.id], out[b.id]]).toEqual(['done', 'done']);
  });

  it('a thread it does not have is refused and nothing is called', async () => {
    const m = mac();
    await m.inbox.syncOnce();
    const a = await m.send(on('resume', true, { item: 'w-9' }));
    await m.inbox.syncOnce();
    expect(m.calls).toEqual([]);
    expect((await m.outcomes())[a.id]).toBe('refused: that thread is not on your phone');
  });

  it('the copy of a thread kept on the computer says so, and only that one', async () => {
    const m = mac({ onMac: { 'w-1': true } });
    await m.inbox.syncOnce();
    expect((await m.copyOf('w-1')).onMac).toBe(true);
    expect((await m.copyOf('w-2')).onMac).toBeUndefined();
  });
});

const DEV = 'a1b2c3d4e5f6';
const A = phoneSlug(DEV, 'alpha');
function phone({ commands = [], item = {} } = {}) {
  let rows = {
    projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW) }, { device: DEV, project: 'beta', name: 'Beta', updated_at: iso(NOW) }],
    threads: [{ device: DEV, project: 'alpha', item: 'w-1', updated_at: iso(NOW - 1000), snapshot: { v: 3, item: row('w-1', item), history: [] } }],
    commands,
  };
  let n = 0;
  const client = {
    generation: () => 0,
    async insertCommand(r) { n += 1; return { id: `c-${n}`, created_at: iso(NOW), claimed_at: null, taken_at: null, outcome: null, ...r }; },
    async update() { return []; },
  };
  const sender = phoneSender({ client, rows: () => rows, setRows: (r) => { rows = r; }, aliases: () => ({}), changed: () => {} });
  return { sender, rows: () => rows, shown: () => phoneView(rows, NOW).items.find((i) => i.id === 'w-1') };
}

describe('the phone\'s doors', () => {
  it('leave a setting for the computer that copied the thread, one per change', async () => {
    const p = phone();
    await p.sender.threadEdit({ product: A, id: 'w-1', patch: { label: 'Fix it', priority: 9 } });
    await p.sender.setThreadOnMac({ onMac: { 'w-1': true } });
    await p.sender.resumeItems({ ids: ['w-1'] });
    await p.sender.redeliver({ product: A, id: 'w-1' });
    await p.sender.moveItem({ product: A, id: 'w-1', to: 'beta' });
    expect(p.rows().commands.map((c) => [c.device, c.kind, c.payload])).toEqual([
      [DEV, 'setting', on('label', 'Fix it')],
      [DEV, 'setting', on('priority', 9)],
      [DEV, 'setting', on('onMac', true)],
      [DEV, 'setting', on('resume', true)],
      [DEV, 'setting', on('redeliver', true)],
      [DEV, 'setting', on('moveTo', 'beta')],
    ]);
  });

  it('refuse a thread no computer has made', async () => {
    const p = phone();
    await expect(p.sender.threadEdit({ product: A, id: 'w-9', patch: { label: 'x' } })).rejects.toThrow();
    await expect(p.sender.resumeItems({ ids: ['w-9'] })).rejects.toThrow();
    expect(p.rows().commands).toEqual([]);
  });

  it('a rename, a level and a keep show at once, and the computer\'s copy stands once it is refused', () => {
    const cmd = (payload, more = {}) => ({ id: `c-${payload.key}`, device: DEV, project: null, item: null, kind: 'setting', payload, created_at: iso(NOW - 500), claimed_at: null, taken_at: null, outcome: null, ...more });
    const shown = phone({ commands: [cmd(on('label', 'Fix it')), cmd(on('priority', 9)), cmd(on('onMac', true))] }).shown();
    expect(shown).toMatchObject({ label: 'Fix it', priority: 9, onMac: true });
    const refused = phone({ commands: [cmd(on('label', 'Fix it'), { taken_at: iso(NOW - 100), outcome: 'refused: no' })] }).shown();
    expect(refused.label).toBeUndefined();
    // Try again changes nothing on the row to show.
    expect(phone({ commands: [cmd(on('resume', true))] }).shown()).not.toHaveProperty('resume');
  });
});
