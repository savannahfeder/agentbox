// A LONG THREAD SHOWS EVERY RUN WHEN YOU OPEN ITS MIDDLE.
//
// A thread that ran for three days showed its opening ask and then only the
// last hour; most of what the agent said in between was missing, even after
// pressing "Show the N messages in between". Every run writes its own log
// under sessions/<item-id>/, and the app read only the newest 20 of them, each
// cut to its last 120,000 characters. That thread had restarted every few
// minutes for an hour, so the newest 20 logs were all from that hour. Measured
// here by building the thread from 45 run logs: the first run's words were not
// in it.
//
// The newest 20 stay the regular read, because it runs on every push while an
// agent works. Opening the middle reads every log whole, once, and the regular
// read is joined onto it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRunTraces } from '../main/run-traces.mjs';
import { withEveryRun } from '../renderer/src/every-run.ts';
import { itemThread } from '../renderer/src/item-thread.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const BEGAN = Date.parse('2026-10-29T19:50:00Z');
const clockAt = (ms) => new Date(ms).toISOString().slice(11, 19);
const runLog = (n, startedAt) => [
  `# Multiplayer interface · run ${n}`,
  '',
  `${clockAt(startedAt + 1000)}  Run ${n} says what it found.`,
  `${clockAt(startedAt + 2000)}  [Bash] npm test`,
  '',
].join('\n');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-traces-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const writeRuns = (count) => {
  const starts = Array.from({ length: count }, (_, n) => BEGAN + n * 600_000);
  starts.forEach((at, n) => fs.writeFileSync(path.join(dir, `${at}.log`), runLog(n + 1, at)));
  return starts;
};

describe('reading the run logs', () => {
  it('reads the newest 20 on the regular read, as it always has', () => {
    const starts = writeRuns(45);
    const read = readRunTraces(dir);
    expect(read).toHaveLength(20);
    expect(read[0].startedAt).toBe(starts[25]);
    expect(read.at(-1).startedAt).toBe(starts[44]);
  });

  it('reads every log when the middle is asked for', () => {
    const starts = writeRuns(45);
    const read = readRunTraces(dir, { whole: true });
    expect(read.map((s) => s.startedAt)).toEqual(starts);
    expect(read[0].text).toMatch(/Run 1 says what it found/);
  });

  it('reads a thread with exactly 20 runs the same either way', () => {
    writeRuns(20);
    expect(readRunTraces(dir)).toEqual(readRunTraces(dir, { whole: true }));
  });

  it('cuts a long log to its tail on the regular read and keeps it whole when asked', () => {
    const long = `${clockAt(BEGAN)}  The first thing it said.\n${'x'.repeat(200_000)}\n`;
    fs.writeFileSync(path.join(dir, `${BEGAN}.log`), long);
    expect(readRunTraces(dir)[0].text).toMatch(/^… truncated \(\d+ bytes total\)/);
    expect(readRunTraces(dir)[0].text).not.toMatch(/The first thing it said/);
    expect(readRunTraces(dir, { whole: true })[0].text).toBe(long);
  });

  it('answers with nothing for a thread that has no logs', () => {
    expect(readRunTraces(path.join(dir, 'missing'))).toEqual([]);
  });
});

describe('joining the regular read onto every run', () => {
  it('keeps the older runs and takes the newest ones from the regular read', () => {
    writeRuns(45);
    const every = readRunTraces(dir, { whole: true });
    const newest = readRunTraces(dir).map((s, i, all) => (i === all.length - 1 ? { ...s, text: `${s.text}more since\n` } : s));
    const joined = withEveryRun(every, newest);
    expect(joined).toHaveLength(45);
    expect(joined[0].text).toMatch(/Run 1 says/);
    expect(joined.at(-1).text).toMatch(/more since/);
  });

  // The running log is the one that grows, and the regular read cuts it.
  it('keeps the head of a running log and the lines it wrote since the middle was opened', () => {
    const file = path.join(dir, `${BEGAN}.log`);
    const head = `${clockAt(BEGAN)}  The first thing it said.\n${'a'.repeat(150_000)}\n`;
    fs.writeFileSync(file, head);
    const every = readRunTraces(dir, { whole: true });
    fs.appendFileSync(file, `${clockAt(BEGAN + 9000)}  Said after you opened it.\n`);
    const joined = withEveryRun(every, readRunTraces(dir));
    expect(joined[0].text).toBe(fs.readFileSync(file, 'utf8'));
  });

  it('is the regular read alone until the middle is asked for', () => {
    writeRuns(30);
    const newest = readRunTraces(dir);
    expect(withEveryRun([], newest)).toBe(newest);
  });
});

describe('the thread you see', () => {
  const lines = [{ id: 'w-long', ts: BEGAN, source: 'founder', patch: { body: 'Run the team loop.' } }];

  it('lost the first run before, and has it once the middle is opened', () => {
    writeRuns(45);
    const said = (sessions) => itemThread(lines, sessions, null, { whole: true }).events
      .filter((e) => e.kind !== 'work').map((e) => e.text).join('\n');
    expect(said(readRunTraces(dir))).not.toMatch(/Run 1 says/);
    expect(said(withEveryRun(readRunTraces(dir, { whole: true }), readRunTraces(dir)))).toMatch(/Run 1 says/);
  });

  it('asks for every run when the middle is opened', () => {
    const item = source('renderer/src/components/ItemThread.tsx');
    expect(item).toMatch(/api\.sessionTrace\(\{ product: item\.product, id: item\.id, whole: true \}\)/);
    expect(item).toMatch(/withEveryRun\(everyRun, sessions\)/);
    expect(source('main/ipc.mjs')).toMatch(/readRunTraces\(machineryPath\(dir, path\.join\('sessions', id\)\), \{ whole: !!whole \}\)/);
  });
});
