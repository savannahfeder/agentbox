// The first pass after this landed has every stuck thread's log to read at once,
// and how long that takes depends on how many there are and how big they are,
// which nothing bounds. Made-up store of 5,000 threads with 200 KB logs: one pass
// read 1 GB and held the thread 5.8 s. So a pass reads what it can inside a
// budget, the next tick picks up where it left off, and it always reads at least
// one so it cannot stall.
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { machineryPath } from '../main/store/home.mjs';
import { Supervisor } from '../main/supervisor.mts';
import { setAppHome, clearAppHome } from './app-home.mjs';

const CLEAN = (id) => `# A thread\n# ${id} · spawned 2026-08-27T22:25:22.807Z\n\n22:25:29  [Bash] npm test\n\n# exited (0) 2026-08-27T22:31:01.414Z\n`;

let home, docs, sup, items;
const logOf = (id) => path.join(machineryPath(docs, path.join('sessions', id), home), '1787863899445.log');
const logReads = (spy) => spy.mock.calls.filter(([f]) => String(f).endsWith('.log')).length;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'stranded-budget-home-'));
  docs = fs.mkdtempSync(path.join(os.tmpdir(), 'stranded-budget-docs-'));
  setAppHome(home);
  const store = {
    listItems: () => items,
    listProducts: () => [{ slug: 'agentbox', name: 'Agentbox', dir: docs }],
    isDue: () => true,
    written: [],
    recordSessionResult(product, id, patch) { this.written.push({ product, id, ...patch }); return { wrote: { result: { ts: Date.now() } } }; },
  };
  sup = new Supervisor({ storeRoot: home, maxConcurrentSessions: 3 }, store, home);
  sup._saveState = () => {};
  items = Array.from({ length: 20 }, (_, i) => `w-${String(i).padStart(10, '0')}`)
    .map((id) => ({ id, product: 'agentbox', status: 'open', kind: 'task', labels: ['founder'], title: id, wrote: { body: { ts: 1000, source: 'founder' } } }));
  for (const { id } of items) {
    fs.mkdirSync(path.dirname(logOf(id)), { recursive: true });
    fs.writeFileSync(logOf(id), CLEAN(id));
    sup._fruitless[`agentbox:${id}`] = { runs: 1, endedAt: 5000 };
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  clearAppHome();
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(docs, { recursive: true, force: true });
});

it('reads the lot in one pass when they fit in the budget', () => {
  const read = vi.spyOn(fs, 'readFileSync');
  sup.sayItOnEveryStrandedRow(items, Date.now(), { budgetMs: Infinity });
  expect(logReads(read)).toBe(20);
});

it('reads one a pass when none of them fit, and a different one each time', () => {
  for (let pass = 0; pass < 3; pass += 1) {
    const read = vi.spyOn(fs, 'readFileSync');
    sup.sayItOnEveryStrandedRow(items, Date.now(), { budgetMs: 0 });
    expect(logReads(read)).toBe(1);
    vi.restoreAllMocks();
  }
  expect(sup._traces.size + Object.values(sup._fruitless).filter((s) => s.quietAt != null).length).toBe(3);
});

it('gets through all of them over enough ticks', () => {
  for (let pass = 0; pass < 20; pass += 1) sup.sayItOnEveryStrandedRow(items, Date.now(), { budgetMs: 0 });
  const read = vi.spyOn(fs, 'readFileSync');
  sup.sayItOnEveryStrandedRow(items, Date.now(), { budgetMs: 0 });
  expect(logReads(read)).toBe(0);
});
