// NEW CHATS COME IN ON THEIR OWN, ONLY WHEN YOU ASKED FOR THAT.
//
// Setup's last screen (w-62228098e6, R1, approved) ends on a tick, "Keep
// bringing in new chats from Claude Code and Codex". Before this nothing
// brought a chat in after setup: the Codex watch that once did was removed on
// 2026-10-05 because it filed an "Import into X?" row for every new chat
// (tests/after-setup-nothing-is-imported-unless-you-ask.test.mjs), and the
// founder's rule then was to import only on command. The tick is the command.
//
// So the watch brings in nothing until the switch is on; then only chats
// started after it was switched on, in a folder one of your projects points
// at, once they have gone quiet and nothing has them open. It never asks
// about a chat first: a waiting one lands in Needs you, a finished one in Done.

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { scanNewChats, startNewChatsWatch, QUIET_MS } from '../main/new-chats-watch.mjs';

const ON_AT = Date.UTC(2026, 9, 24, 9, 0, 0);
const NOW = ON_AT + 3 * 3600e3;

async function world() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-new-chats-'));
  const accountRoot = path.join(root, 'accounts', 'test-account');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot: root, accountId: 'test-account', accountRoot, products: [] }).init();
  const folder = path.join(root, 'kestrel');
  const { slug } = store.createProduct({ name: 'Kestrel', repoPath: folder });
  return { store, slug, folder, root, config: { importNew: true, importNewSince: ON_AT } };
}

const chat = (id, folder, over = {}) => ({
  id, source: 'terminal', folder, folderName: 'kestrel', short: '~/kestrel', path: `/x/${id}.jsonl`,
  title: `Chat ${id}`, startedAt: ON_AT + 3600e3, when: NOW - QUIET_MS - 60e3,
  firstSaid: `do ${id}`, lastSaid: 'Done. Tests pass.', waiting: false, ask: '', ...over,
});

const rows = (store, slug) => store.listItems().filter((i) => i.product === slug);
const scan = (w, threads, extra = {}) => scanNewChats({
  store: w.store, config: w.config, now: NOW, readThreads: async () => threads, isOpen: () => false, ...extra,
});

describe('new chats from Claude Code and Codex', () => {
  it('bring nothing in while the switch is off', async () => {
    const w = await world();
    w.config.importNew = false;
    const out = await scan(w, [chat('a', w.folder)]);
    expect(out.brought).toBe(0);
    expect(rows(w.store, w.slug)).toEqual([]);
  });

  it('come in sorted once quiet: waiting to Needs you, finished to Done', async () => {
    const w = await world();
    const out = await scan(w, [
      chat('asks', w.folder, { waiting: true, lastSaid: 'Shall I ship it?', ask: 'Shall I ship it?' }),
      chat('done', w.folder),
      { ...chat('cx', w.folder, { waiting: true, lastSaid: 'Skip them?', ask: 'Skip them?' }), source: 'codex', prompt: 'do cx', last: 'Skip them?' },
    ]);
    expect(out.brought).toBe(3);
    const by = (label) => rows(w.store, w.slug).find((i) => i.labels.includes(label));
    expect(by('thread:asks').status).toBe('open');
    expect(by('thread:done').status).toBe('done');
    expect(by('codex:cx').status).toBe('open');
    // Never a row that asks whether to import.
    expect(rows(w.store, w.slug).some((i) => i.kind === 'import')).toBe(false);
  });

  it('leave out chats started before the switch was turned on', async () => {
    const w = await world();
    const out = await scan(w, [chat('old', w.folder, { startedAt: ON_AT - 60e3 })]);
    expect(out.brought).toBe(0);
  });

  it('wait until a chat has gone quiet', async () => {
    const w = await world();
    expect((await scan(w, [chat('busy', w.folder, { when: NOW - 60e3 })])).brought).toBe(0);
    expect((await scan(w, [{ ...chat('live', w.folder), source: 'codex', live: true }])).brought).toBe(0);
  });

  // CHANGED 2026-10-25 on the founder's pick: most people leave Claude Code
  // open in its terminal for hours, so "nothing has it open" kept their chats
  // out for good. A reply here to a chat still open carries on a copy
  // (Supervisor#importedThreadFor), so the two never write over each other.
  it('come in once quiet even while Claude Code still has the chat open', async () => {
    const w = await world();
    const out = await scan(w, [chat('open', w.folder)], { isOpen: (t) => t.id === 'open' });
    expect(out.brought).toBe(1);
  });

  it('leave an open chat to "Show while they run" when that setting shows it live', async () => {
    for (const mode of ['all', 'waiting']) {
      const w = await world();
      w.config.outsideAgents = mode;
      expect((await scan(w, [chat('open', w.folder)], { isOpen: () => true })).brought).toBe(0);
      expect((await scan(w, [chat('closed', w.folder)], { isOpen: () => false })).brought).toBe(1);
    }
  });

  it('never go into a project shared with a team, where teammates would read them', async () => {
    const w = await world();
    const shared = w.store.listProducts().map((p) => ({ ...p, team: { projectId: 'tp-1' } }));
    w.store.listProducts = () => shared;
    expect((await scan(w, [chat('private', w.folder)])).brought).toBe(0);
  });

  it('leave out a chat in a folder no project points at', async () => {
    const w = await world();
    expect((await scan(w, [chat('elsewhere', path.join(w.root, 'other'))])).brought).toBe(0);
  });

  it('bring a chat in once, however many passes see it', async () => {
    const w = await world();
    await scan(w, [chat('once', w.folder)]);
    const again = await scan(w, [chat('once', w.folder)]);
    expect(again.brought).toBe(0);
    expect(rows(w.store, w.slug)).toHaveLength(1);
  });
});

describe('end to end, off the disk', () => {
  it('files a chat started in a project folder after the switch, through the real reader', async () => {
    const w = await world();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-new-chats-home-'));
    const dir = path.join(home, '.claude', 'projects', w.folder.replace(/[^a-zA-Z0-9]/g, '-'));
    fs.mkdirSync(dir, { recursive: true });
    const at = (t) => new Date(t).toISOString();
    const file = path.join(dir, 'real-1.jsonl');
    fs.writeFileSync(file, [
      { type: 'user', cwd: w.folder, entrypoint: 'cli', timestamp: at(ON_AT + 60e3), message: { role: 'user', content: [{ type: 'text', text: 'make search faster' }] } },
      { type: 'ai-title', aiTitle: 'Speed up search' },
      { type: 'assistant', cwd: w.folder, entrypoint: 'cli', timestamp: at(ON_AT + 120e3), message: { role: 'assistant', content: [{ type: 'text', text: 'Indexed it. Shall I ship it?' }] } },
    ].map((r) => JSON.stringify(r)).join('\n'));
    const quiet = new Date(NOW - QUIET_MS - 60e3);
    fs.utimesSync(file, quiet, quiet);
    const { readRecentThreads } = await import('../main/importable-threads.mjs');
    const out = await scanNewChats({
      store: w.store, config: w.config, now: NOW, isOpen: () => false,
      readThreads: (opts) => readRecentThreads({ ...opts, home, env: {}, readCodex: async () => ({ threads: [] }) }),
    });
    expect(out.brought).toBe(1);
    const row = rows(w.store, w.slug)[0];
    expect(row).toMatchObject({ title: 'Speed up search', body: 'make search faster', result: 'Indexed it. Shall I ship it?', status: 'open' });
  });
});

describe('the watch itself', () => {
  it('gives up a pass that never answers, and the next pass still runs', async () => {
    vi.useFakeTimers();
    try {
      const w = await world();
      let calls = 0;
      const watch = startNewChatsWatch({
        store: w.store, config: w.config, everyMs: 1000, firstDelayMs: 10, deadlineMs: 500, log: () => {},
        readThreads: () => { calls += 1; return calls === 1 ? new Promise(() => {}) : Promise.resolve([]); },
        isOpen: () => false,
      });
      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(600);
      await vi.advanceTimersByTimeAsync(1000);
      expect(calls).toBe(2);
      watch.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
