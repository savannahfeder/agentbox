// A CODEX THREAD SWITCHED TO CLAUDE DOES NOT SAY CODEX HAS NO ACCOUNT (2026-11-16).
//
// What broke: in the Cloud launch power test, a Codex thread waiting on its
// login's usage limit was answered with Sonnet picked, and the thread said
// "Codex has no account that can run right now" while the reply went to Claude
// Code. Measured from the copy's ledger: the engine and the reply were written
// together, and the reason the last pass gave for not starting the thread
// ('login', on Codex) was still within the 30 s `status().cannotStart` keeps
// it, so it was drawn under a thread that no longer ran on Codex.
//
// Driven with the real Store and Supervisor against a stand-in
// `codex app-server` that refuses every turn with Codex's usage-limit words.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { Supervisor } from '../main/supervisor.mts';
import { waitUntilNo } from './waiting.mts';

const FAKE = path.resolve('tests/fixtures/fake-codex-app-server.mjs');
const SAID = 'You’ve hit your usage limit. Visit https://chatgpt.com/settings/usage to purchase more credits or try again at Nov 18th, 2099 11:01 PM.';

let root: string, store: Store, sup: Supervisor;

const settle = async () => {
  await sup.tick();
  await waitUntilNo('the run this tick started to end', () => sup.sessions.size || sup._preparing?.size);
  await new Promise((r) => setTimeout(r, 100));
};
// Sent on Codex, as a person picking it does.
const file = (title: string) => {
  const { id } = store.fileItem('shop', { title, kind: 'task', body: title, labels: ['founder'] });
  store.modules.workItemsDisk.updateWorkItem(store.productDir('shop'), id, { engine: 'codex' }, { source: 'founder' });
  return id;
};

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-switched-to-claude-'));
  const home = path.join(root, 'home');
  const codexHome = path.join(home, '.codex');
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
});

afterEach(() => {
  try { sup.stop(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
});

describe('a Codex thread held by the login it ran out on', () => {
  it('says nothing about Codex once its reply is sent to Claude Code', async () => {
    file('Fix the failing test');
    await settle();
    const waiting = file('Add an idempotency key');
    await settle();
    expect(sup.status().cannotStart?.[waiting]).toEqual({ why: 'login', tool: 'Codex' });
    claudeCodeInstalled();
    store.answerItem('shop', waiting, { answer: 'do this now on claude', engine: 'claude', model: 'sonnet' });
    expect(sup.status().cannotStart?.[waiting]?.tool).not.toBe('Codex');
  });

  it('must NOT lose the reason while the thread is still on Codex', async () => {
    file('Fix the failing test');
    await settle();
    const waiting = file('Add an idempotency key');
    await settle();
    claudeCodeInstalled();
    store.answerItem('shop', waiting, { answer: 'try again' });
    expect(sup.status().cannotStart?.[waiting]).toEqual({ why: 'login', tool: 'Codex' });
  });
});

// As on the tester's Mac. Only once the ticks are done: nothing here can run it.
function claudeCodeInstalled() {
  const s = sup as unknown as { _enginesFound: () => { claude: boolean; codex: boolean }; engineChoiceOpened: () => boolean };
  s._enginesFound = () => ({ claude: true, codex: true });
  s.engineChoiceOpened = () => true;
}
