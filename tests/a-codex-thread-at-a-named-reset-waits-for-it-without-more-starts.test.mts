// A CODEX THREAD AT A NAMED RESET WAITS FOR IT WITHOUT MORE STARTS (2026-11-16).
//
// What broke: in the Cloud launch power test, a Codex thread sent while this
// Mac's only Codex login was at its limit was started six times in ten
// minutes, each run refused in under two seconds with "try again at Nov 18th,
// 2026 11:01 PM", and then held by the six-starts guard ("tries again at
// 7:43am"). Measured from the copy's ledger and run logs: three starts 30-40 s
// apart with no word from the tester, then three more after one reply.
//
// Driven here with the real Store and Supervisor against a stand-in
// `codex app-server` that refuses every turn with Codex's usage-limit words.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { Supervisor } from '../main/supervisor.mts';
import { waitUntilNo } from './waiting.mts';

const FAKE = path.resolve('tests/fixtures/fake-codex-app-server.mjs');
const SAID = 'You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/settings/usage to purchase more credits or try again at Nov 18th, 2099 11:01 PM.';

let root: string, codexHome: string, store: Store, sup: Supervisor, itemId: string;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const turns = () => { try { return fs.readFileSync(path.join(codexHome, 'fake.log'), 'utf8').split('\n').filter((l) => l.startsWith('turn ')); } catch { return []; } };
const settle = async () => {
  await sup.tick();
  await waitUntilNo('the run this tick started to end', () => sup.sessions.size || sup._preparing?.size);
  await sleep(100);
};

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-named-reset-'));
  const home = path.join(root, 'home');
  codexHome = path.join(home, '.codex');
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(path.join(codexHome, 'auth.json'), '{"state":"out-of-usage"}');
  fs.writeFileSync(path.join(codexHome, 'at-limit'), SAID);
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
  // Codex is the one tool found here, so the thread runs on it.
  itemId = store.fileItem('shop', { title: 'Fix the failing test', kind: 'task', body: 'It fails.', labels: ['founder'] }).id;
});

afterEach(() => {
  try { sup.stop(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
});

describe('a Codex thread whose only login is at a limit that names its reset', () => {
  it('is started once, then waits for the reset', async () => {
    for (let i = 0; i < 4; i += 1) await settle();
    expect(turns()).toEqual(['turn refused']);
    expect(sup._profileTrouble['codex:default']?.cause).toBe('at-limit');
  });

  it('is not started again by replies on other threads', async () => {
    await settle();
    for (let i = 0; i < 3; i += 1) { replyElsewhere(); await settle(); }
    expect(turns()).toEqual(['turn refused']);
  });

  it('a reply on it buys it one try, and replies elsewhere add no more', async () => {
    await settle();
    store.answerItem('shop', itemId, { answer: 'run the test and fix it' });
    replyElsewhere();
    await settle();
    expect(turns()).toEqual(['turn refused', 'turn refused']);
    for (let i = 0; i < 3; i += 1) { replyElsewhere(); await settle(); }
    expect(turns()).toEqual(['turn refused', 'turn refused']);
    expect(sup._isHeld(store.readItem('shop', itemId, Date.now())!)).toBe(false);
  });

  it('reads as at its limit, not stopped, after a reply elsewhere', async () => {
    await settle();
    expect(sup.status().atLimit?.[itemId]?.tool).toBe('Codex');
    replyElsewhere();
    await settle();
    const status = sup.status();
    expect(status.atLimit?.[itemId]?.until).toBe(Date.parse('2099-11-18T23:01:00'));
    expect(status.stalled).not.toContain(itemId);
  });

  it('must NOT stop Try again from starting it once more', async () => {
    await settle();
    replyElsewhere();
    await settle();
    sup.resumeItems([itemId]);
    await settle();
    expect(turns()).toEqual(['turn refused', 'turn refused']);
  });

  it('must NOT keep waiting once the limit is cleared', async () => {
    await settle();
    sup.accountChosen('codex', 'default');
    await settle();
    expect(turns()).toEqual(['turn refused', 'turn refused']);
  });
});

describe('a Codex limit that names no reset', () => {
  it('must NOT change: a reply elsewhere still gives the login its one try', async () => {
    fs.writeFileSync(path.join(codexHome, 'at-limit'), 'You’ve hit your usage limit.');
    await settle();
    replyElsewhere();
    await settle();
    expect(turns()).toEqual(['turn refused', 'turn refused']);
  });
});

// What the reply handler does for a reply on any thread (main/ipc.mts `zero:answer`).
function replyElsewhere() { sup.liftBrakeForHer(); }
