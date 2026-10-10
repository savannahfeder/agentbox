// 2026-10-07: two screenshots showed a snooze followed by a repeated answer.
// The affected thread's ledger had four snoozes followed by four more answers
// without a new reply. The original expiry test reproduced one worker start.
// Snooze used runAt, which also counted as a new instruction to the worker.
// These tests measure worker starts across the reminder boundary and keep
// send later as an execution schedule. Each snooze must still appear in history.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { Supervisor, awaitingHer } from '../main/supervisor.mjs';
import { isDue } from '../shared/work-items.mjs';
import { belongsInInbox, hiddenUntil, replyClearsSchedule } from '../renderer/src/list-rules';
import { threadEvents } from '../renderer/src/thread-history';
import { registerIpc } from '../main/ipc.mjs';
import { collectingIpcMain, broadcastingWindow, nodeHost } from '../main/serve.mjs';

const NOW = 1_791_400_000_000;
const HOUR = 3_600_000;
let root, store, dir, item;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-snooze-'));
  dir = path.join(root, 'p');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ name: 'Example' }));
  store = await new Store({ accountRoot: root, products: [] }).init();
  item = store.composeItem('p', { title: 'Review the draft' });
  vi.setSystemTime(NOW + 1);
  store.modules.workItemsDisk.updateWorkItem(dir, item.id, { result: '**The draft is ready.**' }, { source: 'agent' });
  vi.setSystemTime(NOW + 2);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  fs.rmSync(root, { recursive: true, force: true });
});

function supervisor() {
  const sup = new Supervisor({ storeRoot: root, maxConcurrentSessions: 1 }, store, root);
  sup.spawnWorker = vi.fn();
  return sup;
}

describe('snooze is for the person reading the answer', () => {
  it('hides the answer before its reminder and returns it at the exact moment', () => {
    store.snoozeItem('p', item.id, NOW + HOUR);
    const row = store.readItem('p', item.id);
    expect(row.snoozedUntil).toBe(NOW + HOUR);
    expect(row.runAt).toBeUndefined();
    expect(row.result).toBe('**The draft is ready.**');
    expect(row.status).toBe('open');
    const hidden = hiddenUntil(row);
    expect(hidden).toBe(NOW + HOUR);
    expect(belongsInInbox(row, { hiddenUntil: hidden, now: NOW + HOUR - 1 })).toBe(false);
    expect(belongsInInbox(row, { hiddenUntil: hidden, now: NOW + HOUR })).toBe(true);
    expect(belongsInInbox(row, { hiddenUntil: hidden, now: NOW + HOUR + 1 })).toBe(true);
  });

  it('starts no worker before, at, or after the reminder, including after restart', async () => {
    store.snoozeItem('p', item.id, NOW + HOUR);
    for (const at of [NOW + HOUR - 1, NOW + HOUR, NOW + 2 * HOUR]) {
      vi.setSystemTime(at);
      const restarted = supervisor();
      await restarted.tick();
      expect(restarted.spawnWorker).not.toHaveBeenCalled();
    }
  });

  it('repeated snoozes and bringing it back early leave the finished answer waiting', async () => {
    for (const until of [NOW + HOUR, NOW + 2 * HOUR, 0]) {
      store.snoozeItem('p', item.id, until);
      expect(awaitingHer(store.readItem('p', item.id))).toBe(true);
      vi.setSystemTime(Date.now() + 1);
    }
    const sup = supervisor();
    await sup.tick();
    expect(sup.spawnWorker).not.toHaveBeenCalled();
    expect(hiddenUntil(store.readItem('p', item.id))).toBe(0);
  });

  it('records every snooze and the early return in history', () => {
    for (const until of [NOW + HOUR, NOW + 2 * HOUR, 0]) {
      store.snoozeItem('p', item.id, until);
      vi.setSystemTime(Date.now() + 1);
    }
    const lines = store.modules.workItemsDisk.readLinesFrom(dir).lines;
    expect(threadEvents(lines).filter(e => /snoozed|brought it back/.test(e.said)).map(e => e.said))
      .toEqual(['You snoozed it', 'You snoozed it', 'You brought it back']);
  });

  it('does not cancel a send-later schedule while snoozing or undoing the snooze', () => {
    store.scheduleItem('p', item.id, NOW + 2 * HOUR);
    store.snoozeItem('p', item.id, NOW + HOUR);
    store.snoozeItem('p', item.id, 0);
    expect(store.readItem('p', item.id).runAt).toBe(NOW + 2 * HOUR);
    expect(isDue(store.readItem('p', item.id), NOW + HOUR)).toBe(false);
  });

  it('does not treat an old runAt snooze as a new instruction either', async () => {
    store.scheduleItem('p', item.id, NOW + HOUR);
    vi.setSystemTime(NOW + HOUR);
    const sup = supervisor();
    await sup.tick();
    expect(sup.spawnWorker).not.toHaveBeenCalled();
  });

  it('a new reply still runs after snoozing a finished answer', async () => {
    store.snoozeItem('p', item.id, NOW + HOUR);
    vi.setSystemTime(NOW + 3);
    store.answerItem('p', item.id, { answer: 'Revise the opening.' });
    const sup = supervisor();
    await sup.tick();
    expect(sup.spawnWorker).toHaveBeenCalledOnce();
    expect(sup.spawnWorker.mock.calls[0][1]).toMatchObject({ continuation: true });
  });

  it('a future snooze never gates outstanding work', () => {
    expect(isDue({ snoozedUntil: NOW + HOUR }, NOW)).toBe(true);
    expect(isDue({ snoozedUntil: NOW + HOUR, runAt: NOW + 2 * HOUR }, NOW + HOUR)).toBe(false);
  });

  it('an agent cannot snooze its own question out of the human inbox', () => {
    const row = { status: 'open', snoozedUntil: NOW + HOUR, wrote: { snoozedUntil: { source: 'agent', ts: NOW } } };
    expect(hiddenUntil(row)).toBe(0);
  });

  it('an agent-finished task returns, while a task you closed stays closed', () => {
    const row = { ...store.readItem('p', item.id), status: 'done', wrote: { ...store.readItem('p', item.id).wrote, status: { ts: NOW + 1, source: 'agent' } } };
    expect(belongsInInbox(row, { now: NOW + HOUR, hiddenUntil: NOW + HOUR })).toBe(true);
    row.wrote.status.source = 'founder';
    expect(belongsInInbox(row, { now: NOW + HOUR, hiddenUntil: NOW + HOUR })).toBe(false);
  });

  it('a reply lifts an inbox snooze as well as an execution schedule', () => {
    expect(replyClearsSchedule({ status: 'open', snoozedUntil: NOW + HOUR }, NOW)).toBe(true);
    expect(replyClearsSchedule({ status: 'open', snoozedUntil: NOW }, NOW)).toBe(false);
  });

  it('send later still starts unfinished work at its time', async () => {
    const fresh = store.composeItem('p', { title: 'Write another draft', runAt: NOW + HOUR });
    const sup = supervisor();
    await sup.tick();
    expect(sup.spawnWorker).not.toHaveBeenCalled();
    vi.setSystemTime(NOW + HOUR);
    await sup.tick();
    expect(sup.spawnWorker).toHaveBeenCalledOnce();
    expect(sup.spawnWorker.mock.calls[0][0].id).toBe(fresh.id);
  });

  it('the actual snooze handler leaves running work and its delivery marks alone', () => {
    // Keep the IPC surface's filesystem watcher inside this test's lifetime.
    vi.spyOn(fs, 'watch').mockReturnValue({ close() {} });
    const sup = supervisor();
    sup.stopSession = vi.fn();
    sup.wake = vi.fn();
    const ipcMain = collectingIpcMain();
    registerIpc({ store, supervisor: sup, config: { storeRoot: root }, window: broadcastingWindow(), host: { ...nodeHost(), ipcMain } });
    store.modules.workItemsDisk.updateWorkItem(dir, item.id, { answeredThrough: NOW - 1 }, { source: 'system' });
    const before = store.readItem('p', item.id);
    const reminder = ipcMain.handlers.get('zero:snooze')(null, { product: 'p', id: item.id, snoozedUntil: NOW + HOUR });
    expect(reminder.snoozedUntil).toBe(NOW + HOUR);
    expect(reminder.answeredThrough).toBe(before.answeredThrough);
    expect(reminder.claim).toEqual(before.claim);
    expect(reminder.status).toBe(before.status);
    expect(sup.stopSession).not.toHaveBeenCalled();
    expect(sup.wake).not.toHaveBeenCalled();
    ipcMain.handlers.get('zero:schedule')(null, { product: 'p', id: item.id, runAt: NOW + HOUR });
    expect(sup.stopSession).toHaveBeenCalledWith(item.id);
  });

  it('a reply clears the reminder without adding a second history action', () => {
    const lines = [
      { id: 'w-1', ts: NOW, source: 'founder', patch: { title: 'Review', body: 'Review the draft' } },
      { id: 'w-1', ts: NOW + 1, source: 'founder', patch: { snoozedUntil: NOW + HOUR } },
      { id: 'w-1', ts: NOW + 2, source: 'founder', patch: { answer: 'Revise the opening' } },
      { id: 'w-1', ts: NOW + 3, source: 'founder', patch: { snoozedUntil: 0 } },
    ];
    expect(threadEvents(lines).map(e => e.said)).toEqual(['You opened this', 'You snoozed it', 'You replied']);
  });
});
