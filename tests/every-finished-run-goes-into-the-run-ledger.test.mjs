// EVERY FINISHED RUN GOES INTO THE RUN LEDGER (w-3d0fa23ffb, 2026-10-20).
//
// A level in Rooms comes from agent hours, and nothing on the Mac remembered
// a run once it ended: its length went to PostHog (main/analytics.mjs
// runEndedProps) and the only durable trace was the run's own log,
// `<home>/projects/<project>/sessions/<item>/<startedAt>.log` (361 of them for
// one project on the founder's Mac on 2026-10-20, each opening with
// "# w-… · spawned <ISO>" and ending "# exited (0) <ISO>").
//
// Measured here with throwaway homes: the ledger is written when a run ends
// and read back; a run whose agent never began is not written; cloud runs come
// in from their own ledger; the backfill reads old logs once, only for this
// store's projects, and running it twice counts nothing twice.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendRun, readRuns, runsFromCloudUsage, backfillRuns, allRuns, runLedgerPath } from '../main/run-ledger.mjs';
import { machineryDir } from '../main/store/home.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

describe('the ledger file', () => {
  it('a run written is a run read back, and a broken line loses only itself', () => {
    const home = tmp('runs-home-');
    const file = runLedgerPath(home);
    appendRun({ key: 'w-1:10', at: 20_000, start: 10, item: 'w-1', product: 'p', engine: 'claude', seconds: 20, failed: false }, { file });
    fs.appendFileSync(file, '{not json\n');
    appendRun({ key: 'w-2:30', at: 90_000, start: 30, item: 'w-2', product: 'p', engine: 'codex', seconds: 60, failed: true }, { file });
    expect(readRuns({ file }).map((r) => r.key)).toEqual(['w-1:10', 'w-2:30']);
  });

  it('reading a ledger that does not exist is no runs, not an error', () => {
    expect(readRuns({ file: path.join(tmp('runs-none-'), 'runs.jsonl') })).toEqual([]);
  });
});

describe('cloud runs', () => {
  it('each cloud usage line is one run, keyed by its run id', () => {
    const runs = runsFromCloudUsage([
      { at: '2026-10-20T10:00:00.000Z', runId: 'r1', item: 'w-1', engine: 'claude', exitCode: 0, wallSeconds: 600 },
      { at: '2026-10-20T11:00:00.000Z', runId: 'r2', item: 'w-2', engine: 'claude', exitCode: 1, wallSeconds: 60 },
      { at: '2026-10-20T12:00:00.000Z', runId: 'r3', item: 'w-3', wallSeconds: null },
    ]);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ key: 'cloud:r1', at: Date.parse('2026-10-20T10:00:00.000Z'), seconds: 600, failed: false, where: 'cloud' });
    expect(runs[1].failed).toBe(true);
  });
});

describe('the backfill from old run logs', () => {
  const setup = () => {
    const home = tmp('runs-back-home-');
    const storeRoot = tmp('runs-back-store-');
    const productDir = path.join(storeRoot, 'acct', 'northwind');
    fs.mkdirSync(productDir, { recursive: true });
    const sessions = path.join(machineryDir(productDir, home), 'sessions');
    const write = (item, start, endIso) => {
      fs.mkdirSync(path.join(sessions, item), { recursive: true });
      fs.writeFileSync(path.join(sessions, item, `${start}.log`), `# A task\n# ${item} · spawned ${new Date(start).toISOString()}\n\n# exited (0) ${endIso}\n`);
    };
    // A project outside this store, like a test's temporary one.
    const strayDir = path.join(tmp('runs-stray-'), 'shop');
    fs.mkdirSync(strayDir, { recursive: true });
    const straySessions = path.join(machineryDir(strayDir, home), 'sessions', 'w-zz');
    fs.mkdirSync(straySessions, { recursive: true });
    fs.writeFileSync(path.join(straySessions, '1792000000000.log'), '# x\n\n# exited (0) 2026-10-20T00:00:00.000Z\n');
    return { home, storeRoot, products: [{ slug: 'northwind', dir: productDir }], write, file: runLedgerPath(home) };
  };
  const now = Date.parse('2026-10-20T20:00:00.000Z');

  it('reads each log once into the ledger, for this store’s projects only', async () => {
    const w = setup();
    const start = Date.parse('2026-10-20T16:00:00.000Z');
    w.write('w-abc', start, '2026-10-20T16:30:00.000Z');
    const n = await backfillRuns({ home: w.home, products: w.products, file: w.file, now });
    expect(n).toBe(1);
    expect(readRuns({ file: w.file })).toEqual([expect.objectContaining({ key: `w-abc:${start}`, seconds: 1800, product: 'northwind', item: 'w-abc' })]);
  });

  it('running it twice adds nothing the second time', async () => {
    const w = setup();
    w.write('w-abc', Date.parse('2026-10-20T16:00:00.000Z'), '2026-10-20T16:30:00.000Z');
    await backfillRuns({ home: w.home, products: w.products, file: w.file, now });
    expect(await backfillRuns({ home: w.home, products: w.products, file: w.file, now })).toBe(0);
    expect(readRuns({ file: w.file })).toHaveLength(1);
  });

  it('a run the live ledger already has is not added again', async () => {
    const w = setup();
    const start = Date.parse('2026-10-20T16:00:00.000Z');
    appendRun({ key: `w-abc:${start}`, at: start + 1800_000, start, item: 'w-abc', product: 'northwind', engine: 'claude', seconds: 1800, failed: false }, { file: w.file });
    w.write('w-abc', start, '2026-10-20T16:30:00.000Z');
    await backfillRuns({ home: w.home, products: w.products, file: w.file, now });
    expect(readRuns({ file: w.file })).toHaveLength(1);
  });

  // Codex's review of the build: a run still going when Rooms is switched on
  // was read at its length so far, and that short line outlived the real one.
  it('a log still being written is left for the run to write when it ends', async () => {
    const w = setup();
    const start = now - 10 * 60_000;
    const dir = path.join(machineryDir(w.products[0].dir, w.home), 'sessions', 'w-live');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${start}.log`);
    fs.writeFileSync(file, '# still going\n');
    fs.utimesSync(file, new Date(now - 60_000), new Date(now - 60_000));
    expect(await backfillRuns({ home: w.home, products: w.products, file: w.file, now })).toBe(0);
  });

  it('a log that stopped long ago without a footer (the app crashed) is still read', async () => {
    const w = setup();
    const start = now - 5 * 3600_000;
    const dir = path.join(machineryDir(w.products[0].dir, w.home), 'sessions', 'w-crashed');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${start}.log`);
    fs.writeFileSync(file, '# crashed\n');
    fs.utimesSync(file, new Date(start + 600_000), new Date(start + 600_000));
    expect(await backfillRuns({ home: w.home, products: w.products, file: w.file, now })).toBe(1);
  });

  it('logs older than 400 days are left alone', async () => {
    const w = setup();
    const old = now - 401 * 86_400_000;
    w.write('w-old', old, new Date(old + 600_000).toISOString());
    expect(await backfillRuns({ home: w.home, products: w.products, file: w.file, now })).toBe(0);
  });
});

describe('all runs, as the room reads them', () => {
  it('the ledger and the cloud together, each once', () => {
    const home = tmp('runs-all-');
    const file = runLedgerPath(home);
    appendRun({ key: 'w-1:10', at: 1_000_000, start: 10, item: 'w-1', product: 'p', engine: 'claude', seconds: 100, failed: false }, { file });
    appendRun({ key: 'w-1:10', at: 1_000_000, start: 10, item: 'w-1', product: 'p', engine: 'claude', seconds: 100, failed: false }, { file });
    const cloud = [{ at: '2026-10-20T10:00:00.000Z', runId: 'r1', item: 'w-9', engine: 'claude', exitCode: 0, wallSeconds: 300 }];
    expect(allRuns({ file, cloudLines: cloud }).map((r) => r.key).sort()).toEqual(['cloud:r1', 'w-1:10']);
  });
});

describe('the supervisor writes a run when it ends', () => {
  const make = () => {
    const appDir = tmp('runs-sup-app-');
    const userDir = tmp('runs-sup-user-');
    const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
    const s = new Supervisor({ storeRoot: userDir, maxConcurrentSessions: 1 }, store, appDir, appDir, userDir);
    s.runLedger = runLedgerPath(tmp('runs-sup-home-'));
    return s;
  };
  const item = { id: 'w-abc', product: 'northwind' };

  it('a run whose agent began is written with its length', () => {
    const s = make();
    const start = Date.now() - 90_000;
    s._recordRun(item, { startedAt: start, sessionId: 's-1', engine: 'claude', exitFailed: false });
    const [r] = readRuns({ file: s.runLedger });
    expect(r).toMatchObject({ key: `w-abc:${start}`, item: 'w-abc', product: 'northwind', engine: 'claude', failed: false });
    expect(r.seconds).toBeGreaterThanOrEqual(89);
  });

  it('a failed run is written too', () => {
    const s = make();
    s._recordRun(item, { startedAt: Date.now() - 5_000, result: 'boom', engine: 'claude', exitFailed: true });
    expect(readRuns({ file: s.runLedger })[0].failed).toBe(true);
  });

  it('a run whose agent never began is not', () => {
    const s = make();
    s._recordRun(item, { startedAt: Date.now() - 500, engine: 'claude', exitFailed: true });
    expect(readRuns({ file: s.runLedger })).toEqual([]);
  });

  it('a cloud run is left to the cloud ledger', () => {
    const s = make();
    s._recordRun(item, { startedAt: Date.now() - 60_000, sessionId: 's-2', cloud: true, engine: 'claude' });
    expect(readRuns({ file: s.runLedger })).toEqual([]);
  });

  it('settleExit records the run', () => {
    const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'main', 'supervisor.mjs'), 'utf8');
    const settle = src.slice(src.indexOf('const settleExit = '), src.indexOf('const settleExit = ') + 1500);
    expect(settle).toMatch(/this\._recordRun\(item, session\)/);
  });
});

describe('my hours, as my presence row reads them', () => {
  it('the old logs are read once, and the summary follows the ledger as it grows', async () => {
    const { createRoomHours } = await import('../main/team/room-hours.mjs');
    const home = tmp('runs-hours-home-');
    const storeRoot = tmp('runs-hours-store-');
    const productDir = path.join(storeRoot, 'acct', 'northwind');
    fs.mkdirSync(productDir, { recursive: true });
    const sessions = path.join(machineryDir(productDir, home), 'sessions', 'w-old');
    fs.mkdirSync(sessions, { recursive: true });
    const now = Date.parse('2026-10-20T20:00:00.000Z');
    const start = now - 3 * 3600_000;
    fs.writeFileSync(path.join(sessions, `${start}.log`), `# x\n\n# exited (0) ${new Date(start + 3600_000).toISOString()}\n`);
    const hours = createRoomHours({ home, products: () => [{ slug: 'northwind', dir: productDir }], now: () => now });
    await hours.backfillOnce();
    expect(hours.summary().total).toBeCloseTo(1);
    expect(await hours.backfillOnce()).toBeUndefined();
    appendRun({ key: 'w-new:1', at: now - 60_000, start: now - 1800_000 - 60_000, item: 'w-new', product: 'northwind', engine: 'claude', seconds: 1800, failed: false }, { file: runLedgerPath(home) });
    expect(hours.summary().total).toBeCloseTo(1.5);
    const again = createRoomHours({ home, products: () => [{ slug: 'northwind', dir: productDir }], now: () => now });
    await again.backfillOnce();
    expect(readRuns({ file: runLedgerPath(home) })).toHaveLength(2);
  });
});

describe('whose cloud runs count', () => {
  // Measured 2026-10-20 on three copies run side by side: each read this Mac's
  // own ~/.agentbox/cloud-usage.jsonl and wore its owner's level, 18.
  it('a copy with a home of its own reads the cloud runs in that home, not this Mac’s', async () => {
    const { roomsSetup } = await import('../main/team/room-setup.mjs');
    const { envName } = await import('../shared/product-name.mjs');
    const home = tmp('runs-copy-home-');
    fs.writeFileSync(path.join(home, 'cloud-usage.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), runId: 'r-own', item: 'w-1', wallSeconds: 3600 })}\n`);
    const key = envName('HOME');
    const was = process.env[key];
    process.env[key] = home;
    try {
      const store = { listProducts: () => [], readItem: () => null };
      const setup = roomsSetup({ config: { storeRoot: home, alphaRooms: true }, store, supervisor: { runsGoing: () => [] }, userDir: home, log: () => {} });
      const { summary } = setup.presenceFacts();
      expect(summary.total).toBeCloseTo(1);
    } finally {
      if (was === undefined) delete process.env[key]; else process.env[key] = was;
    }
  });
});
