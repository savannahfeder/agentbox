// A CLOUD RUN THAT LACKS SOMETHING ASKS, AND NEVER PRINTS THE MARKER AT YOU.
//
// What broke (2026-10-31): someone asked "status?" on a thread running in the
// cloud and read "AGENTBOX-NEEDS-THE-COMPUTER: your Expo sign-in, to check build
// 8 in TestFlight" as the answer, three times in a day, and the thread never
// moved. "If there's information we don't have, shouldn't the agent logically be
// able to ask us for it rather than just getting stuck?"
//
// Measured on that thread's records: all three runs were cloud runs the app had
// rejoined after a restart ("the cloud run that carried on"). A run the app
// started itself moves on that line; a rejoined one ended in
// `_followComingHome`, which never looked for it, wrote it on the row and
// settled the reply.
//
// And the instruction told a run to stop at once even for a status question it
// could mostly answer, or for something the person could simply have told it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { Supervisor } from '../main/supervisor.mts';
import { Store } from '../main/store.mts';
import { CLOUD_NOTE, PLAIN_CLOUD_NOTE } from '../main/cloud/run.mts';
import { HAND_BACK } from '../shared/cloud-hand-back.mts';

let tmp; let store; let sup; let row; let folder; let relays;

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-asks-')));
  const root = path.join(tmp, 'store');
  const repo = path.join(tmp, 'repo');
  folder = path.join(repo, '.claude', 'worktrees', 'w-1');
  fs.mkdirSync(folder, { recursive: true });
  fs.mkdirSync(path.join(root, 'team'), { recursive: true });
  fs.writeFileSync(path.join(root, 'team', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'team', name: 'Team', repoPath: repo }));
  store = await new Store({ accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent' }).init();
  row = store.fileItem('team', { title: 'Phone feedback', kind: 'task', body: 'Fix these.' });
  const storeMcp = path.join(tmp, 'store-mcp.sh');
  fs.writeFileSync(storeMcp, '#!/bin/sh\n');
  sup = new Supervisor({ storeRoot: root, home: tmp, maxConcurrentSessions: 3, storeMcpCommand: storeMcp }, store, tmp);
  sup.writeMcpConfig = () => null;
  sup._workerEnv = () => ({});
  relays = [];
  sup._spawnCloudRelay = () => {
    const c = new EventEmitter();
    c.stdout = new PassThrough();
    c.stderr = new PassThrough();
    c.kill = () => true;
    relays.push(c);
    return c;
  };
  sup._liveSessions[row.id] = { sessionId: 's-1', product: 'team', cwd: folder, profile: null, engine: 'claude', continuation: true, startedAt: Date.now() - 60_000, cloud: true };
});

afterEach(() => {
  sup?.stop?.();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const result = (text) => `${JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: text })}\n`;
const tick = () => new Promise((r) => setImmediate(r));

// The reply the rejoined run took: on the row, already heard and marked handled.
function replyHeard() {
  store.answerItem('team', row.id, { answer: 'status?', status: 'open' });
  const fresh = { ...store.readItem('team', row.id), product: 'team' };
  sup._noteHeard(fresh, 's-1');
  sup._handledAnswers.add(sup._answerKey(fresh));
}

function ends(text, code = 0) {
  sup._bringCloudHome(folder);
  relays[0].stdout.write(result(text));
  relays[0].emit('exit', code, null);
  return tick();
}

describe('a rejoined cloud run that ends on the marked line', () => {
  it('writes nothing on the thread and moves it to this computer, saying why', async () => {
    replyHeard();
    await ends(`${HAND_BACK} your Expo sign-in`);
    expect(store.readItem('team', row.id).result ?? null).toBe(null);
    expect(sup._movedHere(row.id)).toBe(true);
    expect(sup._movedWhy[row.id]).toEqual({ why: 'handed-back', detail: 'your Expo sign-in' });
  });

  it('leaves the reply owed, so it runs again here', async () => {
    replyHeard();
    await ends(`${HAND_BACK} your Expo sign-in`);
    const fresh = store.readItem('team', row.id);
    expect(fresh.answeredThrough ?? null).toBe(null);
    expect(sup._answerDelivered({ ...fresh, product: 'team' })).toBe(false);
  });

  it('does not move when its work did not come home', async () => {
    replyHeard();
    await ends(`${HAND_BACK} your Expo sign-in`, 75);
    expect(sup._movedHere(row.id)).toBe(false);
  });

  it('still lands an ordinary answer and stays in the cloud', async () => {
    replyHeard();
    await ends('**Everything is shipped.**');
    const fresh = store.readItem('team', row.id);
    expect(fresh.result).toBe('**Everything is shipped.**');
    expect(sup._movedHere(row.id)).toBe(false);
    expect(fresh.answeredThrough).toBe(fresh.wrote.answer.ts);
  });
});

describe('what a cloud run is told about something missing', () => {
  for (const [name, note] of [['with a repository', CLOUD_NOTE], ['with none', PLAIN_CLOUD_NOTE]]) {
    it(`answers what it can and asks for what they can tell it, ${name}`, () => {
      expect(note).toMatch(/answer it from what you have/i);
      expect(note).toMatch(/could not recheck/i);
      expect(note).toContain('Check from my computer');
      expect(note).toMatch(/ask for it in plain words/i);
    });

    it(`never asks for a password or key in the thread, ${name}`, () => {
      expect(note).toMatch(/never ask them to type a password, key or sign-in/i);
    });

    it(`keeps the move for work that cannot go ahead without the computer, ${name}`, () => {
      expect(note).toContain(`End your turn with one line and nothing else: ${HAND_BACK}`);
      expect(note).toMatch(/picks "Check from my computer"/);
    });
  }
});
