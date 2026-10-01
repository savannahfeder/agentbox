// AN AGENT STARTED BY THE BROWSER COPY CAN REACH ITS OWN WORK ITEM.
//
// Measured 2026-10-01 on the team build, by two testers on two separate copies
// started headless (`bootHeadless` in main/serve.mjs). Every store call the
// agent made came back "no work item w-9c0ff9eac7 in any product", so it could
// not claim its row, could not write a summary, and told the person "This
// message is the only copy."
//
// Why. The store keeps its ledgers under the app's home, which it reads from
// the app's home variable at call time (main/store/home.mjs). The desktop door
// points that variable at `storeRoot` from zero.config.json before it opens the
// store (main/main.mjs). The headless door never did. So the copy wrote its
// ledgers wherever the variable it inherited happened to point (on the test
// Mac that was the founder's own store, carried in from the agent session that
// started the copy; for `npx agentbox-app` with nothing set it is
// `~/.agentbox`, while `storeRoot` defaults to `~/Agentbox`), and every worker
// it started was handed `storeRoot`, where there was no ledger. On the test Mac
// 8 ledgers for 4 test copies had been written into the founder's real store.
//
// This boots the headless door with a store root in its config and a
// different home inherited from outside, makes a row, then starts the real
// store server exactly the way a worker's session would, and asks it to claim
// that row. It also seeds one row the way the broken copy wrote it (under the
// inherited home) and one row that belongs to the outside store, and checks
// the first comes across on boot and the second is left exactly where it was.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { bootHeadless } from '../main/serve.mjs';
import { createWorkItem } from '../main/store/work-items.mjs';
import { setAppHome } from './app-home.mjs';
import { nameSlug, envNames } from '../shared/product-name.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..');

let dir, storeRoot, inherited, booted, product, item, before, theirs, theirsDir;
const ACCOUNT = 'acct-copy-test';

function makeProduct(root, slug) {
  const at = path.join(root, 'accounts', ACCOUNT, slug);
  fs.mkdirSync(at, { recursive: true });
  fs.writeFileSync(path.join(at, 'project.json'), JSON.stringify({ schemaVersion: 1, id: slug, name: slug }));
  return at;
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-copy-item-'));
  storeRoot = path.join(dir, 'store');
  inherited = path.join(dir, 'somebody-elses-store');
  fs.mkdirSync(inherited, { recursive: true });
  fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify({ storeRoot, accountId: ACCOUNT }));
  // What a copy started from inside an agent session inherits: that session's
  // own store root, under every name the app answers to.
  setAppHome(inherited);
  // A row this copy wrote before the fix, which landed under the inherited home,
  // and a row of the outside store's own, which must stay put.
  before = createWorkItem(makeProduct(storeRoot, 'old-project'), { title: 'Written before the fix', kind: 'directive' }, { source: 'founder' });
  theirsDir = makeProduct(inherited, 'theirs');
  // An older account left beside this one, as a config rewritten without its
  // id leaves. The server must be told which account, never left to guess.
  fs.mkdirSync(path.join(storeRoot, 'accounts', 'acct-older', 'old-thing'), { recursive: true });
  theirs = createWorkItem(theirsDir, { title: 'Not this copy\'s', kind: 'directive' }, { source: 'founder' });
  booted = await bootHeadless({ dataDir: dir, appDir: repoRoot, userDir: dir });
  product = booted.store.createProduct({ name: 'Checkout service' });
  item = booted.store.composeItem(product.slug, { title: 'Make unknown codes throw' });
}, 30_000);

afterAll(async () => {
  await booted?.supervisor?.stopAll?.()?.catch?.(() => {});
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

/** Start the store server the way a worker's session does and call one tool. */
function callStoreTool(server, name, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(server.command, server.args ?? [], {
      env: { ...process.env, ...server.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`store server never answered: ${err}`)); }, 20_000);
    const send = (msg) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.on('data', (d) => {
      out += d;
      for (const line of out.split('\n')) {
        if (!line.trim()) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 1 && !msg.__seen) {
          msg.__seen = true;
          send({ method: 'notifications/initialized' });
          send({ id: 2, method: 'tools/call', params: { name, arguments: args } });
        }
        if (msg.id === 2) {
          clearTimeout(timer);
          child.kill('SIGTERM');
          resolve(msg.result);
          return;
        }
      }
      out = out.slice(out.lastIndexOf('\n') + 1);
    });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    send({ id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } } });
  });
}

describe('a worker started by the headless copy', () => {
  it('is handed the store the copy writes to', () => {
    const server = booted.supervisor.mcpServers()[nameSlug];
    expect(server).toBeTruthy();
    const handed = Object.values(server.env).filter((v) => v === storeRoot);
    expect(handed.length).toBeGreaterThan(0);
    expect(server.env.STORE_ACCOUNT_ID).toBe(ACCOUNT);
  });

  it('finds the row the copy just made and can claim it', async () => {
    const server = booted.supervisor.mcpServers()[nameSlug];
    const result = await callStoreTool(server, 'claim_work_item', { id: item.id });
    const text = result.content.map((c) => c.text).join('\n');
    expect(text).not.toMatch(/no work item/);
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(text).claimed).toBe(true);
  }, 30_000);

  it('writes nothing new into the store it inherited from outside', () => {
    const left = fs.readdirSync(path.join(inherited, 'projects'));
    expect(left).toHaveLength(1);
    expect(fs.readFileSync(path.join(inherited, 'projects', left[0], '.origin'), 'utf8').trim()).toBe(theirsDir);
    expect(fs.existsSync(path.join(storeRoot, 'projects'))).toBe(true);
  });

  it('brings a row written under the old home across, so it does not vanish', () => {
    expect(booted.store.readItem('old-project', before.id)?.title).toBe('Written before the fix');
  });

  it('leaves the outside store\'s own row where it was', () => {
    const ledger = fs.readdirSync(path.join(inherited, 'projects'))
      .map((d) => path.join(inherited, 'projects', d, 'work-items.jsonl'))
      .find((f) => fs.existsSync(f));
    expect(fs.readFileSync(ledger, 'utf8')).toContain(theirs.id);
  });

  it('points the app\'s own home at its store root under every name, as the desktop door does', () => {
    for (const key of envNames('HOME')) expect(process.env[key]).toBe(storeRoot);
  });
});
