// The stranded pass kept the traces it read in a map capped at 500 files, evicted
// oldest-first, and walked its threads in the same order every tick. Past 500
// threads every entry was gone before the next tick reached it, so every log was
// read again. A store measured on 2026-11-04 had 747 threads in that walk. Under
// the cap, each thread still cost a folder listing and a stamp every tick.
//
// Measured here at 900 threads, second pass: 900 logs read and 1,800 folder
// reads and stamps before, none of either after. A run whose trace has no exit
// line yet stays watched, because that line is written after the run is recorded
// as ended. A read that fails stays watched too, so it cannot silence a thread.
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { machineryPath } from '../main/store/home.mjs';
import { Supervisor } from '../main/supervisor.mts';
import { setAppHome, clearAppHome } from './app-home.mjs';

const RAN = (id) => `# A thread\n# ${id} · spawned 2026-08-27T22:25:22.807Z\n\n22:25:29  [Bash] npm test\n22:31:00  == RESULT (ok · 10 out, 30 in) ==\n`;
const CLEAN = (id) => `${RAN(id)}\n# exited (0) 2026-08-27T22:31:01.414Z\n`;
const DEAD = `# A thread\n# w-x · spawned 2026-08-27T20:51:39.445Z\n\nstderr: This directory is untrusted. Trust this folder to continue.\n\n\n# exited (1) 2026-08-27T20:51:40.139Z\n`;

let home, docs, sup, items;
const sessions = (id) => machineryPath(docs, path.join('sessions', id), home);
const logOf = (id, name = '1787863899445.log') => path.join(sessions(id), name);
const onSessions = (spy) => spy.mock.calls.filter(([f]) => String(f).includes(`${path.sep}sessions${path.sep}`)).length;
const logReads = (spy) => spy.mock.calls.filter(([f]) => String(f).endsWith('.log')).length;

const strand = (count, text = CLEAN) => {
  items = Array.from({ length: count }, (_, i) => `w-${String(i).padStart(10, '0')}`)
    .map((id) => ({ id, product: 'agentbox', status: 'open', kind: 'task', labels: ['founder'], title: id, wrote: { body: { ts: 1000, source: 'founder' } } }));
  for (const { id } of items) {
    fs.mkdirSync(sessions(id), { recursive: true });
    fs.writeFileSync(logOf(id), text(id));
    sup._fruitless[`agentbox:${id}`] = { runs: 1, endedAt: 5000 };
  }
};

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'stranded-quiet-home-'));
  docs = fs.mkdtempSync(path.join(os.tmpdir(), 'stranded-quiet-docs-'));
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
});
afterEach(() => {
  vi.restoreAllMocks();
  clearAppHome();
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(docs, { recursive: true, force: true });
});

it('reads nothing at all on the second pass, with 900 threads stranded', () => {
  strand(900);
  sup.sayItOnEveryStrandedRow(items, Date.now(), { budgetMs: Infinity });
  const read = vi.spyOn(fs, 'readFileSync');
  const list = vi.spyOn(fs, 'readdirSync');
  const stat = vi.spyOn(fs, 'statSync');
  sup.sayItOnEveryStrandedRow(items, Date.now(), { budgetMs: Infinity });
  expect(logReads(read)).toBe(0);
  expect(onSessions(list)).toBe(0);
  expect(onSessions(stat)).toBe(0);
  expect(sup.store.written).toHaveLength(0);
});

it('reads nothing at all on the second pass at 500, the old cap', () => {
  strand(500);
  sup.sayItOnEveryStrandedRow(items, Date.now(), { budgetMs: Infinity });
  const read = vi.spyOn(fs, 'readFileSync');
  sup.sayItOnEveryStrandedRow(items, Date.now(), { budgetMs: Infinity });
  expect(logReads(read)).toBe(0);
});

it('speaks for a thread whose next run dies, and reads only that one log', () => {
  strand(900);
  sup.sayItOnEveryStrandedRow(items, Date.now(), { budgetMs: Infinity });
  const id = items[700].id;
  fs.writeFileSync(logOf(id, '1787863999999.log'), DEAD);
  sup._fruitless[`agentbox:${id}`] = { runs: 2, endedAt: 9000 };
  const read = vi.spyOn(fs, 'readFileSync');
  sup.sayItOnEveryStrandedRow(items, Date.now(), { budgetMs: Infinity });
  expect(logReads(read)).toBe(1);
  expect(sup.store.written.map((w) => w.id)).toEqual([id]);
});

it('keeps watching a run whose trace has no exit line yet, and speaks when it arrives', () => {
  strand(3, RAN);
  sup.sayItOnEveryStrandedRow(items, Date.now(), { budgetMs: Infinity });
  expect(sup.store.written).toHaveLength(0);
  const id = items[1].id;
  fs.appendFileSync(logOf(id), '\n# exited (1) 2026-08-27T22:31:01.414Z\n');
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(logOf(id), later, later);
  const read = vi.spyOn(fs, 'readFileSync');
  sup.sayItOnEveryStrandedRow(items, Date.now(), { budgetMs: Infinity });
  expect(logReads(read)).toBe(1);
  expect(sup.store.written.map((w) => w.id)).toEqual([id]);
});

it('a log that cannot be read does not silence the thread', () => {
  strand(3, () => DEAD);
  const id = items[1].id;
  const log = logOf(id);
  const real = fs.readFileSync;
  const refuse = vi.spyOn(fs, 'readFileSync').mockImplementation((file, ...rest) => {
    if (String(file) === log) throw Object.assign(new Error('too many open files'), { code: 'EMFILE' });
    return real(file, ...rest);
  });
  sup.sayItOnEveryStrandedRow(items, Date.now(), { budgetMs: Infinity });
  expect(sup.store.written.map((w) => w.id)).not.toContain(id);
  refuse.mockRestore();
  sup.sayItOnEveryStrandedRow(items, Date.now(), { budgetMs: Infinity });
  expect(sup.store.written.map((w) => w.id)).toContain(id);
});

it('forgets the trace of a thread it has finished with', () => {
  strand(900);
  sup.sayItOnEveryStrandedRow(items, Date.now(), { budgetMs: Infinity });
  sup.sayItOnEveryStrandedRow(items, Date.now(), { budgetMs: Infinity });
  expect(sup._traces.size).toBe(0);
});

it('a thread that is not open is still left alone', () => {
  strand(4);
  items[3] = { ...items[3], status: 'done' };
  fs.writeFileSync(logOf(items[3].id), DEAD);
  sup.sayItOnEveryStrandedRow(items, Date.now(), { budgetMs: Infinity });
  expect(sup.store.written.map((w) => w.id)).not.toContain(items[3].id);
});
