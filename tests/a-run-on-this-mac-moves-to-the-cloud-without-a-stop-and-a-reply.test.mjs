// A RUN ON THIS MAC MOVES TO THE CLOUD WITHOUT A STOP AND A REPLY (w-f43613624f).
//
// Going off to work from a phone for a few days, with the cloud on Everything,
// five threads still said "Working locally" and nothing could send them to the
// cloud. Closing the lid would have frozen all five. Measured by reading the
// code that day: a run's place was decided once, when it started, and the only
// way to move it was to press Stop on each and send a reply. Their words: "a
// hack, not a solution for real people."
//
// Now a run on this Mac that the cloud could take is paused the way an urgent
// row pauses one and resumed in the cloud, as the cloud has room. With
// Everything on it happens by itself. Under "when this Mac is full" it happens
// to the threads someone asks to move, one by one or all at once.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { whyWords } from '../renderer/src/where-why.ts';
import { statusCell } from '../renderer/src/status-word.ts';
import { threadPlace, cloudMoveLine } from '../renderer/src/cloud-menu.ts';
import { threadMenuRows, PLACE_ROW } from '../renderer/src/threads/ThreadMenu.tsx';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });

const folder = (id) => `/r/.claude/worktrees/${id}`;

function make({ cloudRuns = 'all', items = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'move-to-cloud-'));
  dirs.push(root);
  const product = { slug: 'p', dir: root, repoPath: '/r' };
  const rows = items ?? [];
  const sup = new Supervisor(
    { storeRoot: root, home: root, maxConcurrentSessions: 6, maxCloudSessions: 10, authProfiles: ['default'], cloudRuns },
    { listItems: () => rows, listProducts: () => [product], isDue: () => true },
    root,
  );
  sup._cloudSetUp = () => true;
  sup._cloudReady = () => true;
  sup._cloudSignedInAtAll = () => true;
  sup._cloudVersionGaps = () => [];
  sup.transcriptFile = (rec) => (rec?.sessionId ? '/t.jsonl' : null);
  const killed = [];
  const run = (id, extra = {}) => {
    if (!rows.some((i) => i.id === id)) rows.push({ id, product: 'p', status: 'claimed', ...(extra.item ?? {}) });
    const s = { itemId: id, product: 'p', cwd: folder(id), engine: 'claude', startedAt: Date.now(), tail: [], child: { kill: () => killed.push(id) }, ...extra.session };
    sup.sessions.set(id, s);
    sup._liveSessions[id] = { product: 'p', sessionId: extra.sessionId === undefined ? `s-${id}` : extra.sessionId, cwd: s.cwd, engine: s.engine };
    return s;
  };
  return { sup, root, product, rows, run, killed };
}

describe('with the cloud on Everything', () => {
  it('pauses a run on this Mac and sends its resume to the cloud (the reported case)', () => {
    const { sup, rows, run, killed, product } = make();
    const s = run('w-a');
    sup._recoverPending = false;
    sup._moveRunsToTheCloud(rows);
    expect(killed).toEqual(['w-a']);
    // Paused the way an urgent row pauses one: not a Stop, so the row is not
    // sent back to the inbox and the sweep resumes the same session.
    expect(s.stoppedByUs).toBe(true);
    expect(s.stoppedOnRequest).toBeUndefined();
    expect(sup._recoverPending).toBe(true);
    // The resume goes to the cloud.
    sup.sessions.delete('w-a');
    sup._cloudSlotFor = () => true;
    sup._localSlotFor = () => true;
    expect(sup._whereToRun({ item: rows[0], product, cwd: folder('w-a'), engine: 'claude', continuation: true })).toBe('cloud');
  });

  it('starts no more at once than the cloud starts at once, and the rest keep working here', () => {
    const { sup, rows, run, killed } = make();
    for (const id of ['w-a', 'w-b', 'w-c', 'w-d']) run(id);
    sup._moveRunsToTheCloud(rows);
    expect(killed).toHaveLength(2);
    // The two paused ones have not started in the cloud yet: nothing more goes.
    for (const id of killed) sup.sessions.delete(id);
    sup._moveRunsToTheCloud(rows);
    expect(killed).toHaveLength(2);
  });

  it('stops at the cloud\'s cap', () => {
    const { sup, rows, run, killed } = make();
    sup.config.maxCloudSessions = 1;
    sup.sessions.set('w-c1', { itemId: 'w-c1', product: 'p', cloud: true, engine: 'claude', cloudSentAt: Date.now(), child: { kill() {} } });
    run('w-a');
    sup._moveRunsToTheCloud(rows);
    expect(killed).toEqual([]);
  });

  it('leaves alone every run the cloud could not take or should not take now', () => {
    const { sup, rows, run, killed, root } = make();
    sup.setThreadOnMac({ 'w-kept': true });
    run('w-kept');
    run('w-mate', { item: { labels: ['teammate:someone'] } });
    run('w-codex', { session: { engine: 'codex' } });
    run('w-cmd', { session: { command: '/compact' } });
    run('w-young', { sessionId: null });
    run('w-repo', { session: { cwd: '/r' } });
    run('w-cloud', { session: { cloud: true } });
    run('w-asks');
    fs.mkdirSync(path.join(root, '.approvals'), { recursive: true });
    fs.writeFileSync(path.join(root, '.approvals', 'x1.request.json'), JSON.stringify({ item: 'w-asks', tool: 'Bash' }));
    sup._moveRunsToTheCloud(rows);
    expect(killed).toEqual([]);
  });

  it('waits while the cloud is resting after failures', () => {
    const { sup, rows, run, killed } = make();
    run('w-a');
    sup._cloudResting = () => true;
    sup._moveRunsToTheCloud(rows);
    expect(killed).toEqual([]);
  });

  it('does not move the same thread again within half an hour', () => {
    const { sup, rows, run, killed } = make();
    run('w-a');
    sup._moveRunsToTheCloud(rows);
    // Its cloud start failed and it came back here.
    sup.sessions.delete('w-a');
    sup._toCloud.clear();
    run('w-a');
    sup._moveRunsToTheCloud(rows);
    expect(killed).toEqual(['w-a']);
  });

  it('says on the row that it is moving, and the cloud menu says how many', () => {
    const { sup, run } = make();
    const s = run('w-a');
    s.whyLocal = { why: 'started-before' };
    const snap = sup.status();
    expect(snap.whyNotCloud['w-a']).toEqual({ at: 'mac', why: 'moving' });
    sup._cloudResting = () => true;
    expect(sup.status().whyNotCloud['w-a']).toEqual({ at: 'mac', why: 'started-before' });
    const card = whyWords(snap.whyNotCloud['w-a']);
    expect(card.head).toBe('Moving to the cloud');
    expect(card.body).toMatch(/as soon as the cloud has room/);
    const working = { startedAt: Date.now(), tail: [], activity: [] };
    expect(statusCell({ id: 'w-a', status: 'claimed' }, { session: working, whyNotCloud: { at: 'mac', why: 'moving' } }).word).toBe('Moving to cloud');
    expect(statusCell({ id: 'w-a', status: 'claimed' }, { session: working, whyNotCloud: { at: 'mac', why: 'folder' } }).word).toBe('Working locally');
    expect(cloudMoveLine({ mode: 'all', movable: 1 })).toEqual({ say: 'Moving 1 thread to the cloud', go: null });
    expect(cloudMoveLine({ mode: 'all', movable: 3 }).say).toBe('Moving 3 threads to the cloud');
    expect(cloudMoveLine({ mode: 'all', movable: 0 })).toBeNull();
  });
});

describe('with the cloud on "when this Mac is full"', () => {
  it('moves nothing by itself', () => {
    const { sup, rows, run, killed } = make({ cloudRuns: true });
    run('w-a');
    sup._moveRunsToTheCloud(rows);
    expect(killed).toEqual([]);
  });

  it('moves the threads someone asks to move, and their resume goes to the cloud though this Mac has room', () => {
    const { sup, rows, run, killed, product } = make({ cloudRuns: true });
    run('w-a');
    run('w-b');
    expect(sup.moveToCloud(['w-a', 'w-nope'])).toEqual({ moving: 1 });
    sup._moveRunsToTheCloud(rows);
    expect(killed).toEqual(['w-a']);
    sup.sessions.delete('w-a');
    sup._cloudSlotFor = () => true;
    sup._localSlotFor = () => true;
    expect(sup._whereToRun({ item: rows[0], product, cwd: folder('w-a'), engine: 'claude', continuation: true })).toBe('cloud');
    // A thread nobody asked to move still runs here first.
    expect(sup._whereToRun({ item: rows[1], product, cwd: folder('w-b'), engine: 'claude', continuation: true })).toBe('local');
  });

  it('offers the move in the cloud menu and on the thread', () => {
    expect(cloudMoveLine({ mode: 'full', movable: 2 })).toEqual({ say: '2 threads could run in the cloud', go: 'Move them' });
    expect(cloudMoveLine({ mode: 'full', movable: 1 })).toEqual({ say: '1 thread could run in the cloud', go: 'Move it' });
    expect(cloudMoveLine({ mode: 'mac', movable: 2 })).toBeNull();
    const cloud = { setUp: true, mode: 'full', projects: ['p'], movable: ['w-a'] };
    expect(threadPlace({ id: 'w-a', product: 'p' }, {}, cloud)).toBe('move');
    expect(threadPlace({ id: 'w-b', product: 'p' }, {}, cloud)).toBe('here');
    expect(threadPlace({ id: 'w-a', product: 'p' }, {}, { ...cloud, mode: 'all' })).toBe('move');
    // ⌘K still offers it by these words; the ⋯ menu no longer has the row.
    expect(PLACE_ROW.move.label).toBe('Move to the cloud');
    expect(threadMenuRows({ change: false, terminal: null, finish: true }).map((r) => r.id)).toEqual(['done']);
  });
});

describe('the plumbing', () => {
  it('reaches the supervisor from the menus', () => {
    expect(read('shared/bridge-map.mjs')).toMatch(/moveToCloud: 'zero:move-to-cloud'/);
    expect(read('main/ipc.mjs')).toMatch(/ipcMain\.handle\('zero:move-to-cloud'[\s\S]{0,120}supervisor\.moveToCloud\(/);
    expect(read('preload.cjs')).toMatch(/moveToCloud: \(payload\) => ipcRenderer\.invoke\('zero:move-to-cloud', payload\)/);
    expect(read('renderer/src/api.ts')).toMatch(/async moveToCloud\(/);
    // Every tick moves what may move.
    expect(read('main/supervisor.mjs')).toMatch(/this\._moveRunsToTheCloud\(items\)/);
  });
});
