// A REPLY TO A CODEX CLOUD THREAD RUNS IN THE CLOUD (w-4465054f04, 2026-10-22).
//
// In the cloud power test a Codex thread started in the cloud, on the cloud's
// own Codex sign-in, and answered. The tester's reply then ran on this Mac,
// because every Codex resume was kept here, on this Mac's own Codex login: a
// different account, whose ChatGPT plan had ended. It failed three times in 33
// seconds ("The 'gpt-6-astra' model is not supported when using Codex with a
// ChatGPT account") and the row said the subscription had ended, about an
// account the thread never used. Two storm threads did the same after a quit.
//
// The rule existed for one danger: this Mac's shared app-server keeps a
// thread it has loaded, and a thread continued elsewhere would come back to a
// server holding its old state. So only a thread that server has open stays
// here now; any other resume goes up with its rollout.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Supervisor } from '../main/supervisor.mjs';

const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });

const make = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cloud-reply-'));
  dirs.push(root);
  const product = { slug: 'p', dir: root, repoPath: root };
  const sup = new Supervisor(
    { storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles: ['default'], cloudRuns: 'all' },
    { listItems: () => [], listProducts: () => [product], isDue: () => true },
    root,
  );
  sup._saveState = () => {};
  sup.rowSessionFor = () => ({ sessionId: 'thread-1', engine: 'codex', profile: 'default' });
  return { sup, root };
};

// One live app-server on this Mac's login, holding the threads named.
const macServer = (sup, loaded = [], closed = false) => {
  sup._codexServers = new Map([['/codex-home', { client: { isClosed: () => closed }, home: '/codex-home', loaded: new Set(loaded) }]]);
};

const reply = { id: 'w-x', product: 'p', title: 't', status: 'open', answer: 'go on' };

describe('where a Codex reply may run', () => {
  it('a thread this Mac has never opened may go to the cloud', () => {
    const { sup } = make();
    macServer(sup, []);
    expect(sup._mustRunHere(reply, 'codex')).toBe(false);
  });

  it('a thread this Mac has open stays here', () => {
    const { sup } = make();
    macServer(sup, ['thread-1']);
    expect(sup._mustRunHere(reply, 'codex')).toBe(true);
  });

  it('a thread opened by an app-server that has since closed may go', () => {
    const { sup } = make();
    macServer(sup, ['thread-1'], true);
    expect(sup._mustRunHere(reply, 'codex')).toBe(false);
  });

  it('with no app-server on this Mac at all, it may go', () => {
    const { sup } = make();
    expect(sup._mustRunHere(reply, 'codex')).toBe(false);
  });

  it('a Claude Code reply was never held here', () => {
    const { sup } = make();
    macServer(sup, ['thread-1']);
    expect(sup._mustRunHere(reply, 'claude')).toBe(false);
  });
});

describe('at the spawn', () => {
  const spawnWith = ({ where, loaded }) => {
    const { sup, root } = make();
    macServer(sup, loaded);
    sup._whereToRun = () => where;
    sup._mayRunHereInstead = () => true;
    sup._cloudLoginRunnable = () => true;
    sup._folderFirst = () => false;
    sup.workFolderFor = () => root;
    sup.spawnPlan = () => ({ args: [], resumeId: 'thread-1', resumeProfile: 'default' });
    sup.prepareClaudePermissions = () => {};
    sup._workerEnv = () => ({});
    sup._rememberCloudStart = () => {};
    const child = new (class extends EventEmitter {})();
    child.stderr = new EventEmitter();
    let resumedIn = null;
    sup._spawnCodexWorker = (plan, { cloud }) => { resumedIn = { cloud, resumeId: plan.resumeId }; return child; };
    sup.spawnWorker({ ...reply }, { engine: 'codex', profile: 'default', continuation: true });
    return { session: sup.sessions.get('w-x') ?? null, resumedIn };
  };

  it('resumes a thread this Mac never opened in the cloud, with its conversation', () => {
    const { session, resumedIn } = spawnWith({ where: 'cloud', loaded: [] });
    expect(session?.cloud).toBe(true);
    expect(resumedIn).toEqual({ cloud: true, resumeId: 'thread-1' });
  });

  it('resumes a thread this Mac has open here', () => {
    const { session, resumedIn } = spawnWith({ where: 'cloud', loaded: ['thread-1'] });
    expect(session?.cloud).toBe(false);
    expect(resumedIn).toEqual({ cloud: false, resumeId: 'thread-1' });
  });

  it('waits its turn for the cloud like any other run when this Mac does not hold it', () => {
    expect(spawnWith({ where: 'cloud-wait', loaded: [] }).session).toBe(null);
  });

  it('runs here while waiting, when this Mac holds it', () => {
    expect(spawnWith({ where: 'cloud-wait', loaded: ['thread-1'] }).session?.cloud).toBe(false);
  });
});

describe('what this Mac holds', () => {
  it('a thread a run on this Mac opened is held once that run has ended', () => {
    const { sup } = make();
    const server = { client: { isClosed: () => false }, home: '/codex-home', loaded: new Set() };
    sup._codexServers = new Map([['/codex-home', server]]);
    const worker = new EventEmitter();
    worker.threadId = 'thread-9';
    sup._noteCodexThreadHere(server, worker);
    expect(sup._codexHeldHere('thread-9')).toBe(false);
    worker.emit('exit', 0, null);
    expect(sup._codexHeldHere('thread-9')).toBe(true);
    expect(sup._codexHeldHere('thread-1')).toBe(false);
  });
});
