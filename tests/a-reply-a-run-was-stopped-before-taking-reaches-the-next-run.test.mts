// A REPLY A RUN WAS STOPPED BEFORE TAKING REACHES THE NEXT RUN.
//
// What broke (w-0a9a000e0c76, 2026-11-18): a long round of feedback started a
// cloud run at 22:04:59. Its agent said its conversation id 34 s after the
// relay began, and 1 s later the run was stopped and the thread moved back to
// the Mac when the next reply arrived (22:06:15). The app had already marked
// the feedback heard in that conversation on the agent's first line, the
// start-up notice that carries the id. The conversation's own transcript shows
// the feedback only queued, never taken as a turn. The Mac then resumed the
// same conversation, `queuedReplyText` skipped the feedback as heard, and the
// agent answered only the short reply that came after it. The person had to
// paste the feedback in again.
//
// Now a run's starting words count as heard only once its agent has begun
// answering them, so a run stopped before that leaves them for the next one.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { Supervisor } from '../main/supervisor.mts';
import { Store } from '../main/store.mts';
import { harnessFor } from '../main/harnesses.mts';

let tmp; let root; let repo; let folder; let store; let row; let relays; let supervisors;

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'reply-before-taken-')));
  root = path.join(tmp, 'store');
  repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  fs.mkdirSync(path.join(root, 'team'), { recursive: true });
  fs.writeFileSync(path.join(root, 'team', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'team', name: 'Team', repoPath: repo }));
  store = await new Store({ accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent' }).init();
  row = store.fileItem('team', { title: 'Demo video', kind: 'task', body: 'Cut the demo video.' });
  folder = path.join(repo, '.claude', 'worktrees', row.id);
  fs.mkdirSync(folder, { recursive: true });
  store.recordSessionResult('team', row.id, { result: 'The new cut is ready. Does it look right?' });
  store.answerItem('team', row.id, { answer: 'feedback: the camera is too close, and drop the zoom at the start', status: 'open' });
  relays = [];
  supervisors = [];
});

afterEach(() => {
  for (const sup of supervisors) sup.stop();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const fakeRelay = () => {
  const c = new EventEmitter();
  c.stdin = new PassThrough();
  c.stdout = new PassThrough();
  c.stderr = new PassThrough();
  c.pid = 999_999;
  c.kill = () => true;
  relays.push(c);
  return c;
};

function launch() {
  const storeMcp = path.join(tmp, 'store-mcp.sh');
  fs.writeFileSync(storeMcp, '#!/bin/sh\n');
  const sup = new Supervisor({ storeRoot: root, home: tmp, maxConcurrentSessions: 3, authProfiles: ['default'], storeMcpCommand: storeMcp, cloudRuns: 'all' }, store, tmp);
  supervisors.push(sup);
  sup.writeMcpConfig = () => null;
  sup._workerEnv = () => ({});
  sup._spawnCloudRelay = fakeRelay;
  sup._folderFirst = () => false;
  sup._photoFirst = () => false;
  sup.workFolderFor = () => folder;
  sup._whereToRun = () => 'cloud';
  sup._cloudLoginRunnable = () => true;
  sup._liveProfilesFor = () => ['default'];
  sup.prepareClaudePermissions = () => {};
  return sup;
}

const line = (o) => `${JSON.stringify(o)}\n`;
const flush = () => new Promise((r) => setImmediate(r));
const fresh = () => ({ ...store.readItem('team', row.id), product: 'team' });
const INIT = { type: 'system', subtype: 'init', session_id: 'conv-1' };
const SPEAKS = { type: 'assistant', session_id: 'conv-1', message: { content: [{ type: 'text', text: 'Pulling the camera back.' }] } };

/** Starts a run on her first reply, lets the agent say `frames`, then stops it. */
async function runThenStop(sup, frames) {
  const real = sup.spawnPlan.bind(sup);
  sup.spawnPlan = () => ({ args: ['-p', 'the brief'], prompt: 'the brief', resumeId: null });
  const first = fresh();
  sup.spawnWorker(first, { continuation: true });
  const relay = relays.at(-1);
  for (const f of frames) relay.stdout.write(line(f));
  await flush();
  sup.sessions.get(row.id).stoppedByUs = true;
  relay.emit('exit', 143, null);
  await flush();
  sup.spawnPlan = real;
  return first;
}

/** What the next run on the same conversation is told she said. */
function nextRunHears(sup) {
  sup.rowSessionFor = () => ({ sessionId: 'conv-1', profile: null, engine: 'claude' });
  const plan = sup.spawnPlan(fresh(), { slug: 'team', name: 'Team', dir: path.join(root, 'team') }, { continuation: true });
  return plan.prompt.split('What they said:').pop();
}

describe('a run stopped before its agent took the reply it started on', () => {
  it('the reported case: stopped one line in, the next run on that conversation gets both replies', async () => {
    const sup = launch();
    const first = await runThenStop(sup, [INIT]);
    expect(sup._heardIn(first, 'conv-1')).toBe(false);
    store.answerItem('team', row.id, { answer: 'also add profile pictures for everyone', status: 'open' });
    const said = nextRunHears(sup);
    expect(said).toContain('the camera is too close');
    expect(said).toContain('add profile pictures');
  });

  it('stopped before it said anything at all, the reply is not heard either', async () => {
    const sup = launch();
    const first = await runThenStop(sup, []);
    expect(sup._heardIn(first, 'conv-1')).toBe(false);
  });

  it('once the agent has begun answering, the reply is heard and is not sent to that conversation again', async () => {
    const sup = launch();
    const first = await runThenStop(sup, [INIT, SPEAKS]);
    expect(sup._heardIn(first, 'conv-1')).toBe(true);
    store.answerItem('team', row.id, { answer: 'also add profile pictures for everyone', status: 'open' });
    const said = nextRunHears(sup);
    expect(said).not.toContain('the camera is too close');
    expect(said).toContain('add profile pictures');
  });

  it('a run streaming its first words counts as having begun', async () => {
    const sup = launch();
    const first = await runThenStop(sup, [INIT, { type: 'stream_event', session_id: 'conv-1', event: { type: 'message_start' } }]);
    expect(sup._heardIn(first, 'conv-1')).toBe(true);
  });
});

describe('what counts as an agent having begun on its starting words', () => {
  const claude = harnessFor('claude').readers();
  const codex = harnessFor('codex').readers();
  const opencode = harnessFor('opencode').readers();

  it('Claude: its first message or streamed words, never the start-up notice or a hook line', () => {
    expect(claude.took(line(SPEAKS))).toBe(true);
    expect(claude.took(line({ type: 'stream_event', event: { type: 'message_start' } }))).toBe(true);
    expect(claude.took(line(INIT))).toBe(false);
    expect(claude.took(line({ type: 'system', subtype: 'hook_response' }))).toBe(false);
    expect(claude.took('not json')).toBe(false);
  });

  it('Codex: the turn starting, never the thread starting', () => {
    expect(codex.took('turn/started', { turn: { id: 't-1' } })).toBe(true);
    expect(codex.took('item/started', { item: { id: 'i-1', type: 'agentMessage' } })).toBe(true);
    expect(codex.took('thread/started', { thread: { id: 'th-1' } })).toBe(false);
  });

  it('OpenCode: a part of the answer arriving, never the session being made', () => {
    expect(opencode.took('message.part.updated', { part: { type: 'text' } })).toBe(true);
    expect(opencode.took('session.updated', { info: {} })).toBe(false);
  });
});
