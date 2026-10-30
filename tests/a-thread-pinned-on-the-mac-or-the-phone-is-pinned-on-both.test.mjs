// A THREAD PINNED ON THE MAC OR THE PHONE IS PINNED ON BOTH.
//
// Pins were the Mac's alone (2026-10-28): the copy of a thread the Mac sends
// carried no `pinned`, so a thread pinned at the desk sat in its date order on
// the phone, and the web app kept a pin made there in the page and never told
// the Mac (cloud-bridge.ts READS). Now the copy carries the pin, a pin made on
// a phone goes to the Mac as a `setting` command through the window's own
// handler, and the phone draws it pinned while the Mac has not taken it yet.
// Measured with the in-memory cloud and a stand-in for the window's channels.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createPhoneInbox, applyThrough } from '../main/phone-inbox.mjs';
import { checkSetting } from '../shared/phone-settings.mjs';
import { phoneSlug, phoneView } from '../renderer/src/phone-rows';
import { phoneSender } from '../renderer/src/phone-send';
import { planFor, runSteps } from '../mobile/src/lib/actions';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const row = (id, more = {}) => ({ id, title: `Thread ${id}`, status: 'blocked', kind: 'directive', labels: ['founder'], priority: 0, createdAt: NOW - 9e6, updatedAt: NOW - 1000, ...more });

function mac({ pins = {} } = {}) {
  const cloud = createMemoryCloud();
  cloud.now = () => NOW;
  const me = signUpMemory(cloud, { email: `owner-${Math.random()}@example.com` });
  const backend = memoryBackend(cloud, me);
  const phone = memoryBackend(cloud, me);
  const state = { pins: { ...pins }, calls: [] };
  const channels = new Map([
    ['zero:settings-read', async () => ({ ok: true, workspace: { accounts: [] }, projects: [] })],
    ['zero:set-thread-pins', async (_e, args) => {
      state.calls.push(args);
      for (const [id, v] of Object.entries(args.pins)) { if (v === true) state.pins[id] = true; else delete state.pins[id]; }
      return { ok: true };
    }],
  ]);
  const inbox = createPhoneInbox({
    backend,
    projects: () => [{ slug: 'alpha', name: 'Alpha' }],
    listItems: () => [row('w-1'), row('w-2')],
    historyOf: () => [],
    pinsOf: () => state.pins,
    apply: applyThrough(channels),
    stateFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'phone-pins-')), 'phone-inbox.json'),
    now: () => NOW,
  });
  const copyOf = async (id) => (await phone.phoneThreads()).find((t) => t.item === id)?.snapshot?.item;
  return { inbox, phone, state, copyOf };
}

describe('the copy of a thread the Mac sends', () => {
  it('says it is pinned, and only the pinned one says so', async () => {
    const m = mac({ pins: { 'w-1': true } });
    await m.inbox.syncOnce();
    expect((await m.copyOf('w-1')).pinned).toBe(true);
    expect((await m.copyOf('w-2')).pinned).toBeUndefined();
  });

  it('is sent again when a pin is taken off on the Mac', async () => {
    const m = mac({ pins: { 'w-1': true } });
    await m.inbox.syncOnce();
    delete m.state.pins['w-1'];
    await m.inbox.syncOnce();
    expect((await m.copyOf('w-1')).pinned).toBeUndefined();
  });
});

describe('a pin sent from the phone', () => {
  it('goes through the window\'s own pin handler, both ways', async () => {
    const m = mac();
    const send = (item, value) => m.phone.addPhoneCommand({ device: m.inbox.device, project: null, item: null, kind: 'setting', payload: { scope: 'thread', key: 'pinned', product: 'alpha', item, value } });
    const a = await send('w-2', true);
    await m.inbox.syncOnce();
    const b = await send('w-2', false);
    await m.inbox.syncOnce();
    expect(m.state.calls).toEqual([{ pins: { 'w-2': true } }, { pins: { 'w-2': null } }]);
    const out = Object.fromEntries((await m.phone.phoneCommands()).map((c) => [c.id, c.outcome]));
    expect([out[a.id], out[b.id]]).toEqual(['done', 'done']);
  });

  it('is refused without a thread, a project, or a yes or no', () => {
    expect(checkSetting({ scope: 'thread', key: 'pinned', product: 'alpha', item: 'w-1', value: true })).toBeNull();
    expect(checkSetting({ scope: 'thread', key: 'pinned', product: 'alpha', item: 'w-1', value: false })).toBeNull();
    expect(checkSetting({ scope: 'thread', key: 'pinned', product: 'alpha', value: true })).toBe('that needs its thread');
    expect(checkSetting({ scope: 'thread', key: 'pinned', item: 'w-1', value: true })).toBe('that setting needs its project');
    expect(checkSetting({ scope: 'thread', key: 'pinned', product: 'alpha', item: '../w-1', value: true })).toBe('that needs its thread');
    expect(checkSetting({ scope: 'thread', key: 'pinned', product: 'alpha', item: 'w-1', value: 'yes' })).toBe('not a value that setting takes');
    expect(checkSetting({ scope: 'thread', key: 'status', product: 'alpha', item: 'w-1', value: 'done' })).toBe('not a setting your phone can change');
  });
});

const DEV = 'a1b2c3d4e5f6';
const A = phoneSlug(DEV, 'alpha');
function phone({ pinned = false, commands = [] } = {}) {
  let rows = {
    projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW) }],
    threads: [{ device: DEV, project: 'alpha', item: 'w-1', updated_at: iso(NOW - 1000), snapshot: { v: 3, item: row('w-1', pinned ? { pinned: true } : {}), history: [] } }],
    commands,
  };
  let n = 0;
  const client = {
    generation: () => 0,
    async insertCommand(r) { n += 1; return { id: `c-${n}`, created_at: iso(NOW), claimed_at: null, taken_at: null, outcome: null, ...r }; },
    async update() { return []; },
  };
  const sender = phoneSender({ client, rows: () => rows, setRows: (r) => { rows = r; }, aliases: () => ({}), changed: () => {} });
  const pinnedNow = () => phoneView(rows, NOW).items.find((i) => i.id === 'w-1')?.pinned ?? false;
  return { sender, rows: () => rows, pinnedNow };
}
const pinCommand = (value, more = {}) => ({ id: 'c-0', device: DEV, project: null, item: null, kind: 'setting', payload: { scope: 'thread', key: 'pinned', product: 'alpha', item: 'w-1', value }, created_at: iso(NOW - 500), claimed_at: null, taken_at: null, outcome: null, ...more });

describe('on the phone', () => {
  it('a pin from the menu leaves a setting for the Mac that copied the thread', async () => {
    const p = phone();
    const plan = planFor({ kind: 'pin', pinned: true }, { product: A, id: 'w-1', status: 'blocked', title: 'Thread w-1' }, NOW);
    await runSteps(p.sender, plan.steps);
    expect(p.rows().commands.at(-1)).toMatchObject({ device: DEV, project: null, item: null, kind: 'setting', payload: { scope: 'thread', key: 'pinned', product: 'alpha', item: 'w-1', value: true } });
    expect(plan.toast).toBe('Pinned to the top of your list');
    expect(planFor({ kind: 'pin', pinned: false }, { product: A, id: 'w-1', status: 'blocked' }, NOW).toast).toBe('Unpinned');
  });

  it('the web app\'s own door sends the same, and refuses a thread no computer has', async () => {
    const p = phone();
    await p.sender.setThreadPins({ pins: { 'w-1': null } });
    expect(p.rows().commands.at(-1).payload).toEqual({ scope: 'thread', key: 'pinned', product: 'alpha', item: 'w-1', value: false });
    await expect(p.sender.setThreadPins({ pins: { 'w-9': true } })).rejects.toThrow();
  });

  it('draws it pinned while the Mac has not taken it, and as the Mac\'s copy says after', () => {
    expect(phone().pinnedNow()).toBe(false);
    expect(phone({ commands: [pinCommand(true)] }).pinnedNow()).toBe(true);
    expect(phone({ pinned: true, commands: [pinCommand(false)] }).pinnedNow()).toBe(false);
    // Refused: the Mac's copy is what stands.
    expect(phone({ commands: [pinCommand(true, { taken_at: iso(NOW - 100), outcome: 'refused: no' })] }).pinnedNow()).toBe(false);
    // Taken long ago and the copy since says otherwise: the copy wins.
    expect(phone({ commands: [pinCommand(true, { taken_at: iso(NOW - 10 * 60_000), outcome: 'done' })] }).pinnedNow()).toBe(false);
  });

  it('a pin for another computer\'s thread of the same name is not this one', () => {
    const other = pinCommand(true, { device: '0f0e0d0c0b0a' });
    expect(phone({ commands: [other] }).pinnedNow()).toBe(false);
  });
});
