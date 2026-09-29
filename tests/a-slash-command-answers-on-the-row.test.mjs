// WHERE THE ANSWER TO `/usage` ENDS UP, on HER machine and not just a stranger's.
//
// She was right, and it was true on exactly the kind of machine she uses.
// `speaksForTheSession` refuses to write a session's last words onto its row
// when a store MCP is configured, because there the worker owns its own row and
// a row it left open is a live thread. A slash command has no worker in it:
// `/usage` is Claude Code's own word, the brief is skipped entirely
// (spawnPlan), the run never hears that a store exists, and it prints a table
// and exits. So the writeback was skipped and the numbers lived only in the
// trace on disk.
//
// MEASURED end to end before this changed, both configs, real Claude Code, real
// Supervisor: with no store MCP
// the table was on the row 4.8s after Enter and the inbox row carried it. With
// a store MCP the identical run left `result: ""`, the row sat in In progress
// reading "The agent stopped without finishing this. Your answer is still
// waiting.", and her inbox read INBOX ZERO.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { threadEvents } from '../renderer/src/thread-history';

const APP = path.resolve('.');
let root, data, dir;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'slashrow-'));
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'slashrow-data-'));
  dir = path.join(root, 'myproduct');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'myproduct', name: 'My Product' }));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
});

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
  // The store server ships in `mcp/` since 2026-09-22, so a supervisor pointed
  // at the repo root has one whatever the config says. `root` is a bare temp
  // directory, which is what a machine with no store actually looks like.
  const sup = new Supervisor(config, store, withMcp ? APP : root, data);
  sup._saveState = () => {};
  return { store, sup };
}

const ANSWERED = { result: 'Current session: 14% used · resets Aug 29 at 5:40pm', resultIsError: false };

describe('a slash command is spoken for on every install', () => {
  it('is written back even when a store MCP is configured', async () => {
    const { sup } = await setup({ withMcp: true });
    // the ordinary row is unchanged: on this machine the worker owns it
    expect(sup.speaksForTheSession(ANSWERED)).toBe(false);
    expect(sup.speaksForTheSession(ANSWERED, { command: false })).toBe(false);
    // the command is not that. Nothing in it can write a row.
    expect(sup.speaksForTheSession(ANSWERED, { command: true })).toBe(true);
  });

  it('still refuses a run that died, command or not', async () => {
    const { sup } = await setup({ withMcp: true });
    const died = { result: 'API Error: 500', resultIsError: true };
    expect(sup.speaksForTheSession(died, { command: true })).toBe(false);
    // and a run that never said anything is the retry machinery's business
    expect(sup.speaksForTheSession({ result: null }, { command: true })).toBe(false);
  });

  it('a machine with no store MCP is exactly as it was', async () => {
    const { sup } = await setup();
    expect(sup.speaksForTheSession(ANSWERED)).toBe(true);
    expect(sup.speaksForTheSession(ANSWERED, { command: true })).toBe(true);
  });

  it('the table lands on the row and the row goes back to her inbox', async () => {
    const { store } = await setup({ withMcp: true });
    const made = store.fileItem('myproduct', { title: 'The eleven landing page edits are live.', kind: 'review', body: 'Say merge it.' });
    store.answerItem('myproduct', made.id, { answer: '/usage' });
    store.recordSessionResult('myproduct', made.id, { result: ANSWERED.result });
    const after = store.readItem('myproduct', made.id, Date.now());
    expect(after.result).toContain('14% used');
    // blocked is what carries a finished answer back into her inbox
    expect(after.status).toBe('blocked');
  });
});

describe('what the thread calls it', () => {
  const lineFor = (answer) => threadEvents([
    { ts: 1000, source: 'agent', patch: { title: 'A row', body: 'Say merge it.' } },
    { ts: 2000, source: 'founder', patch: { answer } },
    { ts: 3000, source: 'agent', patch: { result: 'Current session: 14% used' } },
    { ts: 4000, source: 'system', patch: { status: 'blocked' } },
  ]).at(-1).said;

  it('says it answered you after a command, not that it stopped and asked', () => {
    // The row had just handed her the usage table.
    expect(lineFor('/usage')).toBe('It answered you');
    expect(lineFor('/context')).toBe('It answered you');
  });

  it('leaves every other blocked row saying exactly what it said', () => {
    expect(lineFor('Yes, merge it.')).toBe('It stopped and asked you');
    // a slash that is not one of the eight is an ordinary message
    expect(lineFor('/deploy the thing')).toBe('It stopped and asked you');
  });
});
