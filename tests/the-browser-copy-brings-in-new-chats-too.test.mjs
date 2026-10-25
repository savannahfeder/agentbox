// THE BROWSER COPY BRINGS IN NEW CHATS TOO.
//
// Setup's last screen ends on "Keep bringing in new chats from Claude Code and
// Codex", and Settings has the same switch. The watch that does the bringing
// was started in main/main.mjs only, so in the browser copy (bin/agentbox.mjs,
// `npx agentbox-app`) the tick was saved and nothing ever came in. Found while
// setting up the power test for w-62228098e6, whose copies are that browser
// copy.
//
// Both now start the one wiring, `watchNewChatsFor`, and this checks that
// wiring end to end: a chat in a project's folder, started after the switch
// and quiet since, is filed by the watch's own pass.

import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { QUIET_MS, watchNewChatsFor } from '../main/new-chats-watch.mjs';

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

describe('both ways of running the app start the watch', () => {
  it('the browser copy starts it with the agents and stops it on the way out', () => {
    const bin = read('bin/agentbox.mjs');
    const block = bin.slice(bin.indexOf('if (!process.env.ZERO_NO_SUPERVISOR)'), bin.indexOf('const token = newToken()'));
    expect(block).toMatch(/watchNewChatsFor\(\{ store: booted\.store, config: booted\.config, supervisor: booted\.supervisor \}\)/);
    expect(bin).toMatch(/newChatsWatch\?\.stop\(\)/);
  });

  it('the desktop starts the same wiring rather than its own', () => {
    const main = read('main/main.mjs');
    expect(main).toMatch(/const newChatsWatch = watchNewChatsFor\(\{ store, config, supervisor \}\)/);
    expect(main).not.toMatch(/startNewChatsWatch\(/);
  });

  it('a launch that asks for no agents brings in no chats either', () => {
    const bin = read('bin/agentbox.mjs');
    expect(bin.indexOf('watchNewChatsFor(')).toBeGreaterThan(bin.indexOf('if (!process.env.ZERO_NO_SUPERVISOR)'));
  });
});

describe('the wiring, off the disk', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  async function world({ importNew }) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-browser-watch-'));
    vi.stubEnv('HOME', home);
    vi.stubEnv('CLAUDE_CONFIG_DIR', path.join(home, '.claude'));
    vi.stubEnv('CODEX_HOME', path.join(home, '.codex'));
    const root = path.join(home, 'store');
    const accountRoot = path.join(root, 'accounts', 'test-account');
    fs.mkdirSync(accountRoot, { recursive: true });
    const store = await new Store({ storeRoot: root, accountId: 'test-account', accountRoot, products: [] }).init();
    const folder = path.join(home, 'dev', 'kestrel');
    fs.mkdirSync(folder, { recursive: true });
    const { slug } = store.createProduct({ name: 'Kestrel', repoPath: folder });
    const since = Date.now() - 3600e3;
    const dir = path.join(home, '.claude', 'projects', folder.replace(/[^a-zA-Z0-9]/g, '-'));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'chat-1.jsonl');
    const at = (t) => new Date(t).toISOString();
    fs.writeFileSync(file, `${[
      { type: 'user', cwd: folder, entrypoint: 'cli', timestamp: at(since + 60e3), message: { role: 'user', content: [{ type: 'text', text: 'make search faster' }] } },
      { type: 'ai-title', aiTitle: 'Speed up search' },
      { type: 'assistant', cwd: folder, entrypoint: 'cli', timestamp: at(since + 120e3), message: { role: 'assistant', content: [{ type: 'text', text: 'Indexed it. Shall I ship it?' }] } },
    ].map((r) => JSON.stringify(r)).join('\n')}\n`);
    const quiet = new Date(Date.now() - QUIET_MS - 60e3);
    fs.utimesSync(file, quiet, quiet);
    const config = { storeRoot: root, accountRoot, importNew, importNewSince: since };
    const watch = watchNewChatsFor({ store, config, supervisor: null, firstDelayMs: 3600e3, everyMs: 3600e3 });
    return { store, slug, watch };
  }

  it('files a quiet chat from a project folder once the switch is on', async () => {
    const w = await world({ importNew: true });
    try {
      await w.watch.scanNow();
      const rows = w.store.listItems().filter((i) => i.product === w.slug);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ title: 'Speed up search', status: 'open' });
      expect(rows[0].labels).toContain('thread:chat-1');
    } finally { w.watch.stop(); }
  });

  it('files nothing while the switch is off', async () => {
    const w = await world({ importNew: false });
    try {
      await w.watch.scanNow();
      expect(w.store.listItems().filter((i) => i.product === w.slug)).toEqual([]);
    } finally { w.watch.stop(); }
  });
});
