// The app has to start on a Mac that has never heard of the other product.
//
// It used to load seven modules out of another checkout by absolute path and
// throw on purpose when they were missing, so a stranger's first launch ended
// at an error dialog. Those modules live in this repo now. What this file pins
// is the part a refactor could quietly undo: that the boot path reaches nothing
// outside the repo, and that a worker's grant names tools that really exist.
//
// THE STORE SERVER SHIPS WITH THE APP SINCE 2026-09-22, and that moved the
// second half of this file. It used to say a fresh install gets NO store tools,
// which was true while the server lived in that other repo and a stranger had
// no copy of it. `mcp/` is in this one now, so the honest version of the same
// guarantee is that the grant and the server agree: tools are granted when a
// server is there to serve them, and not when there is none.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { loadConfig } from '../main/config.mjs';
import { defaultStoreRoot } from '../main/store/home.mjs';
import { nameSlug } from '../shared/product-name.mjs';

let root, dir;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'strangers-mac-'));
  dir = path.join(root, 'myproduct');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'myproduct', name: 'My Product' }));
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

const configFor = (over = {}) => ({
  accountRoot: root, storeRoot: root, products: [], personalProducts: [],
  accountId: 'nobody', claudeBin: '/nonexistent', ...over,
});

describe('starting with no outside checkout on the machine', () => {
  it('boots the store, files an item and reads it back', async () => {
    const store = await new Store(configFor()).init();
    expect(store.listProducts().map((p) => p.slug)).toEqual(['myproduct']);
    const made = store.fileItem('myproduct', { title: 'First run', kind: 'task' });
    store.answerItem('myproduct', made.id, { answer: 'Yes.' });
    const back = store.readItem('myproduct', made.id, Date.now());
    expect(back.title).toBe('First run');
    expect(back.answer).toBe('Yes.');
    // the fold's authorship map still works, which is the thing the moved
    // modules exist for
    expect(back.wrote.answer.source).toBe('founder');
  });

  // WHICH PATHS COUNT AS OUTSIDE, and the string that used to decide it refused
  // every push from the one checkout that matters.
  //
  // The rule was `/Desktop\/dev\//`, written when the other product's checkout
  // was the thing to stay out of. But the developer's own copy of THIS repo
  // lives at ~/Desktop/dev/zero, and the pre-push hook runs the suite there, so
  // once the store server and the approval server shipped inside this repo the
  // boot quite correctly read `<repo>/mcp/agentbox-mcp.sh` and
  // `<repo>/scripts/approval-server.sh` and this test called them foreign.
  // Measured 2026-09-23: green in a worktree under /tmp and red in that
  // checkout, on the same commit, which is a test that can only fail where it
  // is actually run.
  //
  // So the repo root decides, which is what the sentence above the test always
  // said. Anything under `Desktop/dev/` that is NOT inside this checkout is
  // still a failure, and that is the whole point of the file.
  it('touches nothing outside this repo while it boots', async () => {
    const repo = path.resolve('.');
    const reached = [];
    const patched = [];
    for (const name of ['readFileSync', 'existsSync', 'readdirSync', 'statSync', 'openSync']) {
      const orig = fs[name];
      patched.push([name, orig]);
      fs[name] = function (p, ...rest) {
        const outside = typeof p === 'string'
          && /Desktop\/dev\//.test(p)
          && !path.resolve(p).startsWith(repo + path.sep);
        if (outside) reached.push(`${name}:${p}`);
        return orig.call(this, p, ...rest);
      };
    }
    try {
      const config = configFor();
      const store = await new Store(config).init();
      const sup = new Supervisor(config, store, repo);
      store.fileItem('myproduct', { title: 'x', kind: 'task' });
      sup.writeMcpConfig();
    } finally {
      for (const [name, orig] of patched) fs[name] = orig;
    }
    expect(reached).toEqual([]);
  });

  it('ships its own store, so a fresh install has the tools it grants', async () => {
    const config = configFor();
    const store = await new Store(config).init();
    const sup = new Supervisor(config, store, path.resolve('.'));
    // No storeMcpCommand in the config at all, and the server is still there,
    // because it is in this repo: mcp/<name>-mcp.sh beside the app.
    expect(sup.storeMcpCommand()).toBe(path.resolve('.', 'mcp', `${nameSlug}-mcp.sh`));
    // The mode is said out loud rather than left off: with no flag Claude Code
    // falls back to that person's own ~/.claude/settings.json, so the same
    // install ran a different mode on every Mac.
    expect(sup.defaultSessionArgs()).toEqual(['--allowedTools', `mcp__${nameSlug}`, '--permission-mode', 'auto']);
    const file = sup.writeMcpConfig();
    const servers = Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).mcpServers);
    expect(servers).toContain(nameSlug);
    // The store server takes its key from shared/product-name.mjs and from
    // nothing else, so the app's own name is the only one it can write. This
    // line used to exclude a hardcoded name carried over from an older product;
    // that name is gone from the repo, so the honest check is that no second
    // store server appears at all.
    expect(servers.filter((s) => s !== 'zero-approvals')).toEqual([nameSlug]);
  });

  it('grants no store tools when there is no server to serve them', async () => {
    // The guarantee the test above used to make, kept honest: an app directory
    // with no mcp/ in it hands out no store grant, so a grant never names a
    // namespace that is not there.
    const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-mcp-'));
    const config = configFor();
    const store = await new Store(config).init();
    const sup = new Supervisor(config, store, appDir);
    expect(sup.storeMcpCommand()).toBe(null);
    expect(sup.defaultSessionArgs()).toEqual(['--permission-mode', 'auto']);
    fs.rmSync(appDir, { recursive: true, force: true });
  });

  it('lets a configured store MCP win over the bundled one', async () => {
    const launcher = path.join(root, 'store-mcp.sh');
    fs.writeFileSync(launcher, '#!/bin/sh\n');
    const config = configFor({ storeMcpCommand: launcher });
    const store = await new Store(config).init();
    const sup = new Supervisor(config, store, path.resolve('.'));
    expect(sup.storeMcpCommand()).toBe(launcher);
    expect(sup.defaultSessionArgs()).toEqual(['--allowedTools', `mcp__${nameSlug}`, '--permission-mode', 'auto']);
    const servers = JSON.parse(fs.readFileSync(sup.writeMcpConfig(), 'utf8')).mcpServers;
    expect(servers[nameSlug].command).toBe(launcher);
  });

  it('falls back to the bundled server when a configured path has gone', async () => {
    // A config pointing into a checkout that has been deleted or moved used to
    // resolve to null, which silently took every store tool away from every
    // worker. The bundled server is the safety net.
    const config = configFor({ storeMcpCommand: path.join(root, 'not-here.sh') });
    const store = await new Store(config).init();
    const sup = new Supervisor(config, store, path.resolve('.'));
    expect(sup.storeMcpCommand()).toBe(path.resolve('.', 'mcp', `${nameSlug}-mcp.sh`));
  });

  it('reads the store root from storeRoot', () => {
    const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appdir-'));
    fs.writeFileSync(path.join(appDir, 'zero.config.json'), JSON.stringify({ storeRoot: root, accountId: 'acct' }));
    const config = loadConfig(appDir);
    expect(config.storeRoot).toBe(root);
    expect(config.accountRoot).toBe(path.join(root, 'accounts', 'acct'));
    fs.rmSync(appDir, { recursive: true, force: true });
  });

  it('falls back to a folder of our own when the config names no store', () => {
    // There was a second key here once, an alias for `storeRoot` left over from
    // an older product, and this test pinned that a config carrying only the old
    // spelling still worked. The alias was removed on 2026-09-22 and her own
    // config renamed in the same step, so the only thing left worth pinning is
    // where a config that names no store at all ends up: a folder of ours,
    // never anybody else's.
    const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appdir-'));
    fs.writeFileSync(path.join(appDir, 'zero.config.json'), JSON.stringify({ accountId: 'acct' }));
    const config = loadConfig(appDir);
    const store = defaultStoreRoot({ home: os.homedir() });
    expect(config.storeRoot).toBe(store);
    expect(config.accountRoot).toBe(path.join(store, 'accounts', 'acct'));
    fs.rmSync(appDir, { recursive: true, force: true });
  });
});
