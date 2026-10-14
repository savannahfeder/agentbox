import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { Store } from '../main/store.mjs';
import { waitUntilNo } from './waiting.mjs';
import { troubleCause } from '../shared/spawn-trouble.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
function setup(engine, answer = 'Continue the original work') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-network-'));
  roots.push(root);
  const item = { product: 'shop', id: 'w-network', status: 'open', answer, wrote: { answer: { ts: 100, source: 'founder' } } };
  const store = { listItems: () => [item], listProducts: () => [], readItem: () => item, settleAnswer() {} };
  const sup = new Supervisor({ storeRoot: root, authProfiles: ['default'] }, store, root);
  const session = { engine, profile: 'default', startedAt: Date.now() - 120_000, tail: [], result: 'stream disconnected before completion: error sending request: ECONNRESET', resultIsError: true };
  return { sup, item, session };
}

describe.each(['codex', 'claude'])('%s after an internet outage', engine => {
  it('keeps replies owed across repeated long-running network failures and resumes after the short cooldown', () => {
    const { sup, item, session } = setup(engine);
    for (let n = 0; n < 6; n++) {
      sup._handledAnswers.add(sup._answerKey(item, item.answer));
      sup.noteExitForBackoff(session);
      expect(sup.settleDelivery(item, item.answer, session, null)).toBe('interrupted');
      expect(sup._deliveryAttempts[sup._answerKey(item, item.answer)] ?? 0).toBe(0);
    }
    const account = sup._accountKey(engine, 'default');
    expect(sup._profileResting(account)).toBe(true);
    expect(sup._profileCooldown[account] - Date.now()).toBeLessThanOrEqual(60_000);
    expect(sup._handledAnswers.has(sup._answerKey(item, item.answer))).toBe(false);
  });

  it('does not leave fresh tasks waiting for the user on its own interruption notice', () => {
    const { sup, item, session } = setup(engine, null);
    sup.noteExitForBackoff(session);
    sup.noteFreshRun(item, { account: session.accountFault?.account });
    const seen = sup._fruitless['shop:w-network'];
    seen.saidWhy = 'interrupted'; seen.saidTs = 200;
    item.wrote.result = { ts: 200, source: 'agent' };
    expect(sup._onlyWeSpokeForAnAccount(item)).toBe(true);
    sup._profileCooldown[sup._accountKey(engine, 'default')] = Date.now() - 1;
    expect(sup.restingUntil(item)).toBe(0);
    item.wrote.result.ts = 201;
    expect(sup._onlyWeSpokeForAnAccount(item)).toBe(false);
  });

  it('does not automatically retry a refusal or clear a sign-in problem', () => {
    const { sup, item, session } = setup(engine);
    session.result = 'The model refused';
    sup.noteExitForBackoff(session);
    expect(sup.settleDelivery(item, item.answer, session, null)).toBe('retrying');
    expect(session.accountFault).toBeUndefined();
    session.result = '401 Unauthorized';
    sup.noteExitForBackoff(session);
    expect(sup._profileTrouble[sup._accountKey(engine, 'default')].cause).toBe('signed-out');
  });
});

it.each(['stream disconnected before completion', 'streamDisconnected', 'ENETUNREACH', 'EAI_AGAIN', 'fetch failed', 'API Error: Connection error.', 'httpConnectionFailed', 'config/read: the connection to codex app-server is corrupt, a frame passed 16777216 characters with no end to it'])('recognizes the provider network error %s', error => {
  expect(troubleCause(error)).toBe('interrupted');
});


it.each([false, true])('resumes the same provider thread after the network returns (with pending reply: %s), through real processes and storage', async pendingReply => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'network-resume-e2e-'));
  roots.push(root);
  const codexHome = path.join(root, 'home', '.codex');
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(path.join(codexHome, 'auth.json'), '{"state":"signed-in"}');
  fs.writeFileSync(path.join(codexHome, 'offline'), 'offline');
  const dir = path.join(root, 'shop');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'shop', name: 'Shop' }));
  const config = { accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody',
    home: path.join(root, 'home'), claudeBin: '/nonexistent/claude', claudeFound: false,
    codexBin: path.resolve('tests/fixtures/fake-codex-app-server.mjs'), codexHome,
    storeMcpCommand: null, maxConcurrentSessions: 3, authProfiles: ['default'], autonomousProducts: ['shop'] };
  const store = await new Store(config).init();
  const sup = new Supervisor(config, store, root, path.join(root, 'data'));
  const id = store.fileItem('shop', { title: 'Example task', kind: 'task', body: 'Fix the checkout button.', labels: ['founder'] }).id;
  if (pendingReply) store.answerItem('shop', id, { answer: 'Continue the original work' });
  const settle = async () => {
    await sup.tick();
    await waitUntilNo('the network test worker to finish', () => sup.sessions.size || sup._preparing?.size);
    await new Promise(resolve => setTimeout(resolve, 100));
  };
  try {
    await settle();
    expect(sup._profileTrouble['codex:default']?.cause).toBe('interrupted');
    const thread = sup._rowSessions[id]?.sessionId;
    expect(thread).toBeTruthy();
    const sessions = path.join(codexHome, 'sessions', '2026', '01', '01');
    fs.mkdirSync(sessions, { recursive: true });
    fs.writeFileSync(path.join(sessions, `rollout-2026-01-01T00-00-00-${thread}.jsonl`), JSON.stringify({ type: 'session_meta', payload: { id: thread } }) + '\n');
    await settle();
    expect(fs.readFileSync(path.join(codexHome, 'fake.log'), 'utf8').match(/turn offline/g)).toHaveLength(1);
    fs.unlinkSync(path.join(codexHome, 'offline'));
    sup._profileCooldown['codex:default'] = Date.now() - 1;
    await settle();
    expect(store.readItem('shop', id).result).toContain('checkout button works');
    expect(sup._rowSessions[id]?.sessionId).toBe(thread);
    expect(fs.readFileSync(path.join(codexHome, 'fake.log'), 'utf8')).toContain('thread/resume');
    expect(sup._deliveryAttempts).toEqual({});
  } finally { sup.stop(); store.unwatch(); }
});
