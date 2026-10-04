// AN AGENT MARKS ITS TASK READY AND THE APP SHIPS IT.
//
// Measured over the 30 hours to 2026-10-02 on one Mac: 17 tasks stalled
// because Claude Code's auto-mode safety check refused the agent's own push to
// main or its update of the app folder, 16 on a folder left mid-merge or
// committed into, 6 on racing pushes. A refusal asks nobody, so nothing reached
// the approvals corner. main/ship-queue.mjs moves the ship out of the agent:
// the agent labels its row `ship`, and the app runs the project's ship script,
// one task at a time, and sends a failure back to that agent.
//
// What must NOT happen is pinned as hard as what must: a project nobody turned
// this on for is never touched, a row an agent is still on is never shipped,
// and the setting cannot point outside the project's own checkout.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  SHIP_LABEL, ShipQueue, failureReply, nextToShip, readShipSettings, shipScriptFor, shippedSha, withoutShipLabel,
} from '../main/ship-queue.mjs';

let tmp; let repo; let userDir; let folders;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-queue-'));
  repo = path.join(tmp, 'repo');
  userDir = path.join(tmp, 'user');
  folders = path.join(tmp, 'folders');
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'scripts', 'ship.mjs'), '');
  fs.mkdirSync(userDir, { recursive: true });
  for (const id of ['w-a', 'w-b', 'w-c']) fs.mkdirSync(path.join(folders, id), { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const products = () => [{ slug: 'team', repoPath: repo }, { slug: 'other', repoPath: repo }];
const settings = { team: { script: 'scripts/ship.mjs' } };
const folderFor = (item) => path.join(folders, item.id);
const row = (id, over = {}) => ({ id, product: 'team', status: 'blocked', labels: [SHIP_LABEL], updatedAt: 1000, ...over });

describe('which task ships next', () => {
  it('is a task its agent marked ready, on a project that ships', () => {
    expect(nextToShip([row('w-a')], products(), settings, { folderFor })?.item.id).toBe('w-a');
  });

  it('is the one marked ready first', () => {
    const items = [row('w-a', { wrote: { labels: { ts: 30 } } }), row('w-b', { wrote: { labels: { ts: 10 } } })];
    expect(nextToShip(items, products(), settings, { folderFor }).item.id).toBe('w-b');
  });

  it('is never a task on a project nobody turned shipping on for', () => {
    expect(nextToShip([row('w-a', { product: 'other' })], products(), settings, { folderFor })).toBeNull();
    expect(nextToShip([row('w-a')], products(), {}, { folderFor })).toBeNull();
  });

  it('is never a task without the label, a finished one, or one an agent is still on', () => {
    expect(nextToShip([row('w-a', { labels: [] })], products(), settings, { folderFor })).toBeNull();
    expect(nextToShip([row('w-a', { status: 'done' })], products(), settings, { folderFor })).toBeNull();
    expect(nextToShip([row('w-a')], products(), settings, { folderFor, isLive: () => true })).toBeNull();
  });

  it('is never a task with no folder to ship from', () => {
    expect(nextToShip([row('w-z')], products(), settings, { folderFor })).toBeNull();
  });
});

describe('the setting', () => {
  it('is read from the app\'s own data folder, and is empty when there is none', () => {
    expect(readShipSettings(userDir)).toEqual({});
    fs.writeFileSync(path.join(userDir, 'ship.json'), JSON.stringify(settings));
    expect(readShipSettings(userDir)).toEqual(settings);
  });

  it('names a script inside the project\'s own checkout, and nothing outside it', () => {
    const p = products()[0];
    expect(shipScriptFor(p, settings)).toBe(path.join(repo, 'scripts', 'ship.mjs'));
    expect(shipScriptFor(p, { team: { script: '../evil.mjs' } })).toBeNull();
    expect(shipScriptFor(p, { team: { script: '/bin/sh' } })).toBeNull();
    expect(shipScriptFor(p, { team: { script: 'scripts/missing.mjs' } })).toBeNull();
    expect(shipScriptFor({ slug: 'team', repoPath: null }, settings)).toBeNull();
  });
});

describe('shipping', () => {
  const fakeStore = () => {
    const calls = [];
    return { calls, shipped: (...a) => calls.push(['shipped', ...a]), shipFailed: (...a) => calls.push(['shipFailed', ...a]) };
  };
  const on = () => fs.writeFileSync(path.join(userDir, 'ship.json'), JSON.stringify(settings));

  it('records the commit and takes the label off when the script ships', async () => {
    on();
    const store = fakeStore();
    let after = 0;
    const q = new ShipQueue({ store, userDir, folderFor, isLive: () => false, afterShip: () => { after += 1; }, run: async (script, cwd) => {
      expect(script).toBe(path.join(repo, 'scripts', 'ship.mjs'));
      expect(cwd).toBe(path.join(folders, 'w-a'));
      return { code: 0, out: 'ship: pushing\nship: shipped abc1234.\n' };
    } });
    await q.tick([row('w-a', { labels: ['ship', 'ui'] })], products());
    expect(store.calls).toEqual([['shipped', 'team', 'w-a', { sha: 'abc1234', labels: ['ui'] }]]);
    expect(after).toBe(1);
  });

  it('hands a failure back to the agent with the script\'s own words', async () => {
    on();
    const store = fakeStore();
    const handed = [];
    const q = new ShipQueue({ store, userDir, folderFor, isLive: () => false, handBack: (item, reply) => handed.push([item.id, reply]),
      run: async () => ({ code: 1, out: 'ship: pushing\nCONFLICT (content): Merge conflict in renderer/src/App.tsx\n' }) });
    await q.tick([row('w-a')], products());
    const [kind, slug, id, { note, labels }] = store.calls[0];
    expect([kind, slug, id, labels]).toEqual(['shipFailed', 'team', 'w-a', []]);
    // The thread says it in the app's own words, naming the first error.
    expect(note).toMatch(/^It did not ship/);
    expect(note).toContain('Merge conflict in renderer/src/App.tsx');
    // And the agent that wrote the change gets the script's whole say.
    expect(handed).toHaveLength(1);
    expect(handed[0][0]).toBe('w-a');
    expect(handed[0][1]).toContain('Merge conflict in renderer/src/App.tsx');
    expect(handed[0][1]).toMatch(/Nothing was pushed/);
  });

  it('ships one task at a time, so two never race each other', async () => {
    on();
    const store = fakeStore();
    let release;
    let runs = 0;
    const q = new ShipQueue({ store, userDir, folderFor, isLive: () => false, run: () => { runs += 1; return new Promise((r) => { release = () => r({ code: 0, out: '' }); }); } });
    const first = q.tick([row('w-a'), row('w-b')], products());
    expect(q.tick([row('w-a'), row('w-b')], products())).toBeNull();
    expect(runs).toBe(1);
    release();
    await first;
    expect(q.busy).toBeNull();
  });

  it('does nothing at all on a Mac with no setting', () => {
    let runs = 0;
    const q = new ShipQueue({ store: fakeStore(), userDir, folderFor, isLive: () => false, run: async () => { runs += 1; return { code: 0, out: '' }; } });
    expect(q.tick([row('w-a')], products())).toBeNull();
    expect(runs).toBe(0);
  });
});

describe('the words', () => {
  it('reads the commit from the script\'s last line, and nothing from a failure', () => {
    expect(shippedSha('ship: shipped 9f3e2a1.')).toBe('9f3e2a1');
    expect(shippedSha('ship: those tests are red, so nothing was pushed.')).toBeNull();
  });
  it('tells the agent not to push itself', () => {
    expect(failureReply('x')).toMatch(/Do not push/);
  });
  it('takes only the ship label off', () => {
    expect(withoutShipLabel({ labels: ['ship', 'ui', 'ship'] })).toEqual(['ui']);
  });
});

describe('what the thread says', async () => {
  const { threadEvents } = await import('../renderer/src/thread-history');
  const T = Date.UTC(2026, 9, 2, 12);
  const opened = { id: 'w-a', ts: T, source: 'founder', patch: { title: 'Fix it', body: 'Fix it' } };

  it('still draws her own reply as hers', () => {
    const events = threadEvents([opened, { id: 'w-a', ts: T + 1, source: 'founder', patch: { answer: 'go' } }]);
    expect(events.at(-1).said).toBe('You replied');
  });

  it('says when the app shipped it', () => {
    const events = threadEvents([opened, { id: 'w-a', ts: T + 1, source: 'system', patch: { note: 'Shipped to main as abc1234.', labels: [] } }]);
    expect(events.some((e) => /Shipped to main as abc1234/.test(e.words ?? e.said))).toBe(true);
  });
});

describe('what the store writes', async () => {
  const { Store } = await import('../main/store.mjs');
  it('has a write for each outcome', () => {
    expect(typeof Store.prototype.shipped).toBe('function');
    expect(typeof Store.prototype.shipFailed).toBe('function');
  });
});

describe('what the agent is told', async () => {
  const { Store } = await import('../main/store.mjs');
  const { Supervisor } = await import('../main/supervisor.mjs');
  async function brief({ on }) {
    const root = path.join(tmp, 'store');
    const dir = path.join(root, 'team');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'team', name: 'Team', repoPath: repo }));
    if (on) fs.writeFileSync(path.join(userDir, 'ship.json'), JSON.stringify(settings));
    const config = { accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent' };
    const store = await new Store(config).init();
    const sup = new Supervisor(config, store, root, path.join(tmp, 'data'), userDir);
    sup._saveState = () => {};
    const made = store.fileItem('team', { title: 'Fix it', kind: 'task', body: 'Fix it.' });
    return sup.buildBrief(store.readItem('team', made.id, Date.now()), store.listProducts()[0], { continuation: false });
  }

  it('is to label the row and not push, on a project that ships through the app', async () => {
    const b = await brief({ on: true });
    expect(b).toMatch(/# How this task ships/);
    expect(b).toContain('`ship`');
    expect(b).toMatch(/Do NOT push/);
  });

  it('is nothing new on a project that does not', async () => {
    const b = await brief({ on: false });
    expect(b).not.toMatch(/How this task ships/);
  });
});

describe('what a resumed agent is told', async () => {
  // Measured 2026-10-02, the first afternoon this ran: two tasks she answered
  // "merge it" and "build it and ship" were resumed with only her words, the
  // short prompt a resumed session gets, so neither learned the new way to
  // ship and both would have pushed by hand and been refused again.
  const { Store } = await import('../main/store.mjs');
  const { Supervisor } = await import('../main/supervisor.mjs');
  async function resumed({ on }) {
    const root = path.join(tmp, 'store2');
    const dir = path.join(root, 'team');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'team', name: 'Team', repoPath: repo }));
    if (on) fs.writeFileSync(path.join(userDir, 'ship.json'), JSON.stringify(settings));
    const config = { accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent' };
    const store = await new Store(config).init();
    const sup = new Supervisor(config, store, root, path.join(tmp, 'data2'), userDir);
    sup._saveState = () => {};
    const made = store.fileItem('team', { title: 'Fix it', kind: 'task', body: 'Fix it.' });
    const item = { ...store.readItem('team', made.id, Date.now()), answer: 'merge it' };
    const product = store.listProducts()[0];
    return [sup.replyBrief(item, { product }), sup.resumeBrief(item, { continuation: true, product })];
  }

  it('is how to ship, on a project that ships through the app, whichever way it was woken', async () => {
    for (const prompt of await resumed({ on: true })) {
      expect(prompt).toMatch(/# How this task ships/);
      expect(prompt).toMatch(/Do NOT push/);
    }
  });

  it('is nothing new on a project that does not', async () => {
    for (const prompt of await resumed({ on: false })) expect(prompt).not.toMatch(/How this task ships/);
  });
});

describe('a task is shipped once per time it is marked ready', () => {
  // Measured on the first real run, 2026-10-02: the label was put on as the
  // person (who outranks the app on the ledger), so the app's write taking it
  // off was ignored. The task shipped as 4a85def, then the next two ticks ran
  // the script again ("There is nothing to ship") and woke its agent twice.
  const store = () => ({ shipped() {}, shipFailed() {} });
  const on = () => fs.writeFileSync(path.join(userDir, 'ship.json'), JSON.stringify(settings));

  it('does not ship again while the label it already handled is still there', async () => {
    on();
    let runs = 0;
    const q = new ShipQueue({ store: store(), userDir, folderFor, isLive: () => false, run: async () => { runs += 1; return { code: 0, out: 'ship: shipped abc1234.' }; } });
    const marked = row('w-a', { wrote: { labels: { ts: 100, source: 'founder' } } });
    await q.tick([marked], products());
    expect(q.tick([marked], products())).toBeNull();
    expect(runs).toBe(1);
  });

  it('remembers that across a restart of the app', async () => {
    on();
    let runs = 0;
    const run = async () => { runs += 1; return { code: 0, out: '' }; };
    const marked = row('w-a', { wrote: { labels: { ts: 100, source: 'founder' } } });
    await new ShipQueue({ store: store(), userDir, folderFor, isLive: () => false, run }).tick([marked], products());
    expect(new ShipQueue({ store: store(), userDir, folderFor, isLive: () => false, run }).tick([marked], products())).toBeNull();
    expect(runs).toBe(1);
  });

  it('ships again when it is marked ready again', async () => {
    on();
    let runs = 0;
    const q = new ShipQueue({ store: store(), userDir, folderFor, isLive: () => false, run: async () => { runs += 1; return { code: 1, out: 'red' }; } });
    await q.tick([row('w-a', { wrote: { labels: { ts: 100 } } })], products());
    await q.tick([row('w-a', { wrote: { labels: { ts: 200 } } })], products());
    expect(runs).toBe(2);
  });
});

describe('a branch that is already on main', () => {
  it('is noted as already shipped and wakes nobody', async () => {
    fs.writeFileSync(path.join(userDir, 'ship.json'), JSON.stringify(settings));
    const calls = []; const handed = [];
    const q = new ShipQueue({
      store: { shipped: (...a) => calls.push(['shipped', ...a]), shipFailed: (...a) => calls.push(['shipFailed', ...a]) },
      userDir, folderFor, isLive: () => false, handBack: (i) => handed.push(i.id),
      run: async () => ({ code: 1, out: '\nship: There is nothing to ship: this branch has no commits that origin/main does not already have.\n' }),
    });
    await q.tick([row('w-a')], products());
    expect(calls.map((c) => c[0])).toEqual(['shipped']);
    expect(handed).toEqual([]);
  });
});

describe('a ship cut off before it finished', () => {
  // Measured 2026-10-04 on w-f37a34def6: the ship started, the app restarted
  // mid-run, and because the ready mark was recorded as handled BEFORE the
  // run, no later tick tried again. The task sat labelled `ship` with two
  // commits unshipped, twice, and nothing was handed back to its agent.
  const store = () => ({ shipped() {}, shipFailed() {} });
  const on = () => fs.writeFileSync(path.join(userDir, 'ship.json'), JSON.stringify(settings));

  it('is tried again by the app that comes back up', async () => {
    on();
    const marked = row('w-a', { wrote: { labels: { ts: 100 } } });
    // The first app starts the run and never sees it end.
    const first = new ShipQueue({ store: store(), userDir, folderFor, isLive: () => false, run: () => new Promise(() => {}) });
    first.tick([marked], products());
    let runs = 0;
    const second = new ShipQueue({ store: store(), userDir, folderFor, isLive: () => false, run: async () => { runs += 1; return { code: 0, out: '' }; } });
    await second.tick([marked], products());
    expect(runs).toBe(1);
  });

  it('is still never started twice by the same app', () => {
    on();
    const marked = row('w-a', { wrote: { labels: { ts: 100 } } });
    let runs = 0;
    const q = new ShipQueue({ store: store(), userDir, folderFor, isLive: () => false, run: () => { runs += 1; return new Promise(() => {}); } });
    q.tick([marked], products());
    expect(q.tick([marked], products())).toBeNull();
    expect(runs).toBe(1);
  });
});
