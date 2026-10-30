// A REPLY HANDED TO THE CLOUD IS LET GO WHEN THE MAC JOINS ITS RUN.
//
// 2026-10-29, a thread sat on Up next for over three hours with the Mac awake
// and five of six agents free. The Mac had slept at 01:40, handed the
// thread's reply to the cloud (`carryWhileAsleep`), and kept it in `carried`
// in .zero-supervisor.json. On waking, the phone pass joins the cloud's run
// and says the run is of a carried reply (`carried: true`), but the wiring in
// main/main.mjs passed only project, item, runId and replies on, so
// `adoptCloudRun` never cleared the hold. With the phone pass seen every
// minute, `_carriedHolds` then kept the row from starting here for good.
// The supervisor and the phone pass each have tests; the line between them
// had none, so this runs that line itself.
//
// A mark already left behind outlives that fix: the phone pass will not join
// the same run twice. So each pass also names the commands it has finished
// with, and the supervisor lets go of any hand-over carrying one of them.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CARRIED } from '../shared/cloud-carry.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend, claimForTheCloud } from '../main/team/memory-cloud.mjs';
import { createPhoneInbox } from '../main/phone-inbox.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const main = fs.readFileSync(new URL('../main/main.mjs', import.meta.url), 'utf8');

function wiring(name) {
  const m = main.match(new RegExp(`^\\s*${name}: (\\(\\{[^\\n]*\\}\\) => supervisor\\.\\w+\\([^\\n]*\\)),$`, 'm'));
  if (!m) throw new Error(`no ${name} wiring found in main/main.mjs`);
  const calls = [];
  const supervisor = new Proxy({}, { get: (_, method) => (arg) => { calls.push({ method, arg }); return 'adopted'; } });
  // eslint-disable-next-line no-new-func
  return { fn: new Function('supervisor', `return ${m[1]};`)(supervisor), calls };
}

describe('joining the cloud\'s run of a reply the Mac handed over', () => {
  it('tells the supervisor it was handed over, so the hold on the row ends', () => {
    const { fn, calls } = wiring('adopt');
    fn({ project: 'alpha', item: 'w-1', runId: 'run-1', replies: [], commands: ['c-1'], carried: true });
    expect(calls).toEqual([{ method: 'adoptCloudRun', arg: expect.objectContaining({ product: 'alpha', itemId: 'w-1', runId: 'run-1', replies: [], carried: true }) }]);
  });

  it('a reply sent from the phone is not called handed over', () => {
    const { fn, calls } = wiring('adopt');
    fn({ project: 'alpha', item: 'w-1', runId: 'run-1', replies: ['Ship it'], commands: ['c-1'] });
    expect(calls[0].arg.carried).toBeFalsy();
    expect(calls[0].arg).toMatchObject({ product: 'alpha', itemId: 'w-1', runId: 'run-1', replies: ['Ship it'] });
  });

  it('a new thread the Mac handed over still says so too', () => {
    const { fn, calls } = wiring('adoptNew');
    fn({ project: 'alpha', item: 'w-2', runId: 'run-2', title: 'T', carried: true });
    expect(calls[0]).toEqual({ method: 'adoptCloudNewThread', arg: expect.objectContaining({ product: 'alpha', itemId: 'w-2', carried: true }) });
  });
});

describe('the wiring hands the phone pass the supervisor\'s release', () => {
  it('in the app and in the team version', () => {
    expect(main).toMatch(/^\s*carriedFinished: \(commands\) => supervisor\.carriedFinished\(commands\),$/m);
    const team = fs.readFileSync(new URL('../main/team/index.mjs', import.meta.url), 'utf8');
    expect(team).toContain('carriedFinished: phone.carriedFinished ?? (() => {}),');
  });
});

describe('the supervisor lets go of a hand-over the phone pass has finished with', () => {
  function supervisor(rows) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'carried-done-'));
    const store = { listItems: () => rows, listProducts: () => [], isDue: () => true, settleAnswer() {} };
    const sup = new Supervisor({ storeRoot: root, home: root, appDir: root, authProfiles: ['default'], maxConcurrentSessions: 3 }, store, root, root, root);
    sup._engineFor = () => 'claude';
    sup.spawnWorker = (item) => sup.sessions.set(item.id, { itemId: item.id, engine: 'claude', product: item.product });
    sup._bootAt = Date.now() - 60 * 60_000;
    return sup;
  }
  const row = (id) => ({ id, product: 'alpha', status: 'open', kind: 'directive', labels: ['founder'], priority: 5, createdAt: 1, updatedAt: 1 });

  it('the row runs here on the next pass, and only the row whose command it was', async () => {
    const sup = supervisor([row('w-1'), row('w-2')]);
    sup.handedOver({ item: 'w-1', command: 'c-1', kind: 'reply' });
    sup.handedOver({ item: 'w-2', command: 'c-2', kind: 'reply' });
    sup.phoneCarrying({ device: 'a1b2c3d4e5f6', slugs: ['alpha'] });
    await sup.tick();
    expect([...sup.sessions.keys()]).toEqual([]);
    sup.carriedFinished(['c-1', 'c-9']);
    await sup.tick();
    expect([...sup.sessions.keys()]).toEqual(['w-1']);
    expect(sup._carried).toEqual({ 'w-2': expect.objectContaining({ command: 'c-2' }) });
  });

  it('a list naming none of them changes nothing', () => {
    const sup = supervisor([]);
    sup.handedOver({ item: 'w-1', command: 'c-1', kind: 'reply' });
    sup.carriedFinished([]);
    sup.carriedFinished(['c-2']);
    expect(Object.keys(sup._carried)).toEqual(['w-1']);
  });
});

describe('the phone pass names the hand-overs it has finished with', () => {
  async function world(adoptAs, { fresh = false } = {}) {
    const cloud = createMemoryCloud();
    const me = signUpMemory(cloud, { email: `o-${Math.random()}@example.com` });
    const mac = memoryBackend(cloud, me);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carried-done-'));
    const state = { asleep: true };
    const finished = [];
    const reply = fresh
      ? { project: 'alpha', item: 'w-1', kind: 'run-now', payload: { carried: CARRIED, title: 'T', body: '' } }
      : { project: 'alpha', item: 'w-1', kind: 'reply', payload: { carried: CARRIED, text: 'Ship it' } };
    const opts = {
      backend: mac, owner: me, device: 'a1b2c3d4e5f6', projects: () => [{ slug: 'alpha', name: 'Alpha' }],
      listItems: () => [{ id: 'w-1', title: 'T', status: 'open', updatedAt: 1 }], historyOf: () => [],
      apply: async () => ({ ok: true }), stateFile: path.join(dir, 's.json'),
      kitsFor: () => true, adopt: async () => adoptAs(), adoptNew: async () => adoptAs(), runHome: () => true,
      asleep: () => state.asleep, toCarry: async () => [reply], handedOver: () => { state.handed = true; }, takenBack: () => {},
      carriedFinished: (ids) => finished.push(ids),
    };
    let inbox = createPhoneInbox({ ...opts, toCarry: async () => (state.handed ? [] : [reply]) });
    await inbox.syncOnce();
    const [cmd] = await mac.phoneCommands();
    claimForTheCloud(cloud, cmd.id, 'run-1');
    state.asleep = false;
    return { cmd, finished, inbox, again: () => { inbox = createPhoneInbox({ ...opts, toCarry: async () => [] }); return inbox.syncOnce(); } };
  }

  it('once it has joined the cloud\'s run, and on every pass after, a restart included', async () => {
    const w = await world(() => 'adopted');
    await w.inbox.syncOnce();
    expect(w.finished.at(-1)).toEqual([w.cmd.id]);
    w.finished.length = 0;
    await w.again();
    expect(w.finished.at(-1)).toEqual([w.cmd.id]);
  });

  it('not while the run is still waiting to be joined', async () => {
    const w = await world(() => 'busy');
    await w.inbox.syncOnce();
    expect(w.finished.flat()).not.toContain(w.cmd.id);
  });

  it('a fresh row it handed over, once joining its run has been given up on', async () => {
    const w = await world(() => 'failed', { fresh: true });
    for (let n = 0; n < 3; n += 1) await w.inbox.syncOnce();
    expect(w.finished.at(-1)).toEqual([w.cmd.id]);
  });
});
