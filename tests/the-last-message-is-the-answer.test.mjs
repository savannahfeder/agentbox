// A WORKER'S LAST MESSAGE IS ITS ANSWER, ON EVERY INSTALL.
//
// Her row, 2026-09-28 (w-23d09d72ce), with a photograph of w-4a292d98a4: the
// same answer twice at 2:15pm, the first written to the row's result at
// 2:15:40 and the second typed as the run's closing message at 2:15:43,
// reworded. That run's own brief said "THE ANSWER IS WRITTEN ONCE". The fold
// in item-thread.ts, the brief's word-for-word rule and then its write-once
// rule were three tries at stopping a second copy that the design itself
// asked for: a worker with store tools answered through `update_work_item`
// and then ended the way every Claude Code session ends, by saying it.
//
// A copy with no store tools never had the fault, because there the last
// message is the only channel and the supervisor writes it onto the row. So
// that is now the one channel everywhere. Pinned here:
//
//   1. On an install with the store tools, a clean run's last message lands
//      on the row as its result, and the status the worker set is left alone.
//   2. A run that already wrote its own result keeps it: nothing is written
//      over the words it chose.
//   3. A run refused its claim writes nothing on a row someone else holds.
//   4. The thread then draws the answer once, because the typed copy and the
//      row's copy are the same string.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { Supervisor, readersFor } from '../main/supervisor.mjs';
import { itemThread } from '../renderer/src/item-thread.ts';

const APP = path.resolve('.');
let root, data, dir;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'last-message-'));
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'last-message-data-'));
  dir = path.join(root, 'myproduct');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'myproduct', name: 'My Product' }));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
});

async function setup() {
  const launcher = path.join(root, 'store-mcp.sh');
  fs.writeFileSync(launcher, '#!/bin/sh\n');
  const config = {
    accountRoot: root, storeRoot: root, products: [], personalProducts: [],
    accountId: 'nobody', claudeBin: '/nonexistent', storeMcpCommand: launcher,
  };
  const store = await new Store(config).init();
  const sup = new Supervisor(config, store, APP, data);
  sup._saveState = () => {};
  return { store, sup };
}

const ANSWER = "**Confirmed: the Actions budget is now $50, so GitHub Actions can run again.**\n\nGitHub shows the new $50 limit, and Actions still stops automatically when it's reached.";

const fileOne = (store) => store.fileItem('myproduct', { title: 'is this a problem?', kind: 'task', body: 'A picture.' });
const runOn = (item, extra = {}) => ({
  product: 'myproduct', itemId: item.id, startedAt: Date.now() - 1000,
  result: ANSWER, resultIsError: false, ...extra,
});

describe('where a worker with store tools puts its answer', () => {
  it('its last message lands on the row, and the status it set stays', async () => {
    const { store, sup } = await setup();
    const item = fileOne(store);
    // The toolless path would move this to blocked; this one must not move it.
    const before = store.readItem('myproduct', item.id, Date.now());
    const run = runOn(item);
    expect(sup.speaksForTheSession(run)).toBe(false); // the toolless path is not this one
    expect(sup.closingMessageIsTheAnswer(run)).toBe(true);
    store.recordSessionResult('myproduct', item.id, { result: run.result, status: null });
    const after = store.readItem('myproduct', item.id, Date.now());
    expect(after.result).toBe(ANSWER);
    expect(after.wrote.result.source).toBe('agent');
    expect(after.status).toBe(before.status);
  });

  it('a run that already wrote its own result keeps its own words', async () => {
    const { store, sup } = await setup();
    const item = fileOne(store);
    const run = runOn(item);
    store.recordSessionResult('myproduct', item.id, { result: 'Its own words.', status: null });
    expect(sup.closingMessageIsTheAnswer(run)).toBe(false);
  });

  it('a result from an earlier run does not stop this one answering', async () => {
    const { store, sup } = await setup();
    const item = fileOne(store);
    store.recordSessionResult('myproduct', item.id, { result: 'Last round.', status: null });
    expect(sup.closingMessageIsTheAnswer(runOn(item, { startedAt: Date.now() + 1000 }))).toBe(true);
  });

  it('a dead, empty or command run is not an answer here', async () => {
    const { store, sup } = await setup();
    const item = fileOne(store);
    expect(sup.closingMessageIsTheAnswer(runOn(item, { result: null }))).toBe(false);
    expect(sup.closingMessageIsTheAnswer(runOn(item, { result: 'API Error: 500', resultIsError: true }))).toBe(false);
    expect(sup.closingMessageIsTheAnswer(runOn(item, { result: '  ' }))).toBe(false);
    expect(sup.closingMessageIsTheAnswer(runOn(item, { command: true }))).toBe(false);
  });
});

describe('a run refused its claim says nothing on the row', () => {
  const capture = readersFor('claude').capture;
  const claimCall = (id) => JSON.stringify({ type: 'assistant', message: { content: [
    { type: 'tool_use', id: 'toolu_1', name: 'mcp__agentbox__claim_work_item', input: { id } },
  ] } });
  const claimReply = (claimed) => JSON.stringify({ type: 'user', message: { content: [
    { type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'text', text: JSON.stringify({ claimed, holder: 'mcp-1' }, null, 2) }] },
  ] } });

  it('is read off the claim call and its reply', async () => {
    const { store, sup } = await setup();
    const item = fileOne(store);
    const run = runOn(item);
    capture(run, claimCall(item.id));
    capture(run, claimReply(false));
    expect(run.claimRefused).toBe(true);
    expect(sup.closingMessageIsTheAnswer(run)).toBe(false);
  });

  it('a claim that went through is not a refusal', async () => {
    const { store, sup } = await setup();
    const item = fileOne(store);
    const run = runOn(item);
    capture(run, claimCall(item.id));
    capture(run, claimReply(true));
    expect(run.claimRefused).toBe(false);
    expect(sup.closingMessageIsTheAnswer(run)).toBe(true);
  });
});

describe('the row in her screenshot, as it now comes out', () => {
  const T = Date.parse('2026-09-28T21:15:00Z');
  const sec = 1000;
  const at = (ms) => new Date(T + ms).toISOString().slice(11, 19);

  // No result from the run itself. The one result is the supervisor's, written
  // at exit from the same frame the trace printed.
  const ledger = [
    { id: 'w-4a', ts: T - 900 * sec, source: 'founder', patch: { title: 'is this a problem?', body: 'A picture.' } },
    { id: 'w-4a', ts: T + 33 * sec, source: 'agent', claim: { holder: 'mcp-1', leaseUntil: T + 333 * sec }, patch: { status: 'claimed' } },
    { id: 'w-4a', ts: T + 44 * sec, source: 'agent', patch: { result: ANSWER } },
  ];
  const trace = {
    startedAt: T + 30 * sec,
    text: [
      '# is this a problem?',
      `${at(33 * sec)}  [mcp__agentbox__claim_work_item] w-4a`,
      `${at(35 * sec)}  [Bash] gh api /organizations/x/settings/billing/budgets`,
      `${at(43 * sec)}  ${ANSWER}`,
      `${at(43 * sec)}  == RESULT (success · 4 turns) ==`,
      ANSWER,
      `# exited (0) ${new Date(T + 44 * sec).toISOString()}`,
    ].join('\n'),
  };

  it('says the answer once', () => {
    const thread = itemThread(ledger, [trace]);
    const all = [
      ...thread.events.filter((e) => e.kind !== 'work'),
      ...(thread.outcome ? [{ text: thread.outcome.text }] : []),
    ];
    expect(all.filter((e) => /Actions budget is now \$50/.test(e.text ?? ''))).toHaveLength(1);
    expect(thread.outcome?.field).toBe('result');
  });
});
