// AN OPEN THREAD IS SENT ONLY THE AGENT LOGS THAT CHANGED.
//
// With a thread open while its agent works, the window reads the thread's
// agent logs on every push: the last 20 runs, up to 120,000 characters each.
// Measured 2026-10-30 on a copy with one such thread open (19 earlier runs and
// a live one): 93 reads a minute, 213 MB a minute, for logs of which only the
// live one was growing.
//
// So each log goes out with a stamp of its size and time, the window asks with
// the stamps of the logs it holds, and a log whose stamp has not moved comes
// back marked the same, without its text. A window that sends no stamps, or a
// computer that knows nothing of them, gets and gives every log whole.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { traceReader } from '../shared/trace-delta.mts';
import { withRuns } from '../renderer/src/thread-history';
import { bootHeadless } from '../main/serve.mts';
import { encodeProjectPath, machineryPath } from '../main/store/home.mts';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const plain = (x) => JSON.parse(JSON.stringify(x));

describe('through the real handler', () => {
  let dir, booted, trace, logs, project;
  const id = 'w-tracedelta1';
  const slug = 'traces';

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-trace-'));
    const storeRoot = path.join(dir, 'store');
    fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify({ storeRoot, accountId: 'trace-account' }));
    project = path.join(storeRoot, 'accounts', 'trace-account', slug);
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ schemaVersion: 2, id: slug, name: 'Traces' }));
    const machinery = path.join(storeRoot, 'projects', encodeProjectPath(project));
    fs.mkdirSync(machinery, { recursive: true });
    fs.writeFileSync(path.join(machinery, '.origin'), `${project}\n`);
    fs.writeFileSync(path.join(machinery, 'work-items.jsonl'), `${JSON.stringify({ id, ts: Date.now(), source: 'system', patch: { title: 'Traced', status: 'done', kind: 'task', labels: [] } })}\n`);
    booted = await bootHeadless({ dataDir: dir, appDir: repoRoot, userDir: dir });
    trace = booted.channels.get('zero:session-trace');
    logs = machineryPath(project, path.join('sessions', id));
    fs.mkdirSync(logs, { recursive: true });
    for (const at of [1000, 2000, 3000]) fs.writeFileSync(path.join(logs, `${at}.log`), `run ${at} said this\n`.repeat(50));
  }, 30_000);

  afterAll(async () => {
    try { booted?.supervisor.killAll(); booted?.supervisor.stop(); } catch { /* done */ }
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('a first read gets every log whole', async () => {
    const answer = plain(await trace({}, { product: slug, id }));
    expect(answer.sessions.map((s) => s.startedAt)).toEqual([1000, 2000, 3000]);
    expect(answer.sessions.every((s) => s.text.startsWith('run ') && s.stamp)).toBe(true);
  });

  it('a read with the stamps it holds gets only the log that grew, and the window still holds every log', async () => {
    const read = traceReader();
    const key = `${slug}/${id}`;
    const first = read.take(key, plain(await trace({}, { product: slug, id, have: read.have(key) })));
    const same = plain(await trace({}, { product: slug, id, have: read.have(key) }));
    expect(same.sessions.every((s) => s.same && s.text === undefined)).toBe(true);
    expect(read.take(key, same).sessions).toBe(first.sessions);

    fs.appendFileSync(path.join(logs, '3000.log'), 'and one more line\n');
    const grew = plain(await trace({}, { product: slug, id, have: read.have(key) }));
    expect(grew.sessions.filter((s) => !s.same).map((s) => s.startedAt)).toEqual([3000]);
    const got = read.take(key, grew);
    const whole = plain(await trace({}, { product: slug, id }));
    expect(got.sessions).toEqual(whole.sessions.map(({ startedAt, text }) => ({ startedAt, text })));
  });

  it('a log that grew sends only what it grew by, and the window ends up with what a whole read gives', async () => {
    const read = traceReader();
    const key = `${slug}/${id}`;
    read.take(key, plain(await trace({}, { product: slug, id, have: read.have(key) })));
    fs.appendFileSync(path.join(logs, '3000.log'), 'é one more line, not ascii\n');
    const grew = plain(await trace({}, { product: slug, id, have: read.have(key) }));
    const log = grew.sessions.find((s) => s.startedAt === 3000);
    expect(log.text).toBeUndefined();
    expect(log.more).toBe('é one more line, not ascii\n');
    const whole = plain(await trace({}, { product: slug, id }));
    expect(read.take(key, grew).sessions).toEqual(whole.sessions.map(({ startedAt, text }) => ({ startedAt, text })));
  });

  it('a log past the cap is cut the same way on both sides as it keeps growing', async () => {
    const read = traceReader();
    const key = `${slug}/${id}`;
    const big = path.join(logs, '5000.log');
    fs.writeFileSync(big, 'x'.repeat(119_000));
    read.take(key, plain(await trace({}, { product: slug, id, have: read.have(key) })));
    for (const more of ['y'.repeat(2_000), 'z'.repeat(500_000), 'tail end\n']) {
      fs.appendFileSync(big, more);
      const got = read.take(key, plain(await trace({}, { product: slug, id, have: read.have(key) })));
      const whole = plain(await trace({}, { product: slug, id }));
      expect(got.sessions.find((s) => s.startedAt === 5000).text).toBe(whole.sessions.find((s) => s.startedAt === 5000).text);
    }
    const text = (plain(await trace({}, { product: slug, id }))).sessions.find((s) => s.startedAt === 5000).text;
    expect(text.startsWith('… truncated (')).toBe(true);
    expect(text.endsWith('tail end\n')).toBe(true);
    fs.rmSync(big);
  });

  it('a log replaced by a smaller one is sent whole, not stitched on', async () => {
    const read = traceReader();
    const key = `${slug}/${id}`;
    const small = path.join(logs, '6000.log');
    fs.writeFileSync(small, 'the first long version of this log\n');
    read.take(key, plain(await trace({}, { product: slug, id, have: read.have(key) })));
    fs.writeFileSync(small, 'short\n');
    // Linux stamps two writes in one clock tick with the same time, and a smaller
    // log at the same time reads as a late answer. A real replacement comes later.
    const later = new Date(Date.now() + 2000);
    fs.utimesSync(small, later, later);
    const got = read.take(key, plain(await trace({}, { product: slug, id, have: read.have(key) })));
    expect(got.sessions.find((s) => s.startedAt === 6000).text).toBe('short\n');
    fs.rmSync(small);
  });

  it('a new run arrives whole, and one that left is gone', async () => {
    const read = traceReader();
    const key = `${slug}/${id}`;
    read.take(key, plain(await trace({}, { product: slug, id, have: read.have(key) })));
    fs.writeFileSync(path.join(logs, '4000.log'), 'the newest run\n');
    fs.rmSync(path.join(logs, '1000.log'));
    const answer = plain(await trace({}, { product: slug, id, have: read.have(key) }));
    expect(answer.sessions.filter((s) => !s.same).map((s) => s.startedAt)).toEqual([4000]);
    expect(read.take(key, answer).sessions.map((s) => s.startedAt)).toEqual([2000, 3000, 4000]);
  });

  it('a thread whose middle is opened gets every run whole, and the newest-runs read stays at 20', async () => {
    const more = Array.from({ length: 22 }, (_, i) => 5000 + i);
    for (const at of more) fs.writeFileSync(path.join(logs, `${at}.log`), `run ${at}\n`);
    const all = fs.readdirSync(logs).sort().map((f) => Number(f.replace('.log', '')));
    expect(all.length).toBeGreaterThan(22);
    const every = plain(await trace({}, { product: slug, id, whole: true }));
    expect(every.sessions.map((s) => s.startedAt)).toEqual(all);
    expect(every.sessions.every((s) => !s.stamp && !s.same)).toBe(true);
    const newest = plain(await trace({}, { product: slug, id, have: {} }));
    expect(newest.sessions.map((s) => s.startedAt)).toEqual(all.slice(-20));
    for (const at of more) fs.rmSync(path.join(logs, `${at}.log`));
  });
});

describe('the window side', () => {
  it('an answer from a computer that knows nothing of stamps is taken whole', () => {
    const read = traceReader();
    const old = { ok: true, sessions: [{ startedAt: 1, text: 'a' }, { startedAt: 2, text: 'b' }] };
    expect(read.take('p/w-1', old).sessions).toEqual(old.sessions);
    expect(read.have('p/w-1')).toBeUndefined();
  });

  it('a log marked the same that this window no longer holds asks for a whole read', () => {
    const read = traceReader();
    expect(read.take('p/w-1', { ok: true, sessions: [{ startedAt: 1, stamp: '5:1', same: true }] })).toBeNull();
  });

  it('another thread\'s logs are not offered as this one\'s', () => {
    const read = traceReader();
    read.take('p/w-1', { ok: true, sessions: [{ startedAt: 1, stamp: '5:1', text: 'a' }] });
    expect(read.have('p/w-1')).toEqual({ 1: '5:1' });
    expect(read.have('p/w-2')).toBeUndefined();
  });

  it('an older read landing after a newer one does not take a log back', () => {
    const read = traceReader();
    read.take('p/w-1', { ok: true, sessions: [{ startedAt: 1, stamp: '5:1', text: 'hello' }] });
    read.take('p/w-1', { ok: true, sessions: [{ startedAt: 1, stamp: '11:2', more: ' world', from: 5 }] });
    const late = read.take('p/w-1', { ok: true, sessions: [{ startedAt: 1, stamp: '5:1', same: true }] });
    expect(late.sessions[0].text).toBe('hello world');
    const later = read.take('p/w-1', { ok: true, sessions: [{ startedAt: 1, stamp: '5:1', text: 'hello' }] });
    expect(later.sessions[0].text).toBe('hello world');
  });

  it('more that does not start where this window stands asks for a whole read', () => {
    const read = traceReader();
    read.take('p/w-1', { ok: true, sessions: [{ startedAt: 1, stamp: '5:1', text: 'hello' }] });
    expect(read.take('p/w-1', { ok: true, sessions: [{ startedAt: 1, stamp: '20:2', more: 'x', from: 9 }] })).toBeNull();
  });

  it('a log the window still holds is read into notes once, and a new one is read again', () => {
    const pickup = [{ at: 9000, who: 'agent', said: 'An agent picked it up', pickup: true }];
    const log = { startedAt: 1000, text: 'TOOL: Bash ls\nRESULT ok\n' };
    const first = withRuns(pickup, [log])[0].runs[0];
    expect(withRuns(pickup, [log])[0].runs[0]).toBe(first);
    const fresh = withRuns(pickup, [{ ...log }])[0].runs[0];
    expect(fresh).not.toBe(first);
    expect(fresh).toEqual(first);
  });

  it('holds the logs of a few threads, not of every thread ever opened', () => {
    const read = traceReader({ keep: 2 });
    for (const n of [1, 2, 3]) read.take(`p/w-${n}`, { ok: true, sessions: [{ startedAt: 1, stamp: 's', text: 'x' }] });
    expect(read.have('p/w-1')).toBeUndefined();
    expect(read.have('p/w-3')).toEqual({ 1: 's' });
  });
});
