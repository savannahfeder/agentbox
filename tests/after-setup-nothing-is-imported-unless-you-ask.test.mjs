// AFTER SETUP, NOTHING IS IMPORTED UNLESS YOU ASK.
//
// Asked before launch (w-db6f5e331e, 2026-10-05): "after onboarding for both
// anthropic and openai harnesses, it should only import on command, not
// continuously". Until this change the Codex watch (main/codex-watch.mjs) read
// every Codex conversation once a minute and filed an "Import into ...?" row
// for each new one in a project's folder. On the Codex-only test Mac that put
// two rows in the inbox nobody had asked for, a minute after setup was skipped.
// Claude Code conversations never had a watch; this pins that it stays so.
//
// What stays: the watch still keeps a conversation you already imported up to
// date when Codex writes more, which is reading something you asked for, not
// importing something new. Importing is the walk's last card and ⌘K import.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { scanCodex } from '../main/codex-watch.mjs';
import { codexIdOf, isCodexMirrorRow } from '../shared/codex-import.mjs';

const NOW = Date.parse('2026-10-05T14:00:00-07:00');

async function setUp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'import-on-ask-'));
  const accountRoot = path.join(root, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const s = await new Store({ storeRoot: root, accountId: 'a', accountRoot, products: [] }).init();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'import-on-ask-repo-'));
  const { slug } = s.createProduct({ name: 'Orders', repoPath: repo });
  return { s, slug, repo };
}
const thread = (id, folder, over = {}) => ({
  id, source: 'codex', folder, folderName: path.basename(folder), short: folder, title: `Conversation ${id}`,
  when: NOW - 60_000, prompt: `Please do ${id}.`, last: 'On it.', ...over,
});
const codexRows = (s, slug) => s.listAllWorkItems().filter((i) => i.product === slug && codexIdOf(i));

describe('the Codex watch', () => {
  it('files nothing for a new conversation in a project folder', async () => {
    const { s, slug, repo } = await setUp();
    const out = scanCodex({ store: s, readThreads: () => ({ threads: [thread('new', repo)] }), now: NOW });
    expect(codexRows(s, slug)).toEqual([]);
    expect(out.asked).toBeUndefined();
  });

  it('still keeps one you imported up to date', async () => {
    const { s, slug, repo } = await setUp();
    const t = thread('mine', repo);
    s.importCodexThreads(slug, [t], { now: NOW });
    const out = scanCodex({ store: s, readThreads: () => ({ threads: [{ ...t, last: 'Done, and tested.' }] }), now: NOW + 5000 });
    expect(out.refreshed).toBe(1);
    const [row] = codexRows(s, slug);
    expect(isCodexMirrorRow(row)).toBe(true);
    expect(row.result).toContain('Done, and tested.');
  });

  it('files nothing however many times it runs', async () => {
    const { s, slug, repo } = await setUp();
    for (let i = 0; i < 3; i += 1) {
      scanCodex({ store: s, readThreads: () => ({ threads: [thread('a', repo), thread('b', repo)] }), now: NOW + i * 60_000 });
    }
    expect(codexRows(s, slug)).toEqual([]);
  });
});

describe('importing is something you ask for', () => {
  it('⌘K import still brings a conversation in', async () => {
    const { s, slug, repo } = await setUp();
    expect(s.importCodexThreads(slug, [thread('asked', repo)], { now: NOW }).added).toBe(1);
  });

  it('nothing in the main process files rows on its own', () => {
    // The only callers of the store's import doors are the card's IPC handlers.
    const read = (f) => fs.readFileSync(new URL(`../main/${f}`, import.meta.url), 'utf8');
    for (const f of ['main.mjs', 'supervisor.mjs', 'codex-watch.mjs']) {
      expect(read(f), f).not.toMatch(/askAboutCodexThreads\(|importThreadRows\(|importCodexThreads\(/);
    }
  });
});
