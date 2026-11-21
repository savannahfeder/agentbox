// A THREAD OPENED ON THE PHONE IS READ ON THE COMPUTER.
//
// In phone session m19 (2026-11-15) the tester opened threads A, F and M on
// the phone, and the desktop kept their unread dots. The phone kept what it
// had opened to itself, and the desktop's window keeps its own read times
// only in its page. Now opening an unread thread on the phone leaves a `seen`
// setting for its computer, which hands it to the window through
// 'zero:phone-seen', and the window counts the thread read from that moment.
// Measured with the in-memory cloud and a stand-in for the window's channels.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createPhoneInbox, applyThrough } from '../main/phone-inbox.mts';
import { checkSetting, settingRoute } from '../shared/phone-settings.mts';
import { isUnread, seenElsewhere } from '../renderer/src/unread';

const NOW = Date.parse('2026-11-15T18:30:00Z');
const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const row = (id) => ({ id, title: `Thread ${id}`, status: 'blocked', kind: 'directive', labels: ['founder'], priority: 0, createdAt: NOW - 9e6, updatedAt: NOW - 1000 });

function mac() {
  const cloud = createMemoryCloud();
  cloud.now = () => NOW;
  const me = signUpMemory(cloud, { email: `owner-${Math.random()}@example.com` });
  const backend = memoryBackend(cloud, me);
  const phone = memoryBackend(cloud, me);
  const calls = [];
  const channels = new Map([
    ['zero:settings-read', async () => ({ ok: true, workspace: { accounts: [] }, projects: [] })],
    ['zero:phone-seen', async (_e, args) => { calls.push(args); return { ok: true }; }],
  ]);
  const inbox = createPhoneInbox({
    backend,
    projects: () => [{ slug: 'alpha', name: 'Alpha' }],
    listItems: () => [row('w-1')],
    historyOf: () => [],
    apply: applyThrough(channels),
    stateFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'phone-seen-')), 'phone-inbox.json'),
    now: () => NOW,
  });
  return { inbox, phone, calls };
}

describe('a thread opened on the phone', () => {
  it('reaches the window through its own channel', async () => {
    const m = mac();
    await m.inbox.syncOnce();
    await m.phone.addPhoneCommand({ device: m.inbox.device, project: null, item: null, kind: 'setting', payload: { scope: 'thread', key: 'seen', product: 'alpha', item: 'w-1', value: NOW - 5_000 } });
    await m.inbox.syncOnce();
    expect(m.calls).toEqual([{ product: 'alpha', id: 'w-1', at: NOW - 5_000 }]);
    expect((await m.phone.phoneCommands()).map((c) => c.outcome)).toEqual(['done']);
  });

  it('takes a moment and nothing else', () => {
    const at = { scope: 'thread', key: 'seen', product: 'alpha', item: 'w-1' };
    expect(checkSetting({ ...at, value: NOW })).toBeNull();
    for (const value of [0, -1, 1.5, 'now', null, true]) expect(checkSetting({ ...at, value })).not.toBeNull();
    expect(settingRoute({ ...at, value: NOW }, null)).toEqual(['zero:phone-seen', { product: 'alpha', id: 'w-1', at: NOW }]);
  });
});

describe('the window', () => {
  const answered = { id: 'w-1', createdAt: NOW - 9e6, wrote: { result: { ts: NOW - 60_000, source: 'agent' } } };
  it('reads the thread as read from when the phone opened it', () => {
    expect(isUnread(answered, {}, NOW - 9e6)).toBe(true);
    expect(isUnread(answered, seenElsewhere({}, 'w-1', NOW - 5_000), NOW - 9e6)).toBe(false);
  });
  it('an answer after the phone opened it is still new', () => {
    expect(isUnread({ ...answered, wrote: { result: { ts: NOW, source: 'agent' } } }, seenElsewhere({}, 'w-1', NOW - 5_000), NOW - 9e6)).toBe(true);
  });
  it('never moves a later opening on the desk back', () => {
    const seen = { 'w-1': NOW };
    expect(seenElsewhere(seen, 'w-1', NOW - 5_000)).toBe(seen);
  });
  it('a thread marked unread on the desk reads as read once the phone opens it', () => {
    expect(seenElsewhere({ 'w-1': 0 }, 'w-1', NOW - 5_000)).toEqual({ 'w-1': NOW - 5_000 });
  });
  it('listens for it, from main through preload', () => {
    expect(read('main/ipc.mts')).toMatch(/ipcMain\.handle\('zero:phone-seen'[\s\S]{0,300}webContents\.send\('zero:seen-on-phone'/);
    expect(read('preload.cjs')).toMatch(/onSeenOnPhone: \(fn\) => \{[\s\S]{0,120}ipcRenderer\.on\('zero:seen-on-phone'/);
    expect(read('renderer/src/App.tsx')).toMatch(/onSeenOnPhone\?\.\(\(\{ id, at \}\) => \{[\s\S]{0,160}seenElsewhere\(m, id, at\)/);
  });
});

describe('the phone', () => {
  const cloud = read('mobile/src/state/cloud.tsx');
  it('tells the computer only when the thread was unread here', () => {
    const mark = cloud.slice(cloud.indexOf('const markSeen = useCallback'), cloud.indexOf('const markUnseen'));
    expect(mark).toMatch(/if \(isUnread\(item, seenNow\.current\)\) void seenSender\.current\?\.threadEdit\(\{ product: item\.product, id: item\.id, patch: \{ seen: Date\.now\(\) \} \}\)\.catch/);
  });
  it('a seen sent from the phone does not send the settings copy again', () => {
    expect(read('main/phone-inbox.mts')).toMatch(/\?\.key !== 'seen'\) changedSettings = true/);
  });
});
