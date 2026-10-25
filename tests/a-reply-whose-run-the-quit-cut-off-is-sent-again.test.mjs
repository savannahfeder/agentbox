// A REPLY WHOSE RUN THE QUIT CUT OFF IS SENT AGAIN.
//
// What broke (2026-10-19): she answered "Agentbox multiplayer work experience"
// at 21:46:27 and restarted the app a minute later. The tick marked her reply
// delivered and started a run at 21:46:49; the quit killed it before Claude
// Code had said its session id (its log is the two header lines and nothing
// else). A run is only written to `_liveSessions`, which a restart resumes,
// once that id arrives, and the stop that hands a reply back runs in the exit
// handler, which a quitting app does not wait for. So after the restart the
// reply read delivered, nothing was resuming it, and the row sat in In
// progress as stalled with nothing running.
//
// Now a run on this Mac that has not said its id yet is saved the way a run
// still being prepared is, and a restart puts its reply back. A run that has
// said its id is resumed instead, and a cloud run carries on in the cloud, so
// neither of those gets the reply twice.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

vi.mock('../main/task-folders-offthread.mjs', () => ({ folderJob: vi.fn(() => new Promise(() => {})) }));
vi.mock('../main/git-change-offthread.mjs', () => ({ gitJob: vi.fn(() => new Promise(() => {})) }));

let root, item, product, supervisors;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'reply-quit-'));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  item = {
    id: 'w-2222222222', product: 'sample', status: 'open', title: 'Multiplayer',
    answer: 'make it a little more lit', wrote: { answer: { ts: 1000, source: 'founder' } },
  };
  product = { slug: 'sample', dir: repo, repoPath: repo };
  supervisors = [];
});
afterEach(() => {
  for (const sup of supervisors) sup.stop();
  fs.rmSync(root, { recursive: true, force: true });
});
function make() {
  const sup = new Supervisor(
    { home: root, storeRoot: root, authProfiles: ['default'] },
    { listItems: () => [item], listProducts: () => [product], isDue: () => true }, root,
  );
  supervisors.push(sup);
  return sup;
}
function recordStarts(sup) {
  const started = [];
  sup.spawnWorker = (row, opts) => { started.push({ id: row.id, ...opts }); sup.sessions.set(row.id, { itemId: row.id }); };
  return started;
}
/** The tick's own steps for a reply: mark it, save, and a run starts carrying it. Then the app goes without an exit handler. */
function aRunCarryingTheReply({ cloud = false, saidItsId = false } = {}) {
  const sup = make();
  sup._handledAnswers.add(sup._answerKey(item));
  sup._saveState();
  sup._noteRunCarrying(item, { itemId: item.id, product: item.product, cloud, ...(saidItsId ? { idRemembered: true } : {}) }, { continuation: true });
  return sup;
}

describe('a run started on her reply, then the app quits', () => {
  it('before the run said its id: the reply goes out again after the restart, once', async () => {
    aRunCarryingTheReply();
    const after = make();
    const started = recordStarts(after);
    await after.tick();
    expect(started).toEqual([{ id: item.id, continuation: true }]);
    await after.tick();
    expect(started).toHaveLength(1);
  });

  it('after the run said its id: left for the resume, not sent twice', async () => {
    aRunCarryingTheReply({ saidItsId: true });
    const after = make();
    expect(after._answerDelivered(item)).toBe(true);
  });

  it('in the cloud: left for the cloud run, which carries on', async () => {
    aRunCarryingTheReply({ cloud: true });
    const after = make();
    expect(after._answerDelivered(item)).toBe(true);
  });

  it('a fresh run with no reply puts nothing back', async () => {
    const sup = make();
    sup._noteRunCarrying({ ...item, answer: undefined }, { itemId: item.id, product: item.product }, { continuation: false });
    sup._handledAnswers.add(sup._answerKey(item));
    sup._saveState();
    const after = make();
    expect(after._answerDelivered(item)).toBe(true);
  });
});
