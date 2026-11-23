// The app says which of its functions its main thread spent a minute on.
//
// 2026-11-22: the main process ran at 40 to 120% of a core all day, over 40%
// with almost nothing running, and nothing on the Mac could say on what. The
// freeze log names a function only for a hold of half a second or more, and
// that afternoon it went quiet for six hours while the load went on; a sample
// from outside the app shows its JavaScript as unnamed addresses. The freeze
// recorder already keeps a CPU profile of the thread, so it now writes what
// the last stretch went to, to cpu-<day>.jsonl beside the memory log: every
// 15 minutes, and at the next turn of the profile when asked with a file.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { stripTypesFlags } from '../main/strip-types.mts';
import { busyFrom, writeBusy, CPU_ASK } from '../main/freeze-recorder.mts';
import type { CpuProfile } from '../main/freeze-recorder.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = '/apps/agentbox';
const frame = (functionName: string, file = '', lineNumber = 0) => ({ functionName, url: file ? `file://${file}` : '', lineNumber });

// root -> listItems (main/store.mts:438) -> readRows (main/store/work-items.mts:398)
//      -> parse (a dependency)   -> (garbage collector)   -> (idle)
const profile = (samples: number[]): CpuProfile => ({
  startTime: 1_000_000,
  nodes: [
    { id: 1, callFrame: frame('(root)'), children: [2, 5, 6, 7] },
    { id: 2, callFrame: frame('listItems', `${APP}/main/store.mts`, 437), children: [3, 4] },
    { id: 3, callFrame: frame('readRows', `${APP}/main/store/work-items.mts`, 397) },
    { id: 4, callFrame: frame('parse', `${APP}/node_modules/dep/index.js`, 9) },
    { id: 5, callFrame: frame('(garbage collector)') },
    { id: 6, callFrame: frame('(idle)') },
    { id: 7, callFrame: frame('secret', '/Users/someone/private/tool.js', 3) },
  ],
  samples,
  timeDeltas: samples.map(() => 25_000),
});

let dir: string;
afterEach(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

describe('what the main thread spent a stretch on', () => {
  it('names each of our functions by the share of busy time inside it and at it', () => {
    // 4 in readRows, 2 in listItems itself, 2 in a dependency under listItems, 1 collecting, 1 elsewhere, 10 idle.
    const read = busyFrom([{ profile: profile([3, 3, 3, 3, 2, 2, 4, 4, 5, 7, ...Array(10).fill(6)]) }], { appDir: APP });
    expect(read.samples).toBe(20);
    expect(read.ms).toBe(500);
    expect(read.busy).toBe(0.5);
    expect(read.gc).toBe(0.1);
    expect(read.inside).toEqual([
      { fn: 'listItems main/store.mts:438', share: 0.8 },
      { fn: 'readRows main/store/work-items.mts:398', share: 0.4 },
    ]);
    // The deepest of ours on the stack: the dependency's time is listItems'.
    expect(read.deepest.slice(0, 2)).toEqual([
      { fn: 'listItems main/store.mts:438', share: 0.4 },
      { fn: 'readRows main/store/work-items.mts:398', share: 0.4 },
    ]);
    expect(read.stacks[0]).toEqual({ share: 0.4, frames: ['readRows main/store/work-items.mts:398', 'listItems main/store.mts:438'] });
  });

  it('reads an idle stretch as idle, with no shares of nothing', () => {
    const read = busyFrom([{ profile: profile(Array(8).fill(6)) }], { appDir: APP });
    expect(read).toMatchObject({ samples: 8, busy: 0, gc: 0, inside: [], deepest: [], stacks: [] });
  });

  it('never writes a path outside the app', () => {
    const read = busyFrom([{ profile: profile([7, 7, 4]) }], { appDir: APP });
    expect(JSON.stringify(read)).not.toContain('/Users/someone');
    expect(read.inside).toEqual([{ fn: 'listItems main/store.mts:438', share: 0.33 }]);
  });

  it('keeps a week of its own files and leaves the freeze log alone', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpu-lines-'));
    fs.writeFileSync(path.join(dir, 'cpu-2026-11-01.jsonl'), '{}\n');
    fs.writeFileSync(path.join(dir, 'freeze-2026-11-01.jsonl'), '{}\n');
    const line = { at: '2026-11-22T20:00:00.000Z', ...busyFrom([{ profile: profile([3, 6]) }], { appDir: APP }) };
    writeBusy(dir, line);
    writeBusy(dir, line);
    const names = fs.readdirSync(dir).sort();
    expect(names.filter((n) => n.startsWith('cpu-'))).toHaveLength(1);
    expect(names).toContain('freeze-2026-11-01.jsonl');
    const kept = names.find((n) => n.startsWith('cpu-'))!;
    expect(fs.readFileSync(path.join(dir, kept), 'utf8').trim().split('\n')).toHaveLength(2);
  });
});

describe('the running recorder', () => {
  const run = async (ask: boolean) => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpu-ask-'));
    const log = path.join(dir, 'log');
    fs.mkdirSync(log);
    if (ask) fs.writeFileSync(path.join(log, CPU_ASK), '');
    const script = path.join(dir, 'busy.mjs');
    // Bursts well under the half second that counts as a freeze.
    fs.writeFileSync(script, `
      import { startFreezeRecorder } from ${JSON.stringify(path.join(ROOT, 'main', 'freeze-recorder.mts'))};
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      function rebuildsTheInbox() { const end = Date.now() + 120; let x = 0; while (Date.now() < end) { for (let i = 0; i < 1e5; i += 1) x = (x + i) | 0; } return x; }
      const rec = startFreezeRecorder({ dir: ${JSON.stringify(log)}, appDir: ${JSON.stringify(dir)}, rotateMs: 700 });
      await wait(300);
      for (let n = 0; n < 14; n += 1) { rebuildsTheInbox(); await wait(40); }
      await wait(900);
      rec.stop();
    `);
    await promisify(execFile)(process.execPath, [...stripTypesFlags(), script], { timeout: 30_000 });
    return fs.readdirSync(log);
  };

  it('writes the stretch when asked, and takes the ask away', async () => {
    const names = await run(true);
    expect(names).not.toContain(CPU_ASK);
    const file = names.find((n) => /^cpu-\d{4}-\d{2}-\d{2}\.jsonl$/.test(n));
    expect(file).toBeTruthy();
    const lines = fs.readFileSync(path.join(dir, 'log', file!), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toHaveLength(1);
    expect(lines[0].deepest[0].fn).toBe('rebuildsTheInbox busy.mjs:4');
    // Inside it too, under the script's own top level, which holds everything.
    expect(lines[0].inside.find((f: { fn: string }) => f.fn === 'rebuildsTheInbox busy.mjs:4').share).toBeGreaterThan(0.5);
    expect(lines[0].busy).toBeGreaterThan(0.3);
    // No hold reached half a second, so the freeze log has nothing to say.
    expect(names.filter((n) => n.startsWith('freeze-'))).toEqual([]);
  }, 40_000);

  it('writes nothing in its first minutes when nobody asked', async () => {
    expect(await run(false)).toEqual([]);
  }, 40_000);
});
