// A LATE CLOUD RUN NEVER COUNTS AS HEARING A REPLY SENT AFTER IT.
//
// What broke (w-0e77857f54): a sleeping Mac handed a thread's waiting reply to
// the cloud, and the cloud ran it. The run's work only came home six days and
// 22 hours later, inside the phone pass's seven-day window. In between, the
// person had read the thread and sent a new reply, "Ship it". Taking the run in,
// `adoptCloudRun` marked whatever reply was on the row at that moment as the
// one the run carried (`_answerOnTheRowHeard`), so when the run ended the new
// reply was settled (answeredThrough moved to its time). The thread then showed
// the six-day-old answer to the earlier reply, and "Ship it" never reached an
// agent. Measured on the thread's own ledger: the run's result landed at the
// same moment as answeredThrough, and its conversation shows the last reply it
// was given was the earlier one.
//
// Now the phone pass says which reply it handed over and when, and only that
// reply, unchanged since the hand-over, counts as heard.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CARRIED } from '../shared/cloud-carry.mts';
import { createMemoryCloud, signUpMemory, memoryBackend, claimForTheCloud } from '../main/team/memory-cloud.mts';
import { createPhoneInbox } from '../main/phone-inbox.mts';
import { Supervisor } from '../main/supervisor.mts';
import { kitCopyPath } from '../main/cloud/kit.mts';

const DAY = 24 * 3600_000;
const HANDED_AT = Date.parse('2026-11-01T01:16:00Z');

const row = (answer, ts) => ({
  id: 'w-1', product: 'alpha', status: 'open', kind: 'task', labels: ['founder'], title: 'Write the report',
  createdAt: 1000, updatedAt: ts, answer, wrote: { answer: { ts, source: 'founder' } },
});

function adopting(item) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'late-cloud-run-'));
  const cwd = path.join(root, 'w-1');
  fs.mkdirSync(cwd);
  execFileSync('git', ['init', '-q'], { cwd });
  const store = {
    listItems: () => [item], listProducts: () => [{ slug: 'alpha', name: 'Alpha', dir: root }], isDue: () => true,
    readItem: (slug, id) => (id === item.id ? item : null),
    answerItem: () => { throw new Error('a handed-over reply is on the row already'); },
  };
  const sup = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root, root, root);
  sup._tellServerJoined = async () => {};
  sup._bringCloudHome = () => {};
  fs.mkdirSync(path.join(root, 'cloud-kits'), { recursive: true });
  fs.writeFileSync(kitCopyPath(root, 'alpha', 'w-1'), JSON.stringify({ v: 1, engine: 'claude', item: 'w-1', project: 'alpha', cwd, marker: { branch: 'b' } }));
  const adopt = async (carriedReply) => {
    expect(await sup.adoptCloudRun({ product: 'alpha', itemId: 'w-1', runId: 'run-1', replies: [], carried: true, carriedReply })).toBe('adopted');
    // The run says its conversation's id once it is joined, which is when its reply is counted heard in it.
    sup._learnJoinedSession('w-1', sup._liveSessions['w-1'], 'conv-1');
    return { heard: sup._heardIn(item, 'conv-1'), delivered: sup._answerDelivered(item) };
  };
  return { adopt };
}

describe('taking in the cloud\'s run of a reply this Mac handed over', () => {
  it('the reply it handed over, still the one on the row, is heard by the run', async () => {
    const t = adopting(row('Turn it back on', HANDED_AT - 3 * DAY));
    expect(await t.adopt({ text: 'Turn it back on', at: HANDED_AT })).toEqual({ heard: true, delivered: true });
  });

  it('a different reply sent after the hand-over is not, so it still gets a run of its own', async () => {
    const t = adopting(row('Ship it', HANDED_AT + 6 * DAY));
    expect(await t.adopt({ text: 'Turn it back on', at: HANDED_AT })).toEqual({ heard: false, delivered: false });
  });

  it('the same words sent again after the hand-over are a new reply, not the one it carried', async () => {
    const t = adopting(row('continue', HANDED_AT + 2 * 3600_000));
    expect(await t.adopt({ text: 'continue', at: HANDED_AT })).toEqual({ heard: false, delivered: false });
  });

  it('a reply written a moment before the hand-over is still the one it carried', async () => {
    const t = adopting(row('continue', HANDED_AT - 1));
    expect(await t.adopt({ text: 'continue', at: HANDED_AT })).toEqual({ heard: true, delivered: true });
  });
});

describe('the phone pass says which reply it handed over', () => {
  it('its words and when it was handed over, on joining the cloud\'s run of it', async () => {
    const cloud = createMemoryCloud();
    let clock = HANDED_AT;
    cloud.now = () => clock;
    const me = signUpMemory(cloud, { email: `o-${Math.random()}@example.com` });
    const mac = memoryBackend(cloud, me);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'late-cloud-pass-'));
    const state = { asleep: true, handed: false };
    const adopted = [];
    const reply = { project: 'alpha', item: 'w-1', kind: 'reply', payload: { carried: CARRIED, text: 'Turn it back on' } };
    const inbox = createPhoneInbox({
      backend: mac, owner: me, device: 'a1b2c3d4e5f6', projects: () => [{ slug: 'alpha', name: 'Alpha' }],
      listItems: () => [{ id: 'w-1', title: 'Write the report', status: 'open', updatedAt: HANDED_AT - 5000 }],
      historyOf: () => [], apply: async () => ({ ok: true }), stateFile: path.join(dir, 's.json'), now: () => clock,
      kitsFor: () => true, adopt: async (a) => { adopted.push(a); return 'adopted'; }, adoptNew: async () => 'adopted', runHome: () => true,
      asleep: () => state.asleep, toCarry: async () => (state.handed ? [] : [reply]),
      handedOver: () => { state.handed = true; }, takenBack: () => {},
    });
    await inbox.syncOnce();
    const [cmd] = await mac.phoneCommands();
    claimForTheCloud(cloud, cmd.id, 'run-1');
    clock += 6 * DAY;
    state.asleep = false;
    await inbox.syncOnce();
    expect(adopted).toEqual([expect.objectContaining({ item: 'w-1', runId: 'run-1', replies: [], carried: true, carriedReply: { text: 'Turn it back on', at: HANDED_AT } })]);
  });
});
