// A CONVERSATION OPEN IN ANOTHER CODEX WINDOW, THROUGH A REAL APP-SERVER PROCESS.
//
// The unit half is in
// tests/a-conversation-open-in-another-codex-window-says-so-and-benches-nothing.
// This one runs the real Supervisor against tests/fixtures/fake-codex-app-server.mjs,
// which refuses `thread/resume` the way two real codex-cli 0.163.0 processes
// did on 2026-10-20 ("thread <id> already has an active writer"). Before the
// fix, the three tries a reply gets were spent in seconds, each one a strike
// on the Codex login, and the third benched Codex for thirty minutes.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { waitFor, waitUntilNo } from './waiting.mjs';

const FAKE = path.resolve('tests/fixtures/fake-codex-app-server.mjs');

let root, codexHome, store, sup, itemId;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fakeLog = () => { try { return fs.readFileSync(path.join(codexHome, 'fake.log'), 'utf8').trim().split('\n'); } catch { return []; } };
const row = () => store.readItem('shop', itemId, Date.now());
const settle = async () => {
  await sup.tick();
  await waitUntilNo('the run this tick started to end', () => sup.sessions.size || sup._preparing?.size);
  await sleep(100);
};

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-open-elsewhere-e2e-'));
  const home = path.join(root, 'home');
  codexHome = path.join(home, '.codex');
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(path.join(codexHome, 'auth.json'), '{"state":"signed-in"}');
  fs.writeFileSync(path.join(codexHome, 'keeps-rollouts'), '');
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

describe('a reply to a codex conversation another window has open', () => {
  it('says so on the row and leaves the Codex login running', async () => {
    await settle();
    await waitFor('the first run to answer', () => row().result === 'Done. The checkout button works now.');
    fs.writeFileSync(path.join(codexHome, 'writer-held'), '');
    store.answerItem('shop', itemId, { answer: 'Now make it blue.' });
    for (let i = 0; i < 6 && !/another window/.test(row().result ?? ''); i += 1) await settle();

    expect(fakeLog().filter((l) => l === 'resume refused').length).toBeGreaterThan(0);
    expect(row().result).toMatch(/^Codex has this conversation open in another window, so nothing has been done here\./);
    expect(row().result).toMatch(/Close it there\. Then reply here to start it again\.$/);
    expect(sup._profileTrouble['codex:default']).toBeUndefined();
    expect(sup._profileResting('codex:default')).toBe(false);
  });

  it('runs the next reply once the other window lets go', async () => {
    await settle();
    await waitFor('the first run to answer', () => row().result === 'Done. The checkout button works now.');
    fs.writeFileSync(path.join(codexHome, 'writer-held'), '');
    store.answerItem('shop', itemId, { answer: 'Now make it blue.' });
    for (let i = 0; i < 6 && !/another window/.test(row().result ?? ''); i += 1) await settle();
    fs.rmSync(path.join(codexHome, 'writer-held'));
    store.answerItem('shop', itemId, { answer: 'Closed it. Now make it blue.' });
    await settle();
    await waitFor('the reply to be answered', () => row().result === 'Done. The checkout button works now.');
    expect(fakeLog().filter((l) => l === 'turn ok')).toHaveLength(2);
  });
});
