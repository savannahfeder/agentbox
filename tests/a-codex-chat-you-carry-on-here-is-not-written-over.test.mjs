// A CODEX CHAT YOU CARRY ON HERE IS NOT WRITTEN OVER.
//
// Setup's last screen (w-62228098e6, R1) says the chats you bring in carry on
// here. An imported Codex row said the opposite under every answer, "Read from
// Codex. Replies happen there.", and once a minute the Codex watch rewrote the
// row's result back to Codex's last message, so an answer from the agent that
// took your reply here was replaced within a minute by the old one.
//
// Now the row carries Codex's last message and nothing else, and the minute
// refresh leaves alone a row you have replied on here.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { codexMirrorPatch, codexIdOf } from '../shared/codex-import.mjs';

const NOW = Date.UTC(2026, 9, 24, 12);

async function world() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-codex-carry-'));
  const accountRoot = path.join(root, 'accounts', 'test-account');
  fs.mkdirSync(accountRoot, { recursive: true });
  const s = await new Store({ storeRoot: root, accountId: 'test-account', accountRoot, products: [] }).init();
  const folder = path.join(root, 'thicket');
  const { slug } = s.createProduct({ name: 'Thicket', repoPath: folder });
  return { s, slug, folder };
}

const thread = (folder, last) => ({
  id: 'cx1', source: 'codex', folder, folderName: 'thicket', short: '~/thicket', path: '/x/rollout-cx1.jsonl',
  title: 'Import workouts from Strava', when: NOW - 3600e3, startedAt: NOW - 7200e3,
  prompt: 'import workouts from strava', last, waiting: true, ask: last,
});

describe('an imported Codex chat', () => {
  it('carries Codex\'s last message and no line sending replies elsewhere', () => {
    expect(codexMirrorPatch(thread('/w', 'Skip them, or estimate it?')).result).toBe('Skip them, or estimate it?');
    expect(codexMirrorPatch(thread('/w', '')).result).toBe('Codex has not answered yet.');
  });

  it('keeps following Codex while nobody has replied here', async () => {
    const { s, slug, folder } = await world();
    s.importCodexThreads(slug, [thread(folder, 'Skip them, or estimate it?')], { now: NOW });
    expect(s.refreshCodexMirrors([thread(folder, 'Skipped them. Done.')], { now: NOW + 60e3 })).toBe(1);
    const row = s.listItems().find((i) => codexIdOf(i) === 'cx1');
    expect(row.result).toBe('Skipped them. Done.');
  });

  it('is left as the agent here left it once you replied here', async () => {
    const { s, slug, folder } = await world();
    s.importCodexThreads(slug, [thread(folder, 'Skip them, or estimate it?')], { now: NOW });
    const row = s.listItems().find((i) => codexIdOf(i) === 'cx1');
    s.answerItem(slug, row.id, { answer: 'skip them' });
    s.modules.workItemsDisk.updateWorkItem(s.productDir(slug), row.id, { result: 'Skipped the old rides. Tests pass.' }, { source: 'agent', now: NOW + 30e3 });
    expect(s.refreshCodexMirrors([thread(folder, 'Something Codex said later')], { now: NOW + 60e3 })).toBe(0);
    expect(s.listItems().find((i) => i.id === row.id).result).toBe('Skipped the old rides. Tests pass.');
  });
});
