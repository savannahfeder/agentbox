// SEARCHING THE IMPORT CARD KEEPS WHAT IT READ OF EACH CHAT.
//
// The ⌘K import card lists ten days of chats read in full: Claude Code's own
// title, the agent's last answer, whether it waits on you. Typing in its name
// field reads every chat again, quickly and without those ends, and the merge
// let that quick copy replace the full one. A power tester (w-62228098e6)
// typed "refund", cleared it and brought in thirteen chats: every one landed
// named after its first message ("search is slow on big accounts, make it
// faster" for "Speed up the search endpoint"), with no answer under it, and in
// Needs you however it had ended. Measured on the copy's ledger: no row had a
// result.
//
// So a chat the list already holds keeps the copy it has, and the search only
// adds the ones it did not.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let dir;
let booted;
let folder;
const call = (channel, payload) => booted.channels.get(channel)({}, payload);

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-import-search-'));
  vi.stubEnv('HOME', dir);
  vi.stubEnv('CLAUDE_CONFIG_DIR', path.join(dir, '.claude'));
  vi.stubEnv('CODEX_HOME', path.join(dir, '.codex'));
  folder = path.join(dir, 'dev', 'kestrel');
  fs.mkdirSync(folder, { recursive: true });
  const at = (minsAgo) => new Date(Date.now() - minsAgo * 60e3).toISOString();
  const chats = path.join(dir, '.claude', 'projects', folder.replace(/[^a-zA-Z0-9]/g, '-'));
  fs.mkdirSync(chats, { recursive: true });
  fs.writeFileSync(path.join(chats, 'chat-1.jsonl'), `${[
    { type: 'user', cwd: folder, entrypoint: 'cli', timestamp: at(30), message: { role: 'user', content: 'search is slow on big accounts, make it faster' } },
    { type: 'ai-title', aiTitle: 'Speed up the search endpoint' },
    { type: 'assistant', cwd: folder, entrypoint: 'cli', timestamp: at(25), message: { role: 'assistant', content: [{ type: 'text', text: 'An index takes it to 40ms. Shall I add the migration?' }] } },
  ].map((r) => JSON.stringify(r)).join('\n')}\n`);
  fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify({ storeRoot: path.join(dir, 'store') }));
  const { bootHeadless } = await import('../main/serve.mjs');
  booted = await bootHeadless({ dataDir: dir, appDir: repoRoot, userDir: dir });
  booted.store.createProduct({ name: 'Kestrel', repoPath: folder });
}, 30_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await booted?.supervisor?.stopAll?.().catch?.(() => {});
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

// AND IT FINDS A CHAT NEWER THAN THE FIRST SEARCH. The search is read once
// and kept for the life of the window, so a chat started after it was never
// found by name: the second tester searched "footer" with two "Fix the footer
// overlap" chats on the list a second earlier and was told no chat had it.
describe('a search after new chats arrived', () => {
  it('finds them, and can bring one in', async () => {
    await call('zero:agent-threads');
    await call('zero:search-agent-threads', {});
    const at = new Date().toISOString();
    const chats = path.join(dir, '.claude', 'projects', folder.replace(/[^a-zA-Z0-9]/g, '-'));
    fs.writeFileSync(path.join(chats, 'chat-2.jsonl'), `${[
      { type: 'user', cwd: folder, entrypoint: 'cli', timestamp: at, message: { role: 'user', content: 'the footer overlaps the cookie banner' } },
      { type: 'ai-title', aiTitle: 'Fix the footer overlap' },
      { type: 'assistant', cwd: folder, entrypoint: 'cli', timestamp: at, message: { role: 'assistant', content: [{ type: 'text', text: 'Moved the banner. Fixed.' }] } },
    ].map((r) => JSON.stringify(r)).join('\n')}\n`);
    await call('zero:agent-threads');
    const found = await call('zero:search-agent-threads', {});
    expect(found.threads.find((t) => t.id === 'chat-2')).toMatchObject({ title: 'Fix the footer overlap' });
    const out = await call('zero:import-threads', { product: 'kestrel', threads: ['chat-2'] });
    expect(out.added).toBe(1);
  });
});

describe('a search between reading the list and bringing chats in', () => {
  it('leaves each listed chat as the list read it', async () => {
    const listed = await call('zero:agent-threads');
    expect(listed.threads.find((t) => t.id === 'chat-1')).toMatchObject({ title: 'Speed up the search endpoint', waiting: true });
    await call('zero:search-agent-threads', {});
    const out = await call('zero:import-threads', { product: 'kestrel', threads: ['chat-1'] });
    expect(out.added).toBe(1);
    const row = booted.store.listItems().find((i) => i.labels?.includes('thread:chat-1'));
    expect(row).toMatchObject({
      title: 'Speed up the search endpoint',
      body: 'search is slow on big accounts, make it faster',
      result: 'An index takes it to 40ms. Shall I add the migration?',
    });
  });
});
