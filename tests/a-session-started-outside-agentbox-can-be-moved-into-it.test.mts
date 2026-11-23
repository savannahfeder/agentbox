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
import { chatFromSession, movedLabel, movedSessions, rowForSession } from '../shared/bring-in.mts';

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
  // A power tester answered Codex's question in the terminal, moved the session,
  // and the write-up asked the question again: it had read only the first
  // message and the last answer.
  it('carries every message the person typed, so what they already answered is not asked again', () => {
    const asked = [{ at: 1, text: 'write the waitlist headline' }, { at: 2, text: 'clinic operations teams' }];
    expect(chatFromSession(codex('/x', { asked }))?.prompt).toBe('write the waitlist headline\n\nclinic operations teams');
    expect(chatFromSession(claude('/x', { asked, about: '' }))?.title).toBe('write the waitlist headline');
  });
  it('and when they typed a lot, the first and the newest of it', () => {
    const asked = [{ at: 1, text: 'build the waitlist page' }, ...Array.from({ length: 30 }, (_, i) => ({ at: i + 2, text: `change number ${i + 1} to the copy, said at some length so it fills the room` })), { at: 99, text: 'ship it' }];
    const prompt = chatFromSession(codex('/x', { asked }))!.prompt;
    expect(prompt.startsWith('build the waitlist page\n\n…\n\n')).toBe(true);
    expect(prompt.endsWith('ship it')).toBe(true);
    expect(prompt.length).toBeLessThanOrEqual(1500);
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
  // A power tester moved a session again once its thread was closed and got
  // the old thread back without the question the session was now asking.
  it('moved again, its thread is brought up to where the session is now and opened', async () => {
    const w = await world();
    const [cx] = w.store.importCodexThreads(w.slug, [chatFromSession(codex(w.folder))!], { land: 'inbox' }).ids;
    w.store.answerItem(w.slug, cx, { status: 'done' });
    w.store.answerCodexImport(w.slug, cx, 'yes', { thread: chatFromSession(codex(w.folder, { approval: null, lastSaid: 'Should the page size be 20 or 50?' }))! });
    const row = w.store.listItems().find((i) => i.id === cx)!;
    expect(row.status).toBe('open');
    expect(row.result).toContain('Should the page size be 20 or 50?');
    const [cl] = w.store.importThreadRows(w.slug, [chatFromSession(claude(w.folder))!], { land: 'inbox' }).ids;
    w.store.answerItem(w.slug, cl, { status: 'done' });
    w.store.recordSessionResult(w.slug, cl, { result: 'Fixed. Want me to add an index too?', status: null });
    w.store.answerItem(w.slug, cl, { status: 'open' });
    expect(w.store.listItems().find((i) => i.id === cl)).toMatchObject({ status: 'open', result: 'Fixed. Want me to add an index too?' });
  });
  // Two power testers moved a session mid-task and its thread opened on the
  // answer to the message before, as if that answered the newest one.
  it('a session still working when it moved says so, after any earlier answer', () => {
    expect(chatFromSession(codex('/x', { status: 'busy', approval: null, lastSaid: '' }))?.last).toBe('It was still working on your newest message in its terminal when it moved here.');
    expect(chatFromSession(codex('/x', { status: 'busy', approval: null, lastSaid: 'The bundle is 412 KB.' }))?.last).toBe('The bundle is 412 KB.\n\nIt was still working on your newest message in its terminal when it moved here.');
  });
  it('but a finished one, or one stopped on a prompt, does not', () => {
    expect(chatFromSession(codex('/x', { status: 'idle', approval: null, lastSaid: 'The bundle is 412 KB.' }))?.last).toBe('The bundle is 412 KB.');
    expect(chatFromSession(codex('/x', { status: 'busy' }))?.last).toBe('May I install it?\n\n`npm install date-fns`');
  });
  it('a Claude Code session is never taken for a Codex one with the same id, nor the other way', async () => {
    const w = await world();
    w.store.importThreadRows(w.slug, [chatFromSession(claude(w.folder, { sessionId: 'same' }))!], { land: 'inbox' });
    expect(rowForSession(w.store.listItems(), codex(w.folder, { sessionId: 'same' }))).toBeNull();
  });
});

// Two power testers (2026-11-23): Back after a move reopened the session's old
// page with Move to Agentbox on it, and typing in its terminal afterwards put
// the session back in the inbox beside the thread it had become.
describe('a moved session is in one place', () => {
  const rows = [
    { id: 'w-1', status: 'open', labels: ['thread-import', 'thread:cl-1'] },
    { id: 'w-2', status: 'open', labels: ['codex', 'codex:cx-3'] },
    { id: 'w-3', status: 'done', labels: ['codex', 'codex:cx-old'] },
  ];
  it('its thread here stands for it while that is open', () => {
    const moved = movedSessions(rows);
    expect(moved.has(movedLabel(claude('/x')))).toBe(true);
    expect(moved.has(movedLabel(codex('/x')))).toBe(true);
  });
  it('and once that thread is done the session can be a row again', () => {
    expect(movedSessions(rows).has(movedLabel(codex('/x', { sessionId: 'cx-old' })))).toBe(false);
  });
  it('a session nobody moved is not hidden', () => {
    expect(movedSessions(rows).has(movedLabel(codex('/x', { sessionId: 'cx-new' })))).toBe(false);
    expect(movedSessions(rows).has(movedLabel(claude('/x', { sessionId: 'cx-3' })))).toBe(false);
  });
  it('the rows every list and Back are drawn from leave it out', () => {
    const app = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/App.tsx'), 'utf8');
    expect(app).toContain('const live = (snap?.agents ?? []).filter((a) => agentIsListed(a) && !movedHere.has(movedLabel(a)));');
    expect(app).toContain('() => [...items, ...agentRows, ...(troubleItem ? [troubleItem] : [])]');
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
    expect(handler).toContain("store.answerCodexImport(product, had.id, 'yes', { thread: chat })");
    expect(handler).toContain("store.recordSessionResult(product, had.id, { result: chat.lastSaid, status: null })");
    expect(handler).toContain("if (had.status === 'done') store.answerItem(product, had.id, { status: 'open' })");
  });
  // A moved Codex thread follows Codex's newest answer through the Codex watch.
  // The browser copy never started it, so a power tester's moved thread kept
  // asking whether to start a memo its terminal had finished.
  it('the browser copy keeps moved Codex threads in step, as the desktop does', () => {
    expect(read('bin/agentbox.mjs')).toMatch(/codexWatch = startCodexWatch\(\{/);
    expect(read('main/main.mts')).toMatch(/const codexWatch = startCodexWatch\(\{/);
  });
  it('offers it only on a session with a project to go to and an id to file it under', () => {
    expect(read('renderer/src/components/Focus.tsx')).toContain('onBringIn={agent?.product && agent.sessionId && onBringIn ? onBringIn : null}');
  });
});
