// The CPU record says what a named function spent its time on.
//
// 2026-11-23: the window's request for the inbox was 13% of the main thread's
// busy time, the biggest single thing left, and the record could not say on
// what. It keeps the twenty biggest functions, and the request's time is
// spread over more than that, none of them past 1%. An ask may now name a
// function: the record then adds what that function's time went to, by the
// function it called, and keeps sixty rows rather than twenty.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { stripTypesFlags } from '../main/strip-types.mts';
import { busyFrom, CPU_ASK } from '../main/freeze-recorder.mts';
import type { CpuProfile } from '../main/freeze-recorder.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = '/apps/agentbox';
const frame = (functionName: string, file = '', lineNumber = 0) => ({ functionName, url: file ? `file://${file}` : '', lineNumber });

// root -> listItems (main/store.mts:438) -> readRows (main/store/work-items.mts:398)
//      -> parse (a dependency)   -> (garbage collector)   -> (idle)   -> secret (outside the app)
const profile = (samples: number[]): CpuProfile => ({
  startTime: 1_000_000,
  nodes: [
    { id: 1, callFrame: frame('(root)'), children: [2, 5, 6, 7] },
    { id: 2, callFrame: frame('listItems', `${APP}/main/store.mts`, 437), children: [3, 4] },
    { id: 3, callFrame: frame('readRows', `${APP}/main/store/work-items.mts`, 397) },
    { id: 4, callFrame: frame('parse', `${APP}/node_modules/dep/index.js`, 9) },
    { id: 5, callFrame: frame('(garbage collector)') },
    { id: 6, callFrame: frame('(idle)') },
    { id: 7, callFrame: frame('secret', '/Users/someone/private/tool.js', 3), children: [8] },
    { id: 8, callFrame: frame('inner', '/Users/someone/private/tool.js', 9) },
  ],
  samples,
  timeDeltas: samples.map(() => 25_000),
});
// 4 in readRows, 2 in listItems itself, 2 in a dependency under it, 1 collecting, 1 elsewhere, 10 idle.
const STRETCH = [3, 3, 3, 3, 2, 2, 4, 4, 5, 8, ...Array(10).fill(6)];

let dir = '';
afterEach(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

describe('a record asked about one function', () => {
  it('says the share of busy time inside it and which calls of its own that went to', () => {
    const read = busyFrom([{ profile: profile(STRETCH) }], { appDir: APP, under: 'listItems' });
    expect(read.under).toEqual({
      fn: 'listItems main/store.mts:438',
      share: 0.8,
      calls: [
        { fn: 'readRows main/store/work-items.mts:398', share: 0.4 },
        { fn: '(itself)', share: 0.2 },
        { fn: 'parse node_modules/dep/index.js:10', share: 0.2 },
      ],
    });
  });

  it('takes a file and line as readily as a name', () => {
    const read = busyFrom([{ profile: profile(STRETCH) }], { appDir: APP, under: 'main/store.mts:438' });
    expect(read.under).toMatchObject({ fn: 'listItems main/store.mts:438', share: 0.8 });
  });

  it('says so plainly when nothing by that name ran', () => {
    const read = busyFrom([{ profile: profile(STRETCH) }], { appDir: APP, under: 'neverCalled' });
    expect(read.under).toEqual({ fn: 'neverCalled', share: 0, calls: [] });
  });

  it('never writes a path outside the app, in the function or its calls', () => {
    const read = busyFrom([{ profile: profile(STRETCH) }], { appDir: APP, under: 'secret' });
    expect(read.under?.share).toBe(0.1);
    expect(JSON.stringify(read)).not.toContain('/Users/someone');
  });
});

describe('a record nobody asked a function of', () => {
  it('carries no such part, and is what it was', () => {
    const read = busyFrom([{ profile: profile(STRETCH) }], { appDir: APP });
    expect('under' in read).toBe(false);
    expect(read.inside[0]).toEqual({ fn: 'listItems main/store.mts:438', share: 0.8 });
  });

  it('keeps twenty rows, where an asked one may keep more', () => {
    const many: CpuProfile = {
      startTime: 1_000_000,
      nodes: [
        { id: 1, callFrame: frame('(root)'), children: Array.from({ length: 30 }, (_, n) => n + 2) },
        ...Array.from({ length: 30 }, (_, n) => ({ id: n + 2, callFrame: frame(`step${n}`, `${APP}/main/steps.mts`, n) })),
      ],
      samples: Array.from({ length: 30 }, (_, n) => n + 2),
      timeDeltas: Array.from({ length: 30 }, () => 25_000),
    };
    expect(busyFrom([{ profile: many }], { appDir: APP }).deepest).toHaveLength(20);
    expect(busyFrom([{ profile: many }], { appDir: APP, keep: 60 }).deepest).toHaveLength(30);
  });
});

describe('the running recorder', () => {
  const run = async (asking: string) => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpu-under-'));
    const log = path.join(dir, 'log');
    fs.mkdirSync(log);
    fs.writeFileSync(path.join(log, CPU_ASK), asking);
    const script = path.join(dir, 'busy.mjs');
    // Bursts well under the half second that counts as a freeze.
    fs.writeFileSync(script, `
      import { startFreezeRecorder } from ${JSON.stringify(path.join(ROOT, 'main', 'freeze-recorder.mts'))};
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      function rebuildsTheInbox() { const end = Date.now() + 120; let x = 0; while (Date.now() < end) { for (let i = 0; i < 1e5; i += 1) x = (x + i) | 0; } return x; }
      const rec = startFreezeRecorder({ dir: ${JSON.stringify(log)}, appDir: ${JSON.stringify(dir)}, rotateMs: 700 });
      await wait(300);
      for (let n = 0; n < 24; n += 1) { rebuildsTheInbox(); await wait(40); }
      await wait(1500);
      rec.stop();
    `);
    await promisify(execFile)(process.execPath, [...stripTypesFlags(), script], { timeout: 30_000 });
    const names = fs.readdirSync(log);
    const file = names.find((n) => /^cpu-\d{4}-\d{2}-\d{2}\.jsonl$/.test(n));
    return { names, lines: file ? fs.readFileSync(path.join(log, file), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [] };
  };

  it('answers an ask that names a function with what that function\'s time went to', async () => {
    // Asked by the script's file: on a loaded computer the profiler credits a function just compiled to its caller.
    const { names, lines } = await run('busy.mjs\n');
    expect(names).not.toContain(CPU_ASK);
    expect(lines).toHaveLength(1);
    expect(lines[0].under.fn).toMatch(/ busy\.mjs:\d+$/);
    // Loading the recorder's own modules is busy time too, and on a loaded GitHub Mac it reached half.
    expect(lines[0].under.share).toBeGreaterThan(0.3);
    expect(lines[0].under.calls.length).toBeGreaterThan(0);
  }, 40_000);

  it('answers an empty ask as it always did, with no such part', async () => {
    const { lines } = await run('');
    expect(lines).toHaveLength(1);
    expect('under' in lines[0]).toBe(false);
  }, 40_000);
});
