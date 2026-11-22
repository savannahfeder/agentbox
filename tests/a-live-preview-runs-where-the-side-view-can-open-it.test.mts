// A LIVE PREVIEW RUNS WHERE THE SIDE VIEW CAN OPEN IT (w-9320cc73e6, 2026-11-22).
//
// Asked to show a landing page on a live port, a cloud run (w-0ce9ac5301)
// kept failing and then put the page on a public tunnel, saying it would stay
// up while the thread was open. The side view opens a localhost address on the
// person's computer, and the port was on the cloud machine, which is stopped
// once its run's work is home. Its brief said the opposite: every brief, the
// cloud's included, promised that what an agent leaves running keeps running
// while the task is open. Measured from the report's screenshot (the thread's
// header showed the cloud mark while it was in progress) and from a cloud
// run's own brief, which carried that promise beside the cloud note.
//
// On the computer the promise only held for a server started outside the
// agent's own session: a background job of its own holds the answer back until
// it ends (main/claude-input.mts) and ends with the session.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { CLOUD_NOTE, PLAIN_CLOUD_NOTE } from '../main/cloud/run.mts';
import { stillRunningNote } from '../main/claude-input.mts';
import { Supervisor } from '../main/supervisor.mts';
import { HAND_BACK } from '../shared/cloud-hand-back.mts';

const STAYS_UP = /keeps running while this task is open/;

describe('a cloud run', () => {
  for (const [name, note] of [['with a repository', CLOUD_NOTE], ['with none', PLAIN_CLOUD_NOTE]]) {
    it(`is told nothing it starts outlives the run, ${name}`, () => {
      expect(note).toMatch(/Nothing you start here outlives this run/);
    });

    it(`is told a localhost address it names opens on their computer, not this machine, ${name}`, () => {
      expect(note).toMatch(/a localhost address you name opens on their computer/);
    });

    it(`hands a live preview to their computer instead of a public tunnel, ${name}`, () => {
      expect(note).toContain(`\`${HAND_BACK} a live preview\``);
      expect(note).toMatch(/do not put it on a public tunnel/);
    });

    it(`still sends from here a page they only need to look at, ${name}`, () => {
      expect(note).toMatch(/A page they only need to look at still goes from here/);
    });

    it(`is never promised that what it leaves running keeps running, ${name}`, () => {
      expect(note).not.toMatch(STAYS_UP);
    });
  }
});

let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'live-preview-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const product = () => ({ slug: 'p', name: 'P', dir: path.join(tmp, 'p'), repoPath: path.join(tmp, 'p') });
const item = { id: 'w-a', product: 'p', title: 'Show the landing page on a live port', body: 'Run it so I can click through it.', status: 'open' };
const promptOf = (plan: { args: string[] }) => plan.args[plan.args.indexOf('-p') + 1];

async function withLeftoverRule() {
  fs.mkdirSync(product().dir, { recursive: true });
  const store = { listItems: () => [], listProducts: () => [product()], isDue: () => true, readItem: () => ({ ...item }) };
  const sup = new Supervisor({ storeRoot: tmp, home: tmp, authProfiles: ['default'], maxConcurrentSessions: 3, cleanupLeftovers: true, cleanupLeftoversSince: Date.now() }, store, tmp);
  sup._saveState = () => {};
  await sup.setLeftoverCleanup(true);
  return sup;
}

describe('what a run is told about what it leaves running', () => {
  it('a run on their computer is told it keeps running while the task is open', async () => {
    const sup = await withLeftoverRule();
    try {
      expect(promptOf(sup.spawnPlan(item, product(), {}))).toMatch(STAYS_UP);
    } finally { await sup.setLeftoverCleanup(false); }
  });

  it('a run in the cloud is not, since its machine is stopped with it', async () => {
    const sup = await withLeftoverRule();
    try {
      expect(promptOf(sup.spawnPlan(item, product(), { cloud: true }))).not.toMatch(STAYS_UP);
    } finally { await sup.setLeftoverCleanup(false); }
  });

  it('a run on their computer starts a server the person will use outside its own session', async () => {
    const sup = await withLeftoverRule();
    try {
      const note = sup.leftoverBriefNote(item);
      expect(note).toMatch(/nohup <command> > <log file> 2>&1 &/);
      expect(note).toMatch(/not as a background job of your own/);
    } finally { await sup.setLeftoverCleanup(false); }
  });
});

describe('the spawn plans a run for where it goes', () => {
  const planned = (where: string) => {
    fs.mkdirSync(product().dir, { recursive: true });
    const store = { listItems: () => [], listProducts: () => [product()], isDue: () => true };
    const sup = new Supervisor({ storeRoot: tmp, home: tmp, authProfiles: ['default'], maxConcurrentSessions: 3 }, store, tmp);
    sup._saveState = () => {};
    const asked: { cloud?: boolean }[] = [];
    sup._whereToRun = () => where;
    sup._folderFirst = () => false;
    sup._photoFirst = () => false;
    sup.workFolderFor = () => product().dir;
    sup.spawnPlan = (_i: unknown, _p: unknown, opts: { cloud?: boolean }) => { asked.push(opts); return { args: [] }; };
    sup.prepareClaudePermissions = () => {};
    sup._workerEnv = () => ({});
    const child = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), stdout: new EventEmitter() });
    sup._spawnClaude = () => child;
    sup._spawnCloudRelay = () => child;
    try { sup.spawnWorker(item, { engine: 'claude', profile: 'default' }); } catch { /* only the plan's options matter here */ }
    return asked[0] ?? null;
  };

  it('a run going to the cloud is planned as a cloud run', () => {
    expect(planned('cloud')?.cloud).toBe(true);
  });

  it('a run starting on their computer is not', () => {
    expect(planned('local')?.cloud).toBe(false);
  });

  it('a run waiting for the cloud is not, as it only starts if it runs here instead', () => {
    expect(planned('cloud-wait')?.cloud).toBe(false);
  });

  describe('a kit for the phone, which runs in the cloud', () => {
    const kitPlans = (write: (sup: Supervisor) => void) => {
      fs.mkdirSync(product().dir, { recursive: true });
      const store = { listItems: () => [], listProducts: () => [product()], isDue: () => true, readItem: () => ({ ...item }) };
      const sup = new Supervisor({ storeRoot: tmp, home: tmp, authProfiles: ['default'], maxConcurrentSessions: 3 }, store, tmp);
      const asked: { cloud?: boolean }[] = [];
      sup.spawnPlan = (_i: unknown, _p: unknown, opts: { cloud?: boolean }) => { asked.push(opts); return { args: [], command: 'stop here' }; };
      write(sup);
      return asked[0] ?? null;
    };
    const ctx = () => ({ slug: 'p', stub: item, product: product(), root: tmp, defaultEngine: 'claude', rec: {}, plain: false });

    it('plans a reply as a cloud run', () => {
      expect(kitPlans((sup) => sup._writeKit(item, { engine: 'claude', cwd: product().dir }))?.cloud).toBe(true);
    });

    it('plans a new Claude Code thread as a cloud run', () => {
      expect(kitPlans((sup) => sup._writeClaudeNewThreadKit(ctx()))?.cloud).toBe(true);
    });

    it('plans a new Codex thread as a cloud run', () => {
      expect(kitPlans((sup) => sup._writeCodexNewThreadKit(ctx()))?.cloud).toBe(true);
    });
  });
});

describe('a turn that ends with a server still out', () => {
  it('is told to stop a server for the person and leave one running the way its brief says', () => {
    const note = stillRunningNote([{ task_id: 'b1', description: 'npm run dev' }]);
    expect(note).toMatch(/If one is a server for the person, stop it and do what your brief says about leaving one running/);
    expect(note).toMatch(/"npm run dev"/);
  });
});
