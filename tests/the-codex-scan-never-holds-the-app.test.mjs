// THE CODEX SCAN NEVER HOLDS THE APP.
//
// What broke (2026-10-19): right after a restart, and then for 11 to 13
// seconds of every minute, the app showed the spinning wheel. Its own minute
// log said the main process went 11,459 to 12,944 ms without answering, once a
// minute. A CPU profile of the running app put 13.5 of every 70 seconds in one
// place: the Codex watch re-reading up to 8 MB of every recent Codex
// transcript, synchronously on the main process, once a minute, whether or
// not the file had changed. Her ~/.codex/sessions held 3,005 transcripts, 13 GB.
//
// Now a transcript is read again only when its size or time has changed, and
// the watch reads in a thread of its own, so even the first full read at
// startup leaves the window answering. Measured here on a stand-in Codex
// folder of large transcripts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readRollout, readCodexThreads, readCodexThreadsOffThread } from '../main/codex-threads.mjs';
import { scanCodex, startCodexWatch } from '../main/codex-watch.mjs';

let home; let codexDir;
const day = new Date();
const dayDir = () => path.join(codexDir, 'sessions', String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0'));

function transcript(i, { padLines = 0 } = {}) {
  const at = new Date().toISOString();
  const lines = [
    { type: 'session_meta', timestamp: at, payload: { id: `t-${i}`, session_id: `t-${i}`, cwd: path.join(home, 'code', `p${i}`), source: 'cli', timestamp: at } },
    { type: 'event_msg', timestamp: at, payload: { type: 'user_message', message: `Fix the thing number ${i}` } },
    ...Array.from({ length: padLines }, () => ({ type: 'event_msg', timestamp: at, payload: { type: 'token_count', info: 'x'.repeat(900) } })),
    { type: 'event_msg', timestamp: at, payload: { type: 'agent_message', message: `Done with ${i}` } },
  ];
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
}

beforeAll(() => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-scan-')));
  codexDir = path.join(home, '.codex');
  fs.mkdirSync(dayDir(), { recursive: true });
  for (let i = 0; i < 60; i += 1) {
    fs.mkdirSync(path.join(home, 'code', `p${i}`), { recursive: true });
    // About 2 MB each: what a long Codex conversation weighs.
    fs.writeFileSync(path.join(dayDir(), `rollout-2026-10-19T10-00-${String(i).padStart(2, '0')}-t-${i}.jsonl`), transcript(i, { padLines: 2000 }));
  }
});
afterAll(() => fs.rmSync(home, { recursive: true, force: true }));

describe('a transcript', () => {
  it('is not read again while its size and time are what they were', () => {
    const file = path.join(dayDir(), 'rollout-2026-10-19T10-00-00-t-0.jsonl');
    const when = new Date(Math.floor(Date.now() / 1000) * 1000);
    fs.utimesSync(file, when, when);
    const first = readRollout(file);
    // The same size and the same time, other words: still the first reading.
    const text = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, text.replace('Done with 0', 'Done with X'));
    fs.utimesSync(file, when, when);
    expect(readRollout(file)).toBe(first);
    // Grown, it is read again.
    fs.appendFileSync(file, JSON.stringify({ type: 'event_msg', timestamp: new Date().toISOString(), payload: { type: 'agent_message', message: 'And more' } }) + '\n');
    expect(readRollout(file).last).toBe('And more');
  });
});

describe('the watch', () => {
  it('reads in a thread of its own, and the app keeps answering while it does', async () => {
    let longest = 0;
    let last = performance.now();
    const beat = setInterval(() => { const t = performance.now(); longest = Math.max(longest, t - last); last = t; }, 10);
    const at = performance.now();
    const off = await readCodexThreadsOffThread({ home, codexDirs: [codexDir] });
    const took = performance.now() - at;
    clearInterval(beat);
    expect(off.threads).toHaveLength(60);
    expect(off.threads.map((t) => t.id).sort()).toEqual(readCodexThreads({ home, codexDirs: [codexDir] }).threads.map((t) => t.id).sort());
    // The read took a while; the app never waited on it.
    expect(longest).toBeLessThan(Math.max(250, took / 4));
  }, 60_000);

  it('waits for a scan that reads off the main thread, and never starts a second while one is out', async () => {
    let out = 0; let most = 0; let calls = 0;
    const slow = () => { calls += 1; out += 1; most = Math.max(most, out); return new Promise((r) => setTimeout(() => { out -= 1; r({ threads: [] }); }, 80)); };
    const store = { refreshCodexMirrors: () => 0, refreshCodexAsks: () => 0 };
    expect(await scanCodex({ store, readThreads: slow })).toMatchObject({ threads: 0 });
    const w = startCodexWatch({ store, readThreads: slow, pollMs: 10, firstDelayMs: 0 });
    await new Promise((r) => setTimeout(r, 300));
    w.stop();
    expect(most).toBe(1);
    expect(calls).toBeGreaterThan(1);
  });

  it('is the one the app runs', () => {
    const main = fs.readFileSync(new URL('../main/main.mjs', import.meta.url), 'utf8');
    const watch = main.slice(main.indexOf('startCodexWatch({'), main.indexOf('startCodexWatch({') + 400);
    expect(watch).toMatch(/readCodexThreadsOffThread\(/);
  });
});
