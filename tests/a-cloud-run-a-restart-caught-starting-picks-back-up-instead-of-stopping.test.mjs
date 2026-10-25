// A CLOUD RUN A RESTART CAUGHT STARTING PICKS BACK UP INSTEAD OF STOPPING.
//
// What broke (2026-10-21): they replied on two threads ("Cloud release
// requirements and setup" at 03:38:34 UTC, and the multiplayer thread) and
// restarted the app to update. Both then read Stopped for fifteen minutes with
// no agent holding either row, while a thread answered seven seconds later
// carried on working. Read off the code that day: a cloud run's session id
// comes from its agent, which only speaks once the cloud machine is up, a
// minute or more after the start. Only then was the run written to
// `_liveSessions`, the record a restart rejoins. A quit before that left the
// run going in the cloud (SIGHUP, main/cloud/run.mjs) with nothing on this Mac
// pointing at it: the reply stayed marked delivered, the startup sweep had no
// record to follow, and the row was `stalled`, which the list draws as Stopped.
//
// Now a cloud run is remembered from the moment it starts. After a restart the
// sweep joins it like any run the app left going, the thread reads Queued and
// then Working, and its reply is settled once it finishes. A start that never
// reached the cloud gives its reply back instead, once it can no longer still
// be on its way there.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { Supervisor } from '../main/supervisor.mjs';
import { Store } from '../main/store.mjs';
import { writeMarker } from '../main/cloud/marker.mjs';
import { answerSettled } from '../shared/answers.mjs';

let tmp; let root; let repo; let folder; let store; let row; let relays; let supervisors;

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-cut-starting-')));
  root = path.join(tmp, 'store');
  repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  fs.mkdirSync(path.join(root, 'team'), { recursive: true });
  fs.writeFileSync(path.join(root, 'team', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'team', name: 'Team', repoPath: repo }));
  store = await new Store({ accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent' }).init();
  row = store.fileItem('team', { title: 'Cloud release', kind: 'task', body: 'Plan the release.' });
  folder = path.join(repo, '.claude', 'worktrees', row.id);
  fs.mkdirSync(folder, { recursive: true });
  store.answerItem('team', row.id, { answer: 'here is the output of the setup script', status: 'open' });
  relays = [];
  supervisors = [];
});

afterEach(() => {
  for (const sup of supervisors) sup.stop();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const fakeRelay = (args, opts) => {
  const c = new EventEmitter();
  c.stdin = new PassThrough();
  c.stdout = new PassThrough();
  c.stderr = new PassThrough();
  c.pid = 999_999;
  c.args = args;
  c.opts = opts;
  c.kill = () => true;
  relays.push(c);
  return c;
};

/** The app, opened on the store. Each call is one launch of it. */
function launch() {
  const storeMcp = path.join(tmp, 'store-mcp.sh');
  fs.writeFileSync(storeMcp, '#!/bin/sh\n');
  const sup = new Supervisor({ storeRoot: root, home: tmp, maxConcurrentSessions: 3, authProfiles: ['default'], storeMcpCommand: storeMcp, cloudRuns: 'all' }, store, tmp);
  supervisors.push(sup);
  sup.writeMcpConfig = () => null;
  sup._workerEnv = () => ({});
  sup._spawnCloudRelay = fakeRelay;
  return sup;
}

/** Her reply goes to a cloud run through the ordinary spawn, as the tick sends it. */
function startInTheCloud(sup, { where = 'cloud' } = {}) {
  sup._folderFirst = () => false;
  sup._photoFirst = () => false;
  sup.workFolderFor = () => folder;
  sup._whereToRun = () => where;
  sup._cloudLoginRunnable = () => true;
  sup._liveProfilesFor = () => ['default'];
  sup.prepareClaudePermissions = () => {};
  sup.spawnPlan = () => ({ args: ['-p', 'the brief'], prompt: 'the brief', resumeId: null });
  const item = store.readItem('team', row.id);
  sup._handledAnswers.add(sup._answerKey(item));
  sup.spawnWorker(item, { continuation: true });
  return sup.sessions.get(row.id);
}

/** What the relay leaves in the folder when the quit reaches it mid-start. */
const leftGoing = () => writeMarker(folder, { runId: 'r-1', sessionId: 'agentbox-r-1', state: 'detached', pid: null, cursor: 0 });

const line = (o) => `${JSON.stringify(o)}\n`;
const flush = () => new Promise((r) => setImmediate(r));
const fresh = () => store.readItem('team', row.id);

describe('a cloud run the app quits before its agent has said its id', () => {
  it('is remembered for a restart from the moment it starts', () => {
    const before = launch();
    const session = startInTheCloud(before);
    expect(session?.cloud).toBe(true);
    expect(session.sessionId ?? null).toBe(null);
    // The app goes; the exit handler never runs.
    const after = launch();
    expect(after._liveSessions[row.id]).toMatchObject({ product: 'team', cwd: folder, cloud: true, sessionId: null });
  });

  it('is joined when the app opens again, reads Queued and then Working rather than Stopped, and settles her reply once', async () => {
    startInTheCloud(launch());
    leftGoing();
    const after = launch();
    const started = [];
    after.spawnWorker = (item, opts) => started.push({ id: item.id, ...opts });

    after.recoverInterrupted('startup');
    const joining = relays.at(-1);
    expect(joining.args).toContain('--agentbox-import-only');
    expect(joining.opts.cwd).toBe(folder);
    expect(after.status().stalled).not.toContain(row.id);
    expect(after.status().queued).toContain(row.id);

    joining.stdout.write(line({ type: 'system', subtype: 'init', session_id: 'cloud-s-1' }));
    joining.stdout.write(line({ type: 'assistant', message: { content: [{ type: 'text', text: 'Reading the setup output.' }] } }));
    await flush();
    expect(after.status().running.map((r) => r.itemId)).toContain(row.id);
    expect(after.status().stalled).not.toContain(row.id);

    joining.stdout.write(line({ type: 'result', subtype: 'success', is_error: false, result: 'The live plans are set up.' }));
    joining.emit('exit', 0, null);
    await flush();
    expect(fresh().result).toBe('The live plans are set up.');
    expect(answerSettled(fresh())).toBe(true);
    expect(after._liveSessions[row.id]).toBeUndefined();
    expect(after.status().stalled).not.toContain(row.id);
    await after.tick();
    expect(started).toEqual([]);
  });

  it('keeps the id the joined run says, so a run whose work did not come home is resumed, not restarted', async () => {
    startInTheCloud(launch());
    leftGoing();
    const after = launch();
    after.recoverInterrupted('startup');
    const joining = relays.at(-1);
    joining.stdout.write(line({ type: 'system', subtype: 'init', session_id: 'cloud-s-1' }));
    joining.emit('exit', 75, null);
    await flush();
    expect(after._liveSessions[row.id]).toMatchObject({ sessionId: 'cloud-s-1', cloud: true });
    expect(after._heardIn(fresh(), 'cloud-s-1')).toBe(true);
  });

  it('waits for a start that may still be on its way to the cloud, without reading Stopped', () => {
    startInTheCloud(launch());
    const after = launch();
    after.recoverInterrupted('startup');
    expect(after._answerDelivered(fresh())).toBe(true);
    expect(after._recoverPending).toBe(true);
    expect(after.status().stalled).not.toContain(row.id);
    expect(after.status().queued).toContain(row.id);
  });

  it('gives her reply back once that start can no longer be under way, and it goes out once', async () => {
    startInTheCloud(launch());
    const after = launch();
    after._liveSessions[row.id].startedAt = Date.now() - 11 * 60_000;
    const started = [];
    after.spawnWorker = (item, opts) => { started.push({ id: item.id, continuation: opts.continuation }); after.sessions.set(item.id, { itemId: item.id, product: 'team', tail: [] }); };
    after.recoverInterrupted('startup');
    expect(after._liveSessions[row.id]).toBeUndefined();
    expect(after._answerDelivered(fresh())).toBe(false);
    expect(after.status().stalled).not.toContain(row.id);
    await after.tick();
    await after.tick();
    expect(started).toEqual([{ id: row.id, continuation: true }]);
  });

  it('gives it back at once when the run has already come home without a word', async () => {
    startInTheCloud(launch());
    leftGoing();
    const after = launch();
    after.recoverInterrupted('startup');
    // It had finished while the app was away: brought home, nothing replayed.
    fs.rmSync(path.join(repo, '.git', 'agentbox-cloud.json'));
    relays.at(-1).emit('exit', 0, null);
    await flush();
    after.recoverInterrupted('capacity');
    expect(after._liveSessions[row.id]).toBeUndefined();
    expect(after._answerDelivered(fresh())).toBe(false);
  });
});

describe('what the early record must not change', () => {
  it('a cloud start that is refused leaves no record behind', async () => {
    const sup = launch();
    startInTheCloud(sup);
    relays.at(-1).emit('exit', 1, null);
    await flush();
    expect(sup._liveSessions[row.id]).toBeUndefined();
  });

  it('a cloud run that left its work in the cloud keeps its record', async () => {
    const sup = launch();
    startInTheCloud(sup);
    leftGoing();
    relays.at(-1).emit('exit', 75, null);
    await flush();
    expect(sup._liveSessions[row.id]).toMatchObject({ cloud: true, cwd: folder });
  });

  it('a run on this Mac is still only remembered once it says its id', () => {
    const sup = launch();
    // Any program will do: what matters is the record, which waits for the id
    // as it always has.
    sup.config.claudeBin = process.execPath;
    const local = startInTheCloud(sup, { where: 'local' });
    expect(local?.cloud ?? false).toBe(false);
    expect(sup._liveSessions[row.id]).toBeUndefined();
  });

  it('a run that has said its id is remembered under that id', () => {
    const sup = launch();
    const session = startInTheCloud(sup);
    relays.at(-1).stdout.write(line({ type: 'system', subtype: 'init', session_id: 'cloud-s-2' }));
    return flush().then(() => {
      expect(session.sessionId).toBe('cloud-s-2');
      expect(sup._liveSessions[row.id]).toMatchObject({ sessionId: 'cloud-s-2', cloud: true });
    });
  });
});
