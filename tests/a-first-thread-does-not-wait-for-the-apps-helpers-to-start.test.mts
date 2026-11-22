// A FIRST THREAD DOES NOT WAIT FOR THE APP'S HELPERS TO START.
//
// What broke (w-9993530556, 2026-11-21): a new user's first thread was slow
// enough that they asked whether Agentbox was connected to Claude Code at all.
// Measured on a copy of the app run as the desktop runs it (run host and shared
// tool host on), the real Claude Code and a stand-in model: the first thread
// after a launch paid for three helpers starting one after another, each only
// once its turn came. The folder thread took 90 ms more than when warm, the
// checkout thread 165 ms more, and the run host 214 ms more. On a copy run from
// source, the shared tool host read the store server's code only when the first
// agent connected, and Claude Code waits for every tool server before its first
// model request: 997 ms cold against 72 ms warm.
//
// So the folder and checkout threads are started with the app, the run host is
// started while the thread's folder is being made, and the tool host reads the
// store server as soon as it is listening.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FolderLanes } from '../main/task-folders-offthread.mts';
import { Supervisor } from '../main/supervisor.mts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

function fakeThread() {
  const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
  return {
    posted: [] as unknown[],
    postMessage(m: unknown) { this.posted.push(m); },
    on(event: string, fn: (...a: unknown[]) => void) { (listeners[event] ??= []).push(fn); return this; },
    ref() {}, unref() {}, terminate() {},
    answer(id: number, value: unknown) { for (const fn of listeners.message ?? []) fn({ id, ok: true, value }); },
  };
}

describe('the folder thread', () => {
  it('is started ahead of the first job, and that job runs on it', async () => {
    const made: ReturnType<typeof fakeThread>[] = [];
    const lanes = new FolderLanes({ makeThread: () => { const t = fakeThread(); made.push(t); return t; }, runHere: () => null });
    expect(lanes.warm('start')).toBe(true);
    expect(made).toHaveLength(1);
    const job = lanes.run('restoreTaskFolder', ['/repo', 'w-1']);
    expect(made).toHaveLength(1);
    expect(made[0].posted).toHaveLength(1);
    made[0].answer((made[0].posted[0] as { id: number }).id, { taken: true });
    await expect(job).resolves.toEqual({ taken: true });
  });

  it('is started once however often it is warmed', () => {
    const makeThread = vi.fn(fakeThread);
    const lanes = new FolderLanes({ makeThread, runHere: () => null });
    lanes.warm('start');
    lanes.warm('start');
    expect(makeThread).toHaveBeenCalledTimes(1);
  });

  it('warms the other lane only when asked for it', () => {
    const makeThread = vi.fn(fakeThread);
    const lanes = new FolderLanes({ makeThread, runHere: () => null });
    lanes.warm('start');
    expect(lanes.lanes.tidy.thread).toBeNull();
  });

  it('says so when no thread can start, and the job still runs here', async () => {
    const lanes = new FolderLanes({ makeThread: () => { throw new Error('no threads'); }, runHere: () => 'made here' });
    expect(lanes.warm('start')).toBe(false);
    await expect(lanes.run('restoreTaskFolder', ['/repo', 'w-1'])).resolves.toBe('made here');
  });
});

describe('a local start', () => {
  const standIn = (hostRuns: boolean) => {
    const self = Object.create(Supervisor.prototype);
    Object.assign(self, { hostRuns, _runHost: vi.fn(() => '/tmp/r.sock') });
    return self;
  };

  it('starts the run host while its folder is being made', () => {
    const self = standIn(true);
    self._warmTheStartPath();
    expect(self._runHost).toHaveBeenCalledTimes(1);
  });

  it('starts none where runs are not hosted', () => {
    const self = standIn(false);
    self._warmTheStartPath();
    expect(self._runHost).not.toHaveBeenCalled();
  });

  it('warms them before it asks for its folder', () => {
    const src = read('main/supervisor.mts');
    const spawn = src.slice(src.indexOf('  spawnWorker(item: WorkItem'), src.indexOf('  _startSession(item: WorkItem'));
    expect(spawn.indexOf('this._warmTheStartPath()')).toBeGreaterThan(0);
    expect(spawn.indexOf('this._warmTheStartPath()')).toBeLessThan(spawn.indexOf('this._folderFirst('));
  });
});

it('the desktop app starts the folder and checkout threads at launch, not the run host', () => {
  const main = read('main/main.mts');
  expect(main.indexOf('supervisor.warmTheStartPath()')).toBeGreaterThan(main.indexOf('supervisor.start();'));
  const self = Object.create(Supervisor.prototype);
  Object.assign(self, { hostRuns: true, _runHost: vi.fn() });
  self.warmTheStartPath();
  // The run host leaves after a minute with nothing to run, so starting it at launch buys nothing.
  expect(self._runHost).not.toHaveBeenCalled();
});

it('the tool host reads the store server as soon as it is listening, not when the first agent connects', () => {
  const host = read('main/tool-host.mts');
  const main = host.slice(host.indexOf('async function main()'));
  const listening = main.indexOf('await host.started;');
  expect(listening).toBeGreaterThan(0);
  expect(main.indexOf("import('../mcp/stdio.mts')", listening)).toBeGreaterThan(listening);
});
