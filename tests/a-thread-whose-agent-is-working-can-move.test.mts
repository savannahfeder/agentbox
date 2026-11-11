// A THREAD WHOSE AGENT IS WORKING CAN MOVE (w-7858c62f4d).
//
// You file a thread in the wrong project and notice once its agent has
// started. ⌘K and More actions both said "An agent is working on this one.
// Stop it first.", so the move you reached for refused the one case you hit
// most. Measured through the real store and the move the app's handler runs,
// with the agent faked: it is stopped, the old row closes, and the new row is
// open so its run starts in the new project.
import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { moveThread, DID_NOT_STOP } from '../main/move-thread.mts';
import { CHANGED_HERE, leftByAMove, whyItCannotMove } from '../shared/move-thread.mts';

let store, root;
const project = (slug, name) => {
  const dir = path.join(root, slug);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ name }));
};
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'move-live-'));
  project('alexandria', 'Alexandria');
  project('agentbox', 'Agentbox');
  store = await new Store({ accountRoot: root, products: [] }).init();
});

// A thread an agent has picked up and is working on.
const working = () => {
  const made = store.composeItem('alexandria', { title: 'main is red', body: 'fix the red tests', model: 'opus' });
  store.modules.workItemsDisk.updateWorkItem(store.productDir('alexandria'), made.id, { note: 'Reading the failing runs.' }, { source: 'agent' });
  return store.readItem('alexandria', made.id);
};

// The agent, faked: running until stopped, then gone after `stopsAfter` polls.
const agent = ({ stopsAfter = 2, changed = () => false } = {}) => {
  let running = true; let stopped = 0; let polls = 0;
  return {
    get stopped() { return stopped; },
    deps: {
      store,
      isRunning: () => { if (stopped && ++polls > stopsAfter) running = false; return running; },
      stopSession: () => { stopped++; },
      changedCode: changed,
      pollMs: 1,
      waitMs: 200,
    },
  };
};

describe('the rule ⌘K and the menu draw from', () => {
  it('no longer refuses a thread because an agent is in it', () => {
    // The `live` the screen used to pass is ignored now.
    expect(whyItCannotMove({ status: 'open', epoch: 1 }, { live: true } as never)).toBe(null);
  });
  it('still refuses a finished one', () => {
    expect(whyItCannotMove({ status: 'done', epoch: 1 })).toMatch(/finished/);
  });
});

describe('moving a thread whose agent is working', () => {
  it('stops the agent, closes the old row, and opens the new one to run there', async () => {
    const was = working();
    const a = agent();
    const out = await moveThread(a.deps, { product: 'alexandria', id: was.id, to: 'agentbox' });

    expect(out.ok).toBe(true);
    expect(a.stopped).toBe(1);
    const old = store.readItem('alexandria', was.id);
    expect(old.status).toBe('done');
    expect(leftByAMove(old)).toBe(true);
    const landed = store.readItem('agentbox', out.item.id);
    expect(landed.status).toBe('open');
    expect(landed.title).toBe('main is red');
    expect(landed.body).toContain('fix the red tests');
    expect(landed.labels).toContain('founder');
  });

  it('refuses without stopping it when it has already changed code', async () => {
    const was = working();
    const a = agent({ changed: () => true });
    const out = await moveThread(a.deps, { product: 'alexandria', id: was.id, to: 'agentbox' });

    expect(out).toEqual({ ok: false, error: CHANGED_HERE });
    expect(a.stopped).toBe(0);
    expect(store.readItem('alexandria', was.id).status).toBe(was.status);
  });

  it('refuses, stopped, when it wrote code in its last moments', async () => {
    const was = working();
    let calls = 0;
    const a = agent({ changed: () => ++calls > 1 });
    const out = await moveThread(a.deps, { product: 'alexandria', id: was.id, to: 'agentbox' });

    expect(out).toEqual({ ok: false, error: CHANGED_HERE });
    expect(store.readItem('alexandria', was.id).status).toBe('blocked');
    expect(store.listItems().filter((i) => i.product === 'agentbox')).toEqual([]);
  });

  it('gives up with a sentence when the agent will not stop, and moves nothing', async () => {
    const was = working();
    const a = agent({ stopsAfter: Infinity });
    const out = await moveThread(a.deps, { product: 'alexandria', id: was.id, to: 'agentbox' });

    expect(out).toEqual({ ok: false, error: DID_NOT_STOP });
    expect(store.listItems().filter((i) => i.product === 'agentbox')).toEqual([]);
  });
});

describe('a thread nobody is working on', () => {
  it('moves as before, stopping nothing and keeping the status it had', async () => {
    const was = working();
    store.modules.workItemsDisk.updateWorkItem(store.productDir('alexandria'), was.id, { result: 'Fixed.', status: 'blocked' }, { source: 'agent', now: Date.now() + 2000 });
    const a = agent();
    a.deps.isRunning = () => false;
    const out = await moveThread(a.deps, { product: 'alexandria', id: was.id, to: 'agentbox' });

    expect(out.ok).toBe(true);
    expect(a.stopped).toBe(0);
    expect(store.readItem('agentbox', out.item.id).status).toBe('blocked');
  });
});
