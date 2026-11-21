// THE APP'S OWN SMALL MODEL RUNS WAIT WHILE AN AGENT IS STARTING.
//
// What broke (w-9993530556, 2026-11-21): a new user's first thread took long
// enough to start that they asked whether Agentbox was connected to Claude
// Code at all. Measured on a copy of the app with the real Claude Code and a
// stand-in model, a 2-core machine: the tick named the new row and gave it a
// level before it started the worker, so two more Claude Code processes booted
// beside the worker's own. With them, the worker's first model request came
// 1.7 to 2.0 s after the thread was sent (three tries); without them, 0.84 to
// 1.1 s. After setup's chat import there are three more, one per imported chat.
//
// Naming, levelling, sorting a message and catching up an imported chat are
// tidying nothing waits on, so they now wait while a local agent is between
// being asked for and having booted (its folder being made, or its process up
// without its session id yet), and run on the next pass once it has.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mts';

const NOW = 1_800_000_000_000;
const ME = 'me-1';
const named = { id: 'w-aaaaaaaaaa', product: 'p', status: 'open', title: 'I have been thinking about the inbox and', body: 'x', updatedAt: NOW - 1000 };
const levelled = { id: 'w-bbbbbbbbbb', product: 'p', status: 'open', title: 'Fix the login page', body: '', priority: 0, createdBy: ME, createdAt: NOW - 1000, labels: ['founder'], wrote: { priority: { source: 'system', ts: 1 } } };

function standIn({ sessions = [], preparing = [] }: { sessions?: object[]; preparing?: string[] } = {}) {
  const asked = vi.fn(async () => '');
  const self = Object.create(Supervisor.prototype);
  Object.assign(self, {
    _memReading: null,
    _askSmall: asked,
    _askLevel: asked,
    sessions: new Map(sessions.map((s, i) => [`w-run${i}`, s])),
    _preparing: new Map(preparing.map((id) => [id, { item: { id } }])),
    store: { nameItem() {}, prioritizeItem() {}, listProducts: () => [{ slug: 'p' }] },
  });
  return { self, asked };
}

const booting = { cloud: false, startedAt: NOW - 2000 };

describe('while a local agent is starting', () => {
  it('a row is not named and a task is not given a level', () => {
    const { self, asked } = standIn({ sessions: [booting] });
    expect(self.nameTheRows([named], NOW)).toBeUndefined();
    expect(self.levelTheTasks([levelled], ME, NOW)).toBeUndefined();
    expect(asked).not.toHaveBeenCalled();
    expect(self._nameMisses?.size ?? 0).toBe(0);
  });

  it('nor while its folder is still being made', () => {
    const { self, asked } = standIn({ preparing: ['w-cccccccccc'] });
    self.nameTheRows([named], NOW);
    self.levelTheTasks([levelled], ME, NOW);
    expect(asked).not.toHaveBeenCalled();
  });

  it('nor is an imported chat caught up', async () => {
    const { self, asked } = standIn({ sessions: [booting] });
    await self.catchUpTheImports([{ ...named, labels: ['catch-up'], result: 'done' }], NOW);
    expect(asked).not.toHaveBeenCalled();
  });
});

describe('the tidying goes ahead', () => {
  it('once the agent has said its session id', async () => {
    const { self, asked } = standIn({ sessions: [{ ...booting, sessionId: 's-1' }] });
    await self.nameTheRows([named], NOW);
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it('when the agent is in the cloud, which uses nothing of this computer', async () => {
    const { self, asked } = standIn({ sessions: [{ ...booting, cloud: true }] });
    await self.nameTheRows([named], NOW);
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it('when a run never said an id and has been up past the boot window', async () => {
    const { self, asked } = standIn({ sessions: [{ cloud: false, startedAt: NOW - 20_001 }] });
    await self.nameTheRows([named], NOW);
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it('after a minute of waiting, even with starts still coming', async () => {
    const { self, asked } = standIn({ sessions: [booting] });
    self.nameTheRows([named], NOW - 60_000);
    expect(asked).not.toHaveBeenCalled();
    await self.nameTheRows([named], NOW);
    expect(asked).toHaveBeenCalledTimes(1);
  });
});

it('the pass that held the tidying runs again as soon as the agent has booted', () => {
  const { self } = standIn({ sessions: [booting] });
  self.wake = vi.fn();
  self.nameTheRows([named], NOW);
  self.sessions.get('w-run0').sessionId = 's-1';
  self._tidyingCanGo();
  expect(self.wake).toHaveBeenCalledTimes(1);
  // Said once: a second id arriving with nothing held wakes nothing.
  self._tidyingCanGo();
  expect(self.wake).toHaveBeenCalledTimes(1);
});

it('the tick asks the tidying after it has started what is queued, not before', () => {
  const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'main', 'supervisor.mts'), 'utf8');
  const tick = source.slice(source.indexOf('  async _tick() {'), source.indexOf('// The digest: NOT a schedule'));
  const queued = tick.indexOf('this._startFromTheQueue(item);');
  expect(queued).toBeGreaterThan(0);
  for (const pass of ['this.nameTheRows(', 'this.catchUpTheImports(', 'this.sortTheMessages(', 'this.levelTheTasks(']) {
    expect(tick.indexOf(pass), pass).toBeGreaterThan(queued);
  }
  // Routing a thread sent to Auto decides who does it, so it stays ahead of the queue.
  expect(tick.indexOf('this.routeTheThreads(')).toBeLessThan(queued);
});
