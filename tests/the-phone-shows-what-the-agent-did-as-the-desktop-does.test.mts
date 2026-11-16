// THE PHONE SHOWS WHAT THE AGENT DID, AS THE DESKTOP DOES.
//
// QA session m19 (2026-11-15): the same finished thread read "Show 6 earlier
// messages" on the desktop and "Show 1 earlier message" on the phone, which
// opened to her ask and the result only. The desktop builds a thread from the
// ledger and the runs' logs (sessions/<id>/<startedAt>.log); the computer sent
// the phone the ledger alone, and the phone app and the phone website both
// built the thread with no runs. Measured by building the thread both ways
// from one ledger and one run's log.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { threadSnapshot, bytesOf, SNAPSHOT_LIMITS, RUN_LIMITS } from '../shared/phone-snapshot.mts';
import { phoneHistory, phoneRuns, phoneView, phoneSlug } from '../renderer/src/phone-rows';
import { itemThread } from '../renderer/src/item-thread';
import { threadOf } from '../mobile/src/lib/thread';
import { readRunTails } from '../main/run-traces.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createPhoneInbox } from '../main/phone-inbox.mts';

const NOW = Date.parse('2026-11-15T18:30:00Z');
const MIN = 60_000;
const DEV = '0a1b2c3d4e5f';
const ID = 'w-1';
const startedAt = NOW - 20 * MIN;
const clock = (ms: number) => new Date(ms).toISOString().slice(11, 19);

const row = { id: ID, title: 'Word counting fix, test and example', status: 'done', createdAt: NOW - 25 * MIN, updatedAt: NOW - 10 * MIN, result: 'Fixed the word count and added a test.' };
const ledger = [
  { id: ID, ts: NOW - 25 * MIN, source: 'founder', patch: { title: row.title, body: 'Fix the word count, add a test and an example.' } },
  { id: ID, ts: NOW - 21 * MIN, source: 'agent', claim: { holder: 'x', epoch: 1 } },
  { id: ID, ts: NOW - 10 * MIN, source: 'agent', patch: { result: row.result, status: 'done' } },
];
const run = {
  startedAt,
  text: [
    `${clock(startedAt + 5_000)}  I'll read the counter first.`,
    `${clock(startedAt + 10_000)}  [Bash] npm test -- word-count`,
    `${clock(startedAt + 60_000)}  The test fails on two spaces in a row; fixing the split.`,
    `${clock(startedAt + 90_000)}  [Edit] src/word-count.ts`,
    `${clock(startedAt + 120_000)}  [Bash] npm test -- word-count`,
    `${clock(startedAt + 150_000)}  All green. Writing the example now.`,
    '# exited (0)',
  ].join('\n'),
};

const said = (events: { kind?: string; who?: string; text?: string }[]) => events.filter((e) => e.kind !== 'work' && e.who === 'it').map((e) => e.text);
const rowsWith = (snapshot: unknown) => ({
  projects: [{ device: DEV, project: 'agentbox', name: 'Agentbox', updated_at: new Date(NOW).toISOString() }],
  threads: [{ device: DEV, project: 'agentbox', item: ID, updated_at: new Date(NOW).toISOString(), snapshot }],
  commands: [], settings: [],
});

describe('a thread\'s copy for the phone', () => {
  it('carries its runs\' logs, with keys hidden and the home folder written ~', () => {
    // Built at run time so no line of this file reads as a real key.
    const key = ['sk', 'proj', 'x'.repeat(36)].join('-');
    const secret = { startedAt, text: `${run.text}\n${clock(startedAt + 1000)}  [Bash] cat /Users/someone/.env OPENAI_API_KEY=${key}` };
    const snap = threadSnapshot(row, ledger, SNAPSHOT_LIMITS, { home: '/Users/someone', runs: [secret] });
    expect(snap.runs).toHaveLength(1);
    expect(snap.runs![0].startedAt).toBe(startedAt);
    expect(snap.runs![0].text).toContain('fixing the split');
    expect(snap.runs![0].text).toContain('~/.env');
    expect(snap.runs![0].text).not.toContain(key.slice(0, 30));
  });

  it('carries none when there are none, so a thread with no runs is unchanged', () => {
    expect(threadSnapshot(row, ledger)).not.toHaveProperty('runs');
  });

  it('keeps the newest runs and the end of a long one, cut on a line', () => {
    const many = Array.from({ length: RUN_LIMITS.runs + 3 }, (_, i) => ({ startedAt: startedAt + i * MIN, text: `${clock(startedAt + i * MIN + 1000)}  run ${i}` }));
    const snap = threadSnapshot(row, ledger, SNAPSHOT_LIMITS, { runs: many });
    expect(snap.runs!.map((r) => r.text)).toEqual(many.slice(-RUN_LIMITS.runs).map((r) => r.text));
    const long = { startedAt, text: Array.from({ length: 5000 }, (_, i) => `${clock(startedAt + 1000)}  line ${i} of a long run`).join('\n') };
    const cut = threadSnapshot(row, ledger, SNAPSHOT_LIMITS, { runs: [long] }).runs![0].text;
    expect(cut.length).toBeLessThanOrEqual(RUN_LIMITS.chars + 100);
    expect(cut.endsWith('line 4999 of a long run')).toBe(true);
    expect(cut.split('\n').slice(1).every((l) => /^\d\d:\d\d:\d\d {2}line \d+ of a long run$/.test(l))).toBe(true);
  });

  it('gives up runs before the ledger when the copy would not fit', () => {
    const limits = { ...SNAPSHOT_LIMITS, bytes: bytesOf(threadSnapshot(row, ledger)) + 200 };
    const snap = threadSnapshot(row, ledger, limits, { runs: [run] });
    expect(snap.history).toHaveLength(ledger.length - 1);
    expect(snap.runs ?? []).toEqual([]);
  });
});

describe('the same finished thread on the phone and on the desktop', () => {
  const desktop = itemThread(ledger as never, [run], null, {});
  const rows = rowsWith(threadSnapshot(row, ledger, SNAPSHOT_LIMITS, { runs: [run] }));
  const product = phoneSlug(DEV, 'agentbox');

  it('has the agent\'s messages from the run on the desktop', () => {
    expect(said(desktop.events)).toContain('The test fails on two spaces in a row; fixing the split.');
  });

  it('has the same messages and steps in the phone app', () => {
    const t = threadOf(rows as never, phoneView(rows as never, NOW), product, ID)!;
    expect(said(t.events)).toEqual(said(desktop.events));
    expect(t.events.filter((e) => e.kind === 'work').length).toBe(desktop.events.filter((e) => e.kind === 'work').length);
  });

  it('has them on the phone website, which reads the runs as the desktop reads its logs', () => {
    const { lines } = phoneHistory(rows as never, product, ID);
    const web = itemThread(lines, phoneRuns(rows as never, product, ID), null, {});
    expect(said(web.events)).toEqual(said(desktop.events));
  });

  it('draws only the ledger for a copy from before runs were sent', () => {
    const old = rowsWith(threadSnapshot(row, ledger));
    expect(phoneRuns(old as never, product, ID)).toEqual([]);
    const t = threadOf(old as never, phoneView(old as never, NOW), product, ID)!;
    expect(said(t.events)).toEqual([]);
  });
});

describe('the computer sends a thread\'s runs with it', () => {
  it('reads them only when the copy is built, and sends it again when a run is picked up', async () => {
    const cloud = createMemoryCloud();
    cloud.now = () => NOW;
    const me = signUpMemory(cloud, { email: `o-${Math.random()}@example.com` });
    const mac = memoryBackend(cloud, me);
    const phone = memoryBackend(cloud, me);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-runs-'));
    const runs: { startedAt: number; text: string }[] = [run];
    const asked: string[] = [];
    const lines: unknown[] = [...ledger];
    const inbox = createPhoneInbox({
      backend: mac, owner: me, projects: () => [{ slug: 'alpha', name: 'Alpha', dir }],
      listItems: () => [row], historyOf: () => lines,
      runsOf: (slug: string, id: string) => { asked.push(`${slug}/${id}`); return runs; },
      apply: async () => ({ ok: true }), stateFile: path.join(dir, 's.json'), now: () => NOW,
    } as never);
    expect((await inbox.syncOnce()).sent).toBe(1);
    expect(asked).toEqual(['alpha/w-1']);
    const [copy] = await phone.phoneThreads();
    expect(copy.snapshot.runs.map((r: { startedAt: number }) => r.startedAt)).toEqual([startedAt]);
    expect((await inbox.syncOnce()).sent).toBe(0);
    expect(asked).toHaveLength(1);
    runs.push({ startedAt: startedAt + 30 * MIN, text: `${clock(startedAt + 31 * MIN)}  A second run.` });
    lines.push({ id: ID, ts: startedAt + 30 * MIN, source: 'agent', claim: { holder: 'y', epoch: 2 } });
    expect((await inbox.syncOnce()).sent).toBe(1);
    expect((await phone.phoneThreads())[0].snapshot.runs).toHaveLength(2);
  });
});

describe('the runs read from disk for the phone', () => {
  it('are the newest few, each its end only', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-tails-'));
    for (let i = 0; i < 5; i += 1) fs.writeFileSync(path.join(dir, `${1000 + i}.log`), `${'x'.repeat(50)}\nrun ${i}`);
    const got = readRunTails(dir, { newest: 2, chars: 10 });
    expect(got).toEqual([{ startedAt: 1003, text: 'run 3' }, { startedAt: 1004, text: 'run 4' }]);
    expect(readRunTails(dir, { newest: 1, chars: 1000 })[0].text).toBe(`${'x'.repeat(50)}\nrun 4`);
    expect(readRunTails(path.join(dir, 'none'), { newest: 2, chars: 10 })).toEqual([]);
  });
});
