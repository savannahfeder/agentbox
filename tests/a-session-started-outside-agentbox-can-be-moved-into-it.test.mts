// A SESSION STARTED OUTSIDE AGENTBOX CAN BE MOVED INTO IT.
//
// The founder on w-34f79ab66e (2026-11-23): an outside session "starts off by
// showing that it's basically just a pointer to the terminal ... A lot of
// people might want to say, 'Actually I want to pull this agent into
// AgentBox'". There was no way to: the import only took chats that had gone
// quiet, from setup or ⌘K's card. Move to Agentbox files the live session as
// a thread through that same import, so a second press opens the same thread
// and a chat imported later is not filed twice.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { chatFromSession, rowForSession } from '../shared/bring-in.mts';

const NOW = Date.UTC(2026, 10, 23, 9, 0, 0);
const MIN = 60_000;

async function world() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-bring-in-'));
  const accountRoot = path.join(root, 'accounts', 'test-account');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot: root, accountId: 'test-account', accountRoot, products: [] }).init();
  const folder = path.join(root, 'storefront');
  const { slug } = store.createProduct({ name: 'Storefront', repoPath: folder });
  return { store, slug, folder };
}

const claude = (folder: string, over = {}) => ({
  pid: 4211, sessionId: 'cl-1', engine: 'claude' as const, name: 'storefront-3a', cwd: folder, startedAt: NOW - 50 * MIN,
  status: 'idle', lastActiveAt: NOW - 6 * MIN, about: 'Find why the receipts page is slow',
  asked: [{ at: NOW - 50 * MIN, text: 'the receipts page is slow for big stores, can you find out why' }],
  lastSaid: 'It is one query. Do you want me to fix it?', ...over,
});
const codex = (folder: string, over = {}) => ({
  pid: 0, sessionId: 'cx-3', engine: 'codex' as const, app: 'Codex in a terminal', name: 'Codex', cwd: folder, startedAt: NOW - 8 * MIN,
  status: 'waiting', lastActiveAt: NOW - MIN, about: 'Install the date library',
  asked: [{ at: NOW - 8 * MIN, text: '<in-app-browser-context source="x">\nignore\n</in-app-browser-context>\n\n## My request:\nadd date-fns' }],
  lastSaid: '', approval: { command: 'npm install date-fns', reason: 'May I install it?' }, ...over,
});

describe('what a session is filed as', () => {
  it('a Claude Code session: its first words as the body, its last as the result', () => {
    expect(chatFromSession(claude('/x'))).toMatchObject({
      id: 'cl-1', source: 'claude', title: 'Find why the receipts page is slow', folder: '/x',
      firstSaid: 'the receipts page is slow for big stores, can you find out why', lastSaid: 'It is one query. Do you want me to fix it?', waiting: false,
    });
  });
  it('a Codex session: in the words the person typed, without what Codex adds before them', () => {
    expect(chatFromSession(codex('/x'))).toMatchObject({ id: 'cx-3', source: 'codex', prompt: 'add date-fns', waiting: true });
  });
  it('and what it is stopped on, a command to allow or a question, is where it stands', () => {
    expect(chatFromSession(codex('/x'))?.last).toBe('May I install it?\n\n`npm install date-fns`');
    const asks = chatFromSession(claude('/x', { lastSaid: 'I looked at both.', question: [{ question: 'Which library?', options: ['date-fns', 'Luxon'] }] }));
    expect(asks?.lastSaid).toBe('I looked at both.\n\nWhich library?\n1. date-fns\n2. Luxon');
  });
  it('named by what was asked when it has no name of its own', () => {
    expect(chatFromSession(claude('/x', { about: '' }))?.title).toBe('the receipts page is slow for big stores, can you find out why');
  });
  it('nothing for a session with no id to file it under', () => {
    expect(chatFromSession(claude('/x', { sessionId: null }))).toBeNull();
    expect(chatFromSession(null)).toBeNull();
  });
});

describe('moving it in', () => {
  it('a Claude Code session becomes a thread that carries the conversation on', async () => {
    const w = await world();
    const out = w.store.importThreadRows(w.slug, [chatFromSession(claude(w.folder))!], { land: 'inbox' });
    expect(out.added).toBe(1);
    const row = w.store.listItems().find((i) => i.id === out.ids[0])!;
    expect(row.labels).toEqual(expect.arrayContaining(['thread-import', 'thread:cl-1']));
    expect(row.status).not.toBe('done');
    expect(rowForSession(w.store.listItems(), claude(w.folder))?.id).toBe(row.id);
  });
  it('a Codex session becomes a thread that carries on with Codex', async () => {
    const w = await world();
    const out = w.store.importCodexThreads(w.slug, [chatFromSession(codex(w.folder))!], { land: 'inbox' });
    expect(out.added).toBe(1);
    const row = w.store.listItems().find((i) => i.id === out.ids[0])!;
    expect(row.labels).toEqual(expect.arrayContaining(['codex', 'codex:cx-3']));
    expect(row.engine).toBe('codex');
    expect(rowForSession(w.store.listItems(), codex(w.folder))?.id).toBe(row.id);
  });
  it('twice files it once', async () => {
    const w = await world();
    w.store.importThreadRows(w.slug, [chatFromSession(claude(w.folder))!], { land: 'inbox' });
    expect(w.store.importThreadRows(w.slug, [chatFromSession(claude(w.folder))!], { land: 'inbox' }).added).toBe(0);
    w.store.importCodexThreads(w.slug, [chatFromSession(codex(w.folder))!], { land: 'inbox' });
    expect(w.store.importCodexThreads(w.slug, [chatFromSession(codex(w.folder))!], { land: 'inbox' }).added).toBe(0);
  });
  it('a Claude Code session is never taken for a Codex one with the same id, nor the other way', async () => {
    const w = await world();
    w.store.importThreadRows(w.slug, [chatFromSession(claude(w.folder, { sessionId: 'same' }))!], { land: 'inbox' });
    expect(rowForSession(w.store.listItems(), codex(w.folder, { sessionId: 'same' }))).toBeNull();
  });
});

describe('the app around it', () => {
  const read = (p: string) => fs.readFileSync(path.join(import.meta.dirname, '..', p), 'utf8');
  it('takes the session\'s own row out of the inbox the way Done does', () => {
    const ipc = read('main/ipc.mts');
    const handler = ipc.slice(ipc.indexOf("'zero:bring-in-session'"), ipc.indexOf("'zero:agent-reveal'"));
    expect(handler).toContain('agentSchedule.close(agentKey(agent), agent.lastActiveAt || Date.now())');
    expect(handler).toMatch(/importCodexThreads\(product, \[chat\], \{ land: 'inbox' \}\)/);
    expect(handler).toMatch(/importThreadRows\(product, \[chat\], \{ land: 'inbox' \}\)/);
  });
  it('offers it only on a session with a project to go to and an id to file it under', () => {
    expect(read('renderer/src/components/Focus.tsx')).toContain('onBringIn={agent?.product && agent.sessionId && onBringIn ? onBringIn : null}');
  });
});
