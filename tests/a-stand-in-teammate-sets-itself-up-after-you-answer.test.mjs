// A power test of teammates on stand-ins never reached a working teammate: the
// stand-in worker answered every run with its canned line and never called the
// team tools, so a new teammate sat in "Setting up" for the whole hour and the
// tester could only report that. Measured by asking for the power test in the
// cloud, where real Claude Code cannot sign in. Now a stand-in on a teammate's
// run asks its setup question, sets itself up once you answer, and answers in
// the chat, through the store server a real run is given.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appHome } from '../main/store/home.mjs';
import { loadStore } from '../main/store-modules.mjs';
import { Teammates } from '../main/teammates.mjs';
import { writeChat } from '../main/store/teammates-files.mjs';
import { YOU } from '../shared/teammates.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUB = path.join(root, 'scripts', 'lib', 'stub-claude-worker.mjs');

describe('a stand-in on a teammate\'s run', () => {
  let team; let store; let dir; let product; let config;
  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mjs');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mjs');
    product = createProduct(`Shop ${Math.random().toString(36).slice(2, 8)}`);
    dir = path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID, product.id);
    const mods = await loadStore();
    store = {
      config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID }, modules: mods,
      listProducts: () => [{ slug: product.id, dir, name: product.name }],
      productDir: () => dir,
      listItems: (now) => mods.workItemsDisk.readWorkItems(dir, now).map((i) => ({ ...i, product: product.id })),
    };
    team = new Teammates(store);
    config = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stand-in-mate-')), 'mcp.json');
    fs.writeFileSync(config, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [path.join(root, 'mcp', 'stdio.mjs')], env: { STORE_ACCOUNT_ID: process.env.STORE_ACCOUNT_ID } } } }));
  });
  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

  const runFor = (t) => {
    const run = store.modules.workItemsDisk.createWorkItem(dir, { title: 'Set yourself up', labels: ['founder', `teammate:${t.id}`, 'hop:0'] }, { source: 'system' });
    const brief = team.briefFor({ id: run.id, labels: run.labels });
    const child = spawn(process.execPath, [STUB, '-p', 'Find me launch posts worth writing', '--append-system-prompt', brief, '--mcp-config', config], {
      env: { ...process.env, STUB_CLAUDE_PLAN: '', ZERO_ITEM: run.id, ZERO_PRODUCT: product.id }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return new Promise((resolve) => child.on('exit', resolve));
  };
  const me = (id) => team.list().find((t) => t.id === id);

  it('asks before it starts, then sets itself up with a duty once you answer', async () => {
    const { teammate: t } = team.describe({ text: 'Find me launch posts worth writing' });
    expect(await runFor(t)).toBe(0);
    expect(me(t.id).status).toBe('draft');
    const ask = team.chat().messages.filter((m) => m.kind === 'msg' && m.from === t.id).at(-1);
    expect(ask.options?.length).toBeGreaterThan(1);
    expect(me(t.id).name).toBe('Marketing lead');

    writeChat(team.dir(), { kind: 'msg', from: YOU, to: [t.id], text: ask.options[0] }, Date.now() + 1000);
    expect(await runFor(me(t.id))).toBe(0);
    expect(me(t.id).status).toBe('active');
    expect(me(t.id).duties).toHaveLength(1);
  }, 30_000);

  it('keeps a starter\'s own name, and answers in the chat once it is working', async () => {
    const { teammate: t } = team.describe({ starter: 'support' });
    writeChat(team.dir(), { kind: 'msg', from: YOU, to: [t.id], text: 'Go ahead' }, Date.now() + 1000);
    await runFor(t);
    expect(me(t.id)).toMatchObject({ name: 'Support lead', status: 'active' });
    await runFor(me(t.id));
    expect(team.chat().messages.filter((m) => m.kind === 'msg' && m.from === t.id).at(-1).text).toBe('the stub worker ran');
  }, 30_000);
});
