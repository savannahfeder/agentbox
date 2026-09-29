// On a Mac with no store MCP, a worker cannot write one word on its own row.
//
// Agentbox ships none (config.storeMcpCommand is null), so this is EVERY
// downloaded copy. The brief still told the session to claim the item,
// checkpoint on it, file its questions as new items and finish by setting
// status done, and when it could do none of those the row was left exactly as
// it was found: open, no result, no note. It went straight back on the
// fresh-work pile and ran again, and one answer of hers spawned the same worker
// three times before the delivery counter gave up.
//
// Two rules are pinned here. The brief names no tool the session does not hold,
// and the supervisor writes the session's last message onto the row for it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const APP = path.resolve('.');
let root, data, dir;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolless-'));
  // A packaged install's dataDir is userData, which starts empty: no writing
  // rules of hers ride along, and the brief is worker.md plus finishing.md.
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'toolless-data-'));
  dir = path.join(root, 'myproduct');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'myproduct', name: 'My Product' }));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
});

const STORE_TOOLS = /claim_work_item|update_work_item|create_work_item|release_work_item|list_work_items|write_document|read_document/;

async function setup({ withMcp = false } = {}) {
  let launcher = null;
  if (withMcp) {
    launcher = path.join(root, 'store-mcp.sh');
    fs.writeFileSync(launcher, '#!/bin/sh\n');
  }
  const config = {
    accountRoot: root, storeRoot: root, products: [], personalProducts: [],
    accountId: 'nobody', claudeBin: '/nonexistent', storeMcpCommand: launcher,
  };
  const store = await new Store(config).init();
  // A TOOLLESS SESSION NEEDS AN APP DIRECTORY WITH NO STORE IN IT. The repo
  // root will not do any more: the store server ships in `mcp/` since
  // 2026-09-22, so a supervisor pointed at the repo finds one whether the
  // config names a launcher or not. `root` is a bare temp directory, which is
  // what a store-less install actually looks like.
  const sup = new Supervisor(config, store, withMcp ? APP : root, data);
  sup._saveState = () => {};
  return { config, store, sup };
}

const fileOne = (store) => {
  const made = store.fileItem('myproduct', { title: 'Add a dark mode toggle', kind: 'task', body: 'Please add a toggle.' });
  return store.readItem('myproduct', made.id, Date.now());
};
const briefFor = (sup, store, item) =>
  sup.buildBrief(item, store.listProducts().find((p) => p.slug === 'myproduct'), { continuation: false });

describe('the brief only names tools this session actually has', () => {
  it('names no store tool at all when there is no store MCP', async () => {
    const { store, sup } = await setup();
    expect(sup.storeMcpCommand()).toBe(null);
    const brief = briefFor(sup, store, fileOne(store));
    expect(brief).not.toMatch(STORE_TOOLS);
    // and it says what DOES reach her instead, so the session is not merely
    // stripped of instructions but pointed at the one channel it has
    expect(brief).toMatch(/NO TOOLS FOR THE INBOX ITSELF/);
    expect(brief).toMatch(/There is nothing to claim/);
    expect(brief).toMatch(/YOUR LAST\s+MESSAGE, which the app writes onto the row/);
    // no half-swapped template
    expect(brief).not.toContain('<!--');
  });

  it('still names them when a store MCP is configured', async () => {
    const { store, sup } = await setup({ withMcp: true });
    const brief = briefFor(sup, store, fileOne(store));
    expect(brief).toMatch(/claim_work_item/);
    expect(brief).not.toMatch(/There is nothing to claim/); // that is the other half
    expect(brief).not.toMatch(/NO TOOLS FOR THE INBOX ITSELF/);
    expect(brief).not.toContain('<!--');
  });
});

describe('who writes the row when the session cannot', () => {
  it('the supervisor speaks for a clean toolless session, and not otherwise', async () => {
    const { sup } = await setup();
    expect(sup.speaksForTheSession({ result: 'Done.', resultIsError: false })).toBe(true);
    expect(sup.speaksForTheSession({ result: null })).toBe(false);
    expect(sup.speaksForTheSession({ result: 'API Error', resultIsError: true })).toBe(false);
    const withTools = await setup({ withMcp: true });
    expect(withTools.sup.speaksForTheSession({ result: 'Done.', resultIsError: false })).toBe(false);
  });

  it('the last message lands on the row and parks it in her inbox', async () => {
    const { store } = await setup();
    const item = fileOne(store);
    store.recordSessionResult('myproduct', item.id, { result: 'The toggle is in, and the tests are green.' });
    const after = store.readItem('myproduct', item.id, Date.now());
    expect(after.result).toBe('The toggle is in, and the tests are green.');
    expect(after.status).toBe('blocked');
    expect(after.wrote.result.source).toBe('agent');
  });

  it('the row stops coming back as fresh work once it has been written', async () => {
    const { store, sup } = await setup();
    const item = fileOne(store);
    // before: nothing wrote, so the row is still exactly what the tick takes
    expect(sup.noteFreshRun(item)).toBe('rested');
    store.recordSessionResult('myproduct', item.id, { result: 'Done.' });
    expect(sup.noteFreshRun(item)).toBe('moved');
  });

  it('one answer of hers no longer spawns three workers', async () => {
    const { store, sup } = await setup();
    const item = fileOne(store);
    store.answerItem('myproduct', item.id, { answer: 'Yes, do it.' });
    const fresh = store.readItem('myproduct', item.id, Date.now());
    const session = { result: 'Done, the toggle is in.', resultIsError: false };
    // A real session runs for minutes; here the two writes can land in the same
    // millisecond, and agentSpokeSince is a strict `>` on the answer's stamp.
    await new Promise((r) => setTimeout(r, 5));
    // it used to take three spawns to give up, because nothing an agent wrote
    // ever appeared on the row
    store.recordSessionResult('myproduct', item.id, { result: session.result });
    expect(sup.settleDelivery(fresh, 'Yes, do it.', session, null)).toBe('delivered');
  });
});
