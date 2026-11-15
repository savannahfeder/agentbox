// A FAILED SHIP TELLS ITS AGENT WHY, AND DOES NOT REPEAT THE OLD REPLY.
//
// What broke (found 2026-10-31 replaying a thread that heard one reply seven
// times): the ship queue hands a failed branch back with the failure's exact
// words, and `spawnWorker` dropped them whenever it paused to ready the task's
// folder or photograph its checkout, which is every task with a folder. The run
// that came back was an ordinary reply run, so the agent read its person's old
// "Ship it" as a new message and never heard why the ship failed. Read from real
// conversations: on one thread both failed ships brought back the 9,790
// characters of the reply run before them, on another two brought back 8,801,
// and none carried a failure. The store holds 209 failed ships on 134 threads.
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { waitFor } from './waiting.mts';

const FAILURE = 'Agentbox tried to ship your branch and it did not go out. It went red: 1 test failed.';
const OLD_REPLY = 'Option 1: Ship it';
const made = [];

afterEach(() => { while (made.length) { try { fs.rmSync(made.pop(), { recursive: true, force: true }); } catch {} } });

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'failed-ship-'));
  made.push(dir);
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  git('add', '.');
  git('commit', '-q', '-m', 'first');
  return dir;
}

// A row whose reply was answered, and has just come back from the ship queue.
const settled = {
  id: 'w-bounced', product: 'agentbox', title: 'A task', status: 'open', kind: 'directive', labels: ['founder'],
  answer: OLD_REPLY, answeredThrough: 1_000, result: 'It is on its way to shipping.',
  wrote: { answer: { ts: 1_000, source: 'founder' }, result: { ts: 2_000, source: 'agent' } },
};

function supervisorOver(repoPath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'failed-ship-store-'));
  made.push(dir);
  const product = { slug: 'agentbox', dir, repoPath };
  const sup = new Supervisor(
    {
      home: path.join(dir, 'home'), storeRoot: dir, claudeBin: '/nonexistent/claude', codexBin: '/nonexistent/codex',
      maxConcurrentSessions: 3, authProfiles: ['default'], codexHome: path.join(dir, 'codex-home'),
    },
    {
      listItems: () => [settled], listProducts: () => [product], readItem: () => settled, isDue: () => true,
      settleAnswer() {}, recordSessionResult() {},
    },
    '/nonexistent-app',
  );
  sup._whereToRun = () => 'local';
  return { sup, product };
}

// Where the run's words are decided. Thrown out of here so nothing is started.
function plansOf(sup) {
  const plans = [];
  sup.spawnPlan = (item, product, opts) => { plans.push({ opts }); throw new Error('stop here'); };
  return plans;
}

describe('a failed ship on a task with a folder', () => {
  it('keeps the failure through readying the folder and photographing the checkout', async () => {
    const { sup } = supervisorOver(repo());
    const plans = plansOf(sup);

    sup.spawnWorker(settled, { continuation: true, shipFailure: FAILURE });

    await waitFor('the start to come through its folder and its photograph', () => plans.length > 0);
    expect(plans[0].opts.shipFailure).toBe(FAILURE);
  });

  it('keeps it when the folder is ready and only the photograph waits', async () => {
    const { sup } = supervisorOver(repo());
    const plans = plansOf(sup);
    sup._folderFirst = () => false;

    sup.spawnWorker(settled, { continuation: true, shipFailure: FAILURE });

    await waitFor('the start to come through its photograph', () => plans.length > 0);
    expect(plans[0].opts.shipFailure).toBe(FAILURE);
  });
});

describe('what that run is told', () => {
  const prompted = (over = {}) => {
    const { sup, product } = supervisorOver(repo());
    sup.rowSessionFor = () => over.chat ?? null;
    return sup.spawnPlan(settled, product, { continuation: true, shipFailure: FAILURE }).prompt;
  };

  it('going back to its own conversation: the failure, and the old reply nowhere', () => {
    const prompt = prompted({ chat: { sessionId: 's-1', profile: 'default' } });
    expect(prompt).toContain(FAILURE);
    expect(prompt).not.toContain(OLD_REPLY);
  });

  it('with no conversation to go back to: the failure too', () => {
    expect(prompted()).toContain(FAILURE);
  });

  it('an ordinary reply run is told the reply and no failure', () => {
    const { sup, product } = supervisorOver(repo());
    sup.rowSessionFor = () => ({ sessionId: 's-1', profile: 'default' });
    const prompt = sup.spawnPlan({ ...settled, answer: 'A new thought' }, product, { continuation: true }).prompt;
    expect(prompt).toContain('A new thought');
    expect(prompt).not.toContain(FAILURE);
  });
});
