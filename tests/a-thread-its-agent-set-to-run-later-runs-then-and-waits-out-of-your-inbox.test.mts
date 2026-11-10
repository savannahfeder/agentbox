// A THREAD ITS AGENT SET TO RUN LATER RUNS THEN, AND WAITS OUT OF YOUR INBOX
// (w-8b38137b7f).
//
// A run could not start a team test for lack of memory, set its own thread to
// run again at 1am (`runAt`, written as the agent's), and answered "Done, the
// team test is set to start again at 1am tonight. Nothing needs you." The
// thread then sat in Needs you until 1am under the app's own "Ship it
// (recommended) / Discard the change", and the person could not tell whether
// closing it would cancel the 1am run.
//
// Measured with the supervisor's own `_isFreshWork`: at 1am it answered false.
// The agent's answer is newer than anything the person wrote (`awaitingHer`),
// so the queue walked past the row for good. "Let it run now" only cleared the
// moment, which left the same answer in the way. Nothing would have run.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mts';
import { wakesItselfAt } from '../shared/answers.mts';
import { belongsInInbox, belongsInProgress, hiddenUntil, parkedByAgent, PROPOSAL_PATIENCE, threadsOwedAnAnswer } from '../renderer/src/list-rules.ts';
import { shipOfferLive } from '../renderer/src/ship-offer.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8');

const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });
const bare = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wakes-itself-'));
  dirs.push(root);
  const sup = new Supervisor({ storeRoot: root, home: root, authProfiles: ['default'] }, { listItems: () => [], listProducts: () => [], isDue: () => true }, root);
  sup._saveState = () => {};
  return sup;
};

const HOUR = 3_600_000;
const ASKED = 1_000_000;
const PAUSED = ASKED + HOUR;          // the run writes its moment...
const ANSWERED = PAUSED + 60_000;     // ...then exits, and its answer lands
const ONE_AM = ANSWERED + 3 * HOUR;

const ANSWER = '**Done, the team test is set to start again at 1am tonight. Nothing needs you.**\n\nAt 1am this thread wakes up by itself and runs the full test.';

// The thread in the picture: hers, open, the agent's answer, the agent's 1am.
const row = (over = {}) => ({
  id: 'w-1', product: 'p', title: 'Multiplayer demand for engineers', status: 'open', kind: 'directive', labels: ['founder'],
  result: ANSWER, runAt: ONE_AM,
  wrote: {
    title: { ts: ASKED, source: 'founder' }, body: { ts: ASKED, source: 'founder' }, labels: { ts: ASKED, source: 'founder' },
    runAt: { ts: PAUSED, source: 'agent' }, result: { ts: ANSWERED, source: 'agent' },
  },
  ...over,
});

describe('the moment an agent set for its own thread', () => {
  it('is read off the thread in the picture', () => {
    expect(wakesItselfAt(row())).toBe(ONE_AM);
  });

  it('is spent once a run has answered after it', () => {
    const ran = row({ wrote: { ...row().wrote, result: { ts: ONE_AM + HOUR, source: 'agent' } } });
    expect(wakesItselfAt(ran)).toBe(0);
  });

  it('is not one the person set', () => {
    expect(wakesItselfAt(row({ wrote: { ...row().wrote, runAt: { ts: PAUSED, source: 'founder' } } }))).toBe(0);
  });

  it('is not counted on a question, a closed thread or one with no moment', () => {
    expect(wakesItselfAt(row({ kind: 'question' }))).toBe(0);
    expect(wakesItselfAt(row({ status: 'done' }))).toBe(0);
    expect(wakesItselfAt(row({ runAt: 0 }))).toBe(0);
  });
});

describe('the queue at that moment', () => {
  it('starts the thread at 1am', () => {
    expect(bare()._isFreshWork(row(), ONE_AM + 1)).toBe(true);
  });

  it('does not start it before 1am', () => {
    expect(bare()._isFreshWork(row(), ONE_AM - 1)).toBe(false);
  });

  it('does not start it again once the 1am run has answered', () => {
    const ran = row({ wrote: { ...row().wrote, result: { ts: ONE_AM + HOUR, source: 'agent' } } });
    expect(bare()._isFreshWork(ran, ONE_AM + 2 * HOUR)).toBe(false);
  });

  it('leaves a moment the person set as a reminder that starts nothing', () => {
    const hers = row({ wrote: { ...row().wrote, runAt: { ts: PAUSED, source: 'founder' } } });
    expect(bare()._isFreshWork(hers, ONE_AM + 1)).toBe(false);
  });

  it('is not held back past the moment by the rests earlier runs earned', () => {
    const sup = bare();
    sup._fruitless = { 'p:w-1': { runs: 5, endedAt: ANSWERED, founderAt: ASKED } };
    expect(sup._isFreshWork(row(), ONE_AM + 1)).toBe(true);
    // The first rung still holds, so a moment set a minute ahead is no loop.
    expect(sup._isFreshWork(row({ runAt: ANSWERED + 60_000 }), ANSWERED + 60_001)).toBe(false);
  });
});

describe('where the thread waits', () => {
  it('is out of Needs you until 1am, in Scheduled', () => {
    const r = row();
    expect(hiddenUntil(r)).toBe(ONE_AM);
    expect(belongsInInbox(r, { hiddenUntil: hiddenUntil(r), now: ANSWERED + 1 })).toBe(false);
    // The footer still says the agent paused it, with Let it run now.
    expect(parkedByAgent(r, ANSWERED + 1)).toBe(true);
  });

  it('is In progress, not Needs you, once 1am has come and before the run starts', () => {
    const r = row();
    expect(belongsInInbox(r, { hiddenUntil: hiddenUntil(r), now: ONE_AM + 1 })).toBe(false);
    expect(belongsInProgress(r, { now: ONE_AM + 1 })).toBe(true);
  });

  it('comes to Needs you with the answer the 1am run writes', () => {
    const ran = row({ result: '**The team test found three things.**', wrote: { ...row().wrote, result: { ts: ONE_AM + HOUR, source: 'agent' } } });
    expect(belongsInInbox(ran, { hiddenUntil: hiddenUntil(ran), now: ONE_AM + HOUR + 1 })).toBe(true);
  });

  it('stays in Needs you when the paused answer offers a choice', () => {
    const asks = row({ result: `${ANSWER}\n\n## Options\n1. Wait for 1am (recommended)\n2. Run it on the cloud now` });
    expect(hiddenUntil(asks)).toBe(0);
    expect(belongsInInbox(asks, { hiddenUntil: hiddenUntil(asks), now: ANSWERED + 1 })).toBe(true);
  });

  it('stays in Needs you when the agent paused it without an answer', () => {
    const silent = row({ result: undefined, wrote: { ...row().wrote, result: undefined } });
    expect(hiddenUntil(silent)).toBe(0);
    expect(belongsInInbox(silent, { hiddenUntil: 0, now: ANSWERED + 1 })).toBe(true);
  });

  it('still comes to Needs you for a task under it waiting a day for a yes', () => {
    const task = { id: 'w-task', parent: 'w-1', status: 'open', kind: 'bug', labels: ['bug'], createdAt: ANSWERED - PROPOSAL_PATIENCE };
    expect(threadsOwedAnAnswer([row(), task], ANSWERED + 1).has('w-1')).toBe(true);
  });

  it('stays in Needs you when an agent filed the thread, since nothing starts that without a yes', () => {
    const filed = row({ labels: [], wrote: { ...row().wrote, title: { ts: ASKED, source: 'agent' }, body: { ts: ASKED, source: 'agent' }, labels: { ts: ASKED, source: 'agent' } } });
    expect(hiddenUntil(filed)).toBe(0);
  });
});

describe('what the thread offers while it waits', () => {
  it('does not offer to ship work its agent has not finished', () => {
    expect(shipOfferLive(row(), { change: true, running: false })).toBe(false);
  });

  it('still offers to ship once the run it waited for has answered', () => {
    const ran = row({ result: '**The team test passed.**', wrote: { ...row().wrote, result: { ts: ONE_AM + HOUR, source: 'agent' } } });
    expect(shipOfferLive(ran, { change: true, running: false })).toBe(true);
  });
});

describe('Let it run now', () => {
  it('starts the run, not only clears the moment', () => {
    // The press clears the moment (`zero:schedule` with 0); the handler pushes
    // the run when the moment it cleared was the agent's own.
    expect(src('main/ipc.mts')).toMatch(/wakesItselfAt\(before\)[^\n]*supervisor\.runNow\(product, id\)/);
  });
});
