// A FREEZE NAMES THE FUNCTION THAT HELD THE APP.
//
// What broke (w-1b1a14000a, 2026-10-21): the spinning wheel came a few times a
// day for weeks, and each fix found one cause by profiling the app while
// somebody watched. The minute line said how long the longest freeze was, and
// named a request only when the window had asked for one; a timer, a worker's
// exit or a store pass that froze the app left no name at all.
//
// Now a thread of its own keeps a CPU profile of the main thread and, when the
// main thread stops answering for half a second, writes which function held
// it. Measured: in a Node process and in Electron 43's main process, a 900 ms
// loop and a 1.2 s execFileSync were each written with the function and line
// that held them, and a 200 ms hold was not. Running it costs no measurable
// throughput, and its once-a-minute profile handover moved the worst pause
// in a busy process from 25.6 to 28.6 ms.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { freezeFrom, writeFreeze, dayOf } from '../main/freeze-recorder.mjs';
import { stallWatch } from '../main/stall-watch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = [];
const tempDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'freeze-')); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });

describe('an app whose main thread stops answering', () => {
  // The app's folder is reached through a link, as macOS's /var is
  // /private/var, and the profile names files by their real path.
  it('writes which function held it, for a loop and for a wait on a program, and not for a short hold', async () => {
    const dir = path.join(tempDir(), 'app');
    fs.symlinkSync(tempDir(), dir);
    const script = path.join(dir, 'freezes.mjs');
    fs.writeFileSync(script, `
      import { execFileSync } from 'node:child_process';
      import { startFreezeRecorder } from ${JSON.stringify(path.join(ROOT, 'main', 'freeze-recorder.mjs'))};
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      function holdsTheThreadInALoop(ms) { const end = Date.now() + ms; let x = 0; while (Date.now() < end) x += Math.sqrt(x + 1); return x; }
      function holdsTheThreadOnAProgram() { execFileSync('sleep', ['1']); }
      const rec = startFreezeRecorder({ dir: ${JSON.stringify(path.join(dir, 'log'))}, appDir: ${JSON.stringify(dir)} });
      await wait(800);
      holdsTheThreadInALoop(900);
      await wait(700);
      holdsTheThreadOnAProgram();
      await wait(700);
      holdsTheThreadInALoop(150);
      await wait(1500);
      rec.stop();
    `);
    await promisify(execFile)(process.execPath, [script], { timeout: 30_000 });
    const lines = fs.readdirSync(path.join(dir, 'log'))
      .flatMap((f) => fs.readFileSync(path.join(dir, 'log', f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    expect(lines.map((l) => l.where)).toEqual([
      'holdsTheThreadInALoop freezes.mjs:5',
      'holdsTheThreadOnAProgram freezes.mjs:6',
    ]);
    expect(lines[0].ms).toBeGreaterThanOrEqual(850);
    expect(lines[1].stacks[0].frames.join(' < ')).toMatch(/execFileSync node:child_process:\d+ < holdsTheThreadOnAProgram freezes\.mjs:6/);
  }, 40_000);
});

// A profile in the shape the inspector hands back: one node per call path.
function aProfile(stacks, { stepUs = 10_000 } = {}) {
  const nodes = [{ id: 1, callFrame: { functionName: '(root)', url: '', lineNumber: -1 }, children: [] }];
  const idOf = new Map();
  const samples = [];
  for (const stack of stacks) {
    let parent = 1;
    let key = '';
    for (const [fn, url = '', line = 0] of stack) {
      key += `>${fn}@${url}:${line}`;
      if (!idOf.has(key)) {
        const id = nodes.length + 1;
        nodes.push({ id, callFrame: { functionName: fn, url, lineNumber: line - 1 }, children: [] });
        nodes.find((n) => n.id === parent).children.push(id);
        idOf.set(key, id);
      }
      parent = idOf.get(key);
    }
    samples.push(parent);
  }
  return { nodes, startTime: 0, samples, timeDeltas: samples.map(() => stepUs) };
}

describe('reading what held it off the profile', () => {
  const app = '/Applications/Agentbox.app/Contents/Resources/app';
  const git = [['settleExit', `file://${app}/main/supervisor.mjs`, 8990], ['changeFromRepo', `file://${app}/main/git-change.mjs`, 262], ['execFileSync', 'node:child_process', 941], ['spawn']];

  it('names our own deepest function, not the native call under it', () => {
    const read = freezeFrom([{ profile: aProfile(Array(50).fill(git)) }], { fromUs: 0, toUs: 1e9, appDir: app });
    expect(read.where).toBe('changeFromRepo main/git-change.mjs:262');
    expect(read.busy).toBe(1);
  });

  it('counts only the samples inside the freeze', () => {
    const before = Array(30).fill([['(idle)']]);
    const read = freezeFrom([{ profile: aProfile([...before, ...Array(20).fill(git)]) }], { fromUs: 310_000, toUs: 500_000, appDir: app });
    expect(read.samples).toBe(20);
    expect(read.busy).toBe(1);
  });

  it('says the thread was idle when it was asleep rather than stuck', () => {
    const read = freezeFrom([{ profile: aProfile(Array(40).fill([['(program)']])) }], { fromUs: 0, toUs: 1e9, appDir: app });
    expect(read.busy).toBe(0);
    expect(read.where).toBeNull();
  });

  it('says so when the time went to garbage collection', () => {
    const read = freezeFrom([{ profile: aProfile(Array(40).fill([['(garbage collector)']])) }], { fromUs: 0, toUs: 1e9, appDir: app });
    expect(read.gc).toBe(1);
    expect(read.where).toBe('(garbage collector)');
  });

  it('reads a freeze across two profiles, each on its own clock', () => {
    const one = { profile: { ...aProfile(Array(10).fill(git)), startTime: 5_000_000 }, offsetUs: 5_000_000 };
    const two = { profile: { ...aProfile(Array(10).fill(git)), startTime: 9_100_000 }, offsetUs: 9_000_000 };
    expect(freezeFrom([one, two], { fromUs: 0, toUs: 200_000, appDir: app }).samples).toBe(20);
  });

  it('knows the app by either of its paths', () => {
    const real = '/private/var/app';
    const mine = [['changeFromRepo', `file://${real}/main/git-change.mjs`, 262]];
    const read = freezeFrom([{ profile: aProfile(Array(10).fill(mine)) }], { fromUs: 0, toUs: 1e9, appDir: ['/var/app', real] });
    expect(read.where).toBe('changeFromRepo main/git-change.mjs:262');
    const other = freezeFrom([{ profile: aProfile(Array(10).fill(mine)) }], { fromUs: 0, toUs: 1e9, appDir: ['/var/app'] });
    expect(other.where).toBe('changeFromRepo');
  });

  it('never writes a path outside the app in full', () => {
    const elsewhere = [['loadSomething', 'file:///Users/someone/private/thing.mjs', 3]];
    const read = freezeFrom([{ profile: aProfile(Array(10).fill(elsewhere)) }], { fromUs: 0, toUs: 1e9, appDir: app });
    expect(JSON.stringify(read)).not.toContain('/Users/someone');
    expect(read.where).toBe('loadSomething');
  });
});

describe('the freeze file', () => {
  it('keeps a week and removes only its own older files', () => {
    const dir = tempDir();
    const now = Date.parse('2026-10-21T12:00:00Z');
    const old = dayOf(now - 8 * 86_400_000);
    fs.writeFileSync(path.join(dir, `freeze-${old}.jsonl`), '{}\n');
    fs.writeFileSync(path.join(dir, `memory-${old}.jsonl`), '{}\n');
    writeFreeze(dir, { at: new Date(now).toISOString(), ms: 900, where: 'x' });
    expect(fs.readdirSync(dir).sort()).toEqual([`freeze-${dayOf(now)}.jsonl`, `memory-${old}.jsonl`]);
  });
});

describe('the minute line', () => {
  it('carries each freeze with the function that held it, worst first, and then forgets them', () => {
    const loop = { max: 0, enable() {}, reset() {} };
    const watch = stallWatch({ clock: () => 0, loop });
    watch.noteFreeze({ ms: 700, where: 'a main/a.mjs:1' });
    watch.noteFreeze({ ms: 2300, where: 'b main/b.mjs:2' });
    expect(watch.take().freezes).toEqual([{ ms: 2300, where: 'b main/b.mjs:2' }, { ms: 700, where: 'a main/a.mjs:1' }]);
    expect(watch.take().freezes).toBeUndefined();
  });
});
