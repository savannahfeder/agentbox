// A SIGNED-OUT CODEX COMES BACK ON ITS OWN, END TO END, WITH REAL PROCESSES.
//
// 2026-10-04: her Claude Code login expired and every agent sat "Queued" for
// half an hour. /login, Resume and "continue" did nothing; the bench timer was
// the only thing that freed them. The fix (tests/agents-come-back-the-moment-
// she-signs-in-again.test.mjs) watches the files a login writes, holds replies
// instead of spending them, and says "Signed out" on the row. Codex has to
// behave the same, and its path is different all the way down: one long-lived
// `codex app-server` per login instead of a process per run, a failed TURN
// instead of a dying process, and Codex's own words (a raw 401) instead of
// Claude's.
//
// So this drives the real Store and the real Supervisor against a stand-in
// `codex app-server` (tests/fixtures/fake-codex-app-server.mjs) that refuses
// every turn with the 401 a real signed-out Codex was measured returning, and
// that reads its login ONCE at startup, the cautious model of the real one. A
// fresh app-server has to be started after `codex login` for work to run.
//
// Measured with it before this file was written: the whole loop already held
// for a run that fails in under 45 seconds. What did not: a real signed-out
// Codex retries ten times (five over WebSocket, five over HTTPS) before the
// turn fails, and a run past FAST_EXIT_MS fell to the branch that CLEARS the
// account's trouble. No bench, no "Signed out" on the row, and her reply was
// charged one of its three tries. The last describe is that case.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const FAKE = path.resolve('tests/fixtures/fake-codex-app-server.mjs');
const SIGNED_OUT_401 = 'unauthorized: unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: https://api.openai.com/v1/responses';

let root, codexHome, store, sup, itemId;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fakeLog = () => { try { return fs.readFileSync(path.join(codexHome, 'fake.log'), 'utf8').trim().split('\n'); } catch { return []; } };
const turns = () => fakeLog().filter((l) => l.startsWith('turn '));
const row = () => store.readItem('shop', itemId, Date.now());
// One tick, and long enough for the run it starts to end: the fake answers in
// milliseconds, so this waits on the session, not on a clock.
const settle = async () => {
  await sup.tick();
  for (let k = 0; k < 100 && (sup.sessions.size || sup._preparing?.size); k++) await sleep(50);
  await sleep(100);
};
// What `codex login` writes. The fake reads the word; the app may only read the time.
const codexLogin = async () => {
  await sleep(20);
  fs.writeFileSync(path.join(codexHome, 'auth.json'), '{"state":"signed-in"}');
};

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-signed-out-e2e-'));
  const home = path.join(root, 'home');
  codexHome = path.join(home, '.codex');
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(path.join(codexHome, 'auth.json'), '{"state":"expired"}');
  const dir = path.join(root, 'shop');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'shop', name: 'Shop' }));
  const config = {
    accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody',
    home, claudeBin: '/nonexistent/claude', claudeFound: false, codexBin: FAKE, codexHome,
    storeMcpCommand: null, maxConcurrentSessions: 3, authProfiles: ['default'], autonomousProducts: ['shop'],
  };
  store = await new Store(config).init();
  sup = new Supervisor(config, store, root, path.join(root, 'data'));
  itemId = store.fileItem('shop', { title: 'Fix the checkout button', kind: 'task', body: 'It does nothing.', labels: ['founder'] }).id;
});

afterEach(() => {
  try { sup.stop(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
});

describe('a signed-out Codex, through a real app-server', () => {
  it('the turn is refused, Codex sits out, and Claude Code is not touched', async () => {
    await settle();
    expect(turns()).toEqual(['turn refused']);
    expect(sup._profileTrouble['codex:default']?.cause).toBe('signed-out');
    expect(sup._profileResting('codex:default')).toBe(true);
    // A fact about Codex is not a fact about Claude Code.
    expect(sup._profileTrouble.default).toBeUndefined();
    expect(sup._profileResting('default')).toBe(false);
    expect(sup._spawnBraked()).toBe(false);
  });

  it('the row says Codex is signed out, not "Queued"', async () => {
    await settle();
    expect(sup.status().signInNeeded).toEqual({ [itemId]: 'Codex' });
  });

  it('must NOT try again on its own while nothing has signed in', async () => {
    await settle();
    await settle();
    await settle();
    expect(turns()).toEqual(['turn refused']);
  });

  it('a reply while signed out is held, not sent to die and not spent', async () => {
    await settle();
    store.answerItem('shop', itemId, { answer: 'continue' });
    await settle();
    expect(turns()).toEqual(['turn refused']);
    expect(Object.keys(sup._deliveryAttempts)).toEqual([]);
    expect(sup._answerDelivered(row())).toBe(false);
  });

  it('codex login lands: the next tick starts a fresh app-server and the work runs', async () => {
    await settle();
    store.answerItem('shop', itemId, { answer: 'continue' });
    await settle();
    await codexLogin();
    await settle();
    expect(turns()).toEqual(['turn refused', 'turn ok']);
    // A fresh process, because the old one could have kept the old login.
    expect(fakeLog().filter((l) => l.startsWith('start '))).toEqual(['start signed-out', 'start signed-in']);
    expect(row().result).toBe('Done. The checkout button works now.');
    expect(sup._profileTrouble['codex:default']).toBeUndefined();
    expect(sup.status().signInNeeded).toEqual({});
  });
});

describe('a signed-out run that took its time is still the account', () => {
  // Codex retries ten times before a signed-out turn fails, so the run can
  // outlast FAST_EXIT_MS (45s). Built the way the exit handler sees it.
  const slowRefusal = (words) => ({
    itemId: 'w-test', product: 'shop', profile: 'default', engine: 'codex',
    startedAt: Date.now() - 60_000,
    result: words, resultIsError: true,
    tail: [`stderr: ${words}`],
  });

  it('a slow 401 benches the login and marks the run as the account\'s fault', () => {
    const s = slowRefusal(SIGNED_OUT_401);
    sup.noteExitForBackoff(s);
    expect(sup._profileTrouble['codex:default']?.cause).toBe('signed-out');
    expect(sup._profileResting('codex:default')).toBe(true);
    expect(s.accountFault?.account).toBe('codex:default');
  });

  it('and the reply it carried is handed back, not spent', () => {
    const item = { id: 'w-test', product: 'shop', status: 'open', answer: 'continue' };
    sup.spokeOnTheRow = () => false;
    sup.carriedThrough = () => 'continue';
    const s = slowRefusal(SIGNED_OUT_401);
    sup.noteExitForBackoff(s);
    expect(sup.settleDelivery(item, 'continue', s, null)).toBe('interrupted');
  });

  it('must NOT read a slow run that failed for its own reasons as the account', () => {
    const s = slowRefusal('the tests failed and I could not fix them');
    sup.noteExitForBackoff(s);
    expect(sup._profileTrouble['codex:default']).toBeUndefined();
    expect(s.accountFault).toBeUndefined();
  });
});
