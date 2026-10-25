// AFTER BRINGING CHATS IN, THE APP SAYS WHERE THEY WENT.
//
// The import said "Three rows are in two inboxes." Both power testers
// (w-62228098e6) stopped on it, four times between them: they had one inbox,
// "inboxes" meant projects, and since finished chats go to Done (setup, the
// ⌘K card and the switch alike) Needs you went up by two for three chats with
// nothing saying where the third went. For chats it now names the two places
// a person knows, Needs you and Done, and says a new project is a project.
// Agent files keep their sentence: they all land as rows asking for a job.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { importedLine } from '../renderer/src/agent-import-card';
import { Store } from '../main/store.mjs';

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

describe('the line after chats are brought in', () => {
  it('says how many went to Needs you and how many to Done', () => {
    expect(importedLine({ added: 3, done: 1, noun: 'thread', inboxes: 1, name: 'Backend' })).toBe('Two chats are in Needs you and one is in Done.');
    expect(importedLine({ added: 1, done: 0, noun: 'thread' })).toBe('One chat is in Needs you.');
    expect(importedLine({ added: 3, done: 3, noun: 'thread' })).toBe('Three chats are in Done.');
    expect(importedLine({ added: 4, done: 1, noun: 'thread' })).toBe('Three chats are in Needs you and one is in Done.');
  });

  it('calls a project it made a project', () => {
    expect(importedLine({ added: 3, done: 1, noun: 'thread', inboxes: 2, made: ['Frontend'] }))
      .toBe('Two chats are in Needs you and one is in Done. Frontend is a new project.');
    expect(importedLine({ added: 2, done: 0, noun: 'thread', inboxes: 3, made: ['Frontend', 'Scratchpad'] }))
      .toBe('Two chats are in Needs you. Two new projects were made for them.');
  });

  it('says which were already here', () => {
    expect(importedLine({ added: 2, done: 0, already: 1, noun: 'thread' })).toBe('Two chats are in Needs you. One was already here.');
  });

  it('leaves the agent files\' sentence as it was', () => {
    expect(importedLine({ added: 3, already: 0, name: 'Backend' })).toBe('Three rows are in your Backend inbox.');
  });
});

describe('the count of chats filed in Done', () => {
  it('comes back from the store, the channel and the bridge', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-import-done-'));
    const accountRoot = path.join(root, 'accounts', 'test-account');
    fs.mkdirSync(accountRoot, { recursive: true });
    const store = await new Store({ storeRoot: root, accountId: 'test-account', accountRoot, products: [] }).init();
    const folder = path.join(root, 'k');
    const { slug } = store.createProduct({ name: 'K', repoPath: folder });
    const chat = (id, waiting) => ({ id, source: 'terminal', folder, title: id, firstSaid: id, lastSaid: waiting ? 'Ok?' : 'Done.', waiting });
    expect(store.importThreadRows(slug, [chat('a', true), chat('b', false)], { land: 'sorted' })).toMatchObject({ added: 2, done: 1 });
    expect(store.importCodexThreads(slug, [{ ...chat('c', false), source: 'codex', prompt: 'c', last: 'Done.' }], { land: 'sorted' })).toMatchObject({ added: 1, done: 1 });
    expect(read('main/ipc.mjs')).toContain('done: claude.done + codex.done');
    expect(read('renderer/src/api.ts')).toContain('done: Number(r?.done ?? 0)');
    expect(read('renderer/src/components/ImportAgents.tsx')).toContain('done += r.done ?? 0;');
  });
});
