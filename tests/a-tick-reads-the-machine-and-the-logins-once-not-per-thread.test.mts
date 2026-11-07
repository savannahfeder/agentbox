// Every 12 s the agents' clock asks, for each waiting thread, whether there is
// room to start it. Each ask read the machine's CPU list and every login's file
// again. On a fake store with 632 waiting threads (scripts/scratch/perf,
// 2026-11-02) one tick called os.cpus() 2,528 times and fs.statSync 6,489
// times, and held the main thread 210 to 350 ms, every tick, with nobody
// touching the app. Counted here by the calls themselves.
import { it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { machineSlots, autoAgents } from '../main/machine.mjs';
import { Supervisor } from '../main/supervisor.mts';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it('reads the machine once however often it is asked', () => {
  const cpus = vi.spyOn(os, 'cpus');
  const mem = vi.spyOn(os, 'totalmem');
  for (let i = 0; i < 100; i += 1) { machineSlots(); autoAgents({ gated: true }); }
  expect(cpus.mock.calls.length).toBeLessThanOrEqual(1);
  expect(mem.mock.calls.length).toBeLessThanOrEqual(1);
});

it('still answers for a machine it is told about', () => {
  expect(machineSlots({ memBytes: 16 * 1024 ** 3, cores: 10 }).slots).toBe(4);
  expect(machineSlots({ memBytes: 64 * 1024 ** 3, cores: 4 }).slots).toBe(2);
  expect(machineSlots({ memBytes: 0, cores: 0 }).known).toBe(false);
});

function aMac() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tick-logins-'));
  const login = (folder, email, uuid) => {
    fs.mkdirSync(path.join(home, folder), { recursive: true });
    fs.writeFileSync(path.join(home, folder, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: email, accountUuid: uuid } }));
    // A new folder in the home must read as new even inside one clock second.
    const later = new Date(Date.now() + Math.random() * 1e6);
    fs.utimesSync(home, later, later);
  };
  login('.claude', 'a@x.test', 'uuid-a');
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
  const sup = new Supervisor({ storeRoot: home, home }, store, home);
  sup._saveState = () => {};
  return { home, login, sup };
}

it('asks the disk for the logins once in a tick, not once per thread', () => {
  const { sup } = aMac();
  sup._ticking = true;
  sup._profiles();
  const stat = vi.spyOn(fs, 'statSync');
  const exists = vi.spyOn(fs, 'existsSync');
  for (let i = 0; i < 50; i += 1) sup._profiles();
  expect(stat.mock.calls.length + exists.mock.calls.length).toBe(0);
});

it('outside a tick a new login is seen at once', () => {
  const { login, sup } = aMac();
  expect(sup._profiles()).toHaveLength(1);
  login('.claude-work', 'b@x.test', 'uuid-b');
  expect(sup._profiles()).toHaveLength(2);
});

it('inside a long tick a new login is seen within a second', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const { login, sup } = aMac();
  sup._ticking = true;
  expect(sup._profiles()).toHaveLength(1);
  login('.claude-work', 'b@x.test', 'uuid-b');
  vi.setSystemTime(Date.now() + 999);
  expect(sup._profiles()).toHaveLength(1);
  vi.setSystemTime(Date.now() + 2);
  expect(sup._profiles()).toHaveLength(2);
});
