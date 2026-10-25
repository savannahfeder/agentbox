// AN IMPORTED CHAT READS LIKE THE CHAT, AND LANDS WHERE IT BELONGS.
//
// Setup's last screen (w-62228098e6, R1) says the chats that were waiting on
// you "carry on here" and that the finished ones "go to Done". Two things in
// the store stood in the way, measured before this change:
//
//   - an imported Claude Code row opened on a note of ours, "Say what you want
//     done next in this thread", and nowhere showed the question the chat had
//     ended on, which is the reason it was picked;
//   - every imported row, Claude Code or Codex, landed open in Needs you, so
//     bringing in a week of finished chats filled the inbox with them.
//
// Now a Claude Code row reads the way a Codex row already did: your first
// message under You and the agent's last reply under the agent. Brought in
// from setup or by the watch for new chats (`land: 'sorted'`), a finished chat
// goes straight to Done. Picked by hand from the ⌘K card it still lands open,
// because you picked it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { THREAD_LABEL } from '../shared/agent-import.mjs';

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);

async function store() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-imports-'));
  const accountRoot = path.join(root, 'accounts', 'test-account');
  fs.mkdirSync(accountRoot, { recursive: true });
  const s = await new Store({ storeRoot: root, accountId: 'test-account', accountRoot, products: [] }).init();
  const { slug } = s.createProduct({ name: 'Kestrel', repoPath: path.join(root, 'kestrel') });
  return { s, slug, folder: path.join(root, 'kestrel') };
}

const claude = (id, folder, { waiting, lastSaid }) => ({
  id, source: 'terminal', folder, folderName: 'kestrel', short: '~/kestrel', path: `/x/${id}.jsonl`,
  title: `Chat ${id}`, when: NOW - 3600e3, startedAt: NOW - 7200e3,
  firstSaid: `please do ${id}`, lastSaid, waiting, ask: waiting ? lastSaid : '',
});
const codex = (id, folder, { waiting, lastSaid }) => ({
  id, source: 'codex', folder, folderName: 'kestrel', short: '~/kestrel', path: `/x/rollout-${id}.jsonl`,
  title: `Codex ${id}`, when: NOW - 3600e3, startedAt: NOW - 7200e3,
  prompt: `codex please ${id}`, last: lastSaid, firstSaid: `codex please ${id}`, lastSaid, waiting, ask: waiting ? lastSaid : '',
});

const rowFor = (s, slug, label) => s.listItems().find((i) => i.product === slug && (i.labels ?? []).includes(label));

describe('an imported Claude Code chat', () => {
  it('opens on your first message and the agent\'s last reply, not a note of ours', async () => {
    const { s, slug, folder } = await store();
    s.importThreadRows(slug, [claude('a', folder, { waiting: true, lastSaid: 'Mock the clock, or retry once. Which one?' })], { now: NOW });
    const row = rowFor(s, slug, 'thread:a');
    expect(row.title).toBe('Chat a');
    expect(row.body).toBe('please do a');
    expect(row.wrote.body.source).toBe('founder');
    expect(row.result).toBe('Mock the clock, or retry once. Which one?');
    expect(row.wrote.result.source).toBe('agent');
    expect(row.body).not.toContain('Say what you want done next');
    expect(row.labels).toContain(THREAD_LABEL);
  });

  it('falls back to its title when the first message could not be read', async () => {
    const { s, slug, folder } = await store();
    s.importThreadRows(slug, [{ ...claude('b', folder, { waiting: false, lastSaid: '' }), firstSaid: '' }], { now: NOW });
    const row = rowFor(s, slug, 'thread:b');
    expect(row.body).toBe('Chat b');
    expect(row.result ?? '').toBe('');
  });
});

describe('where an imported chat lands', () => {
  it('sends a finished chat to Done and keeps a waiting one in Needs you, when sorted', async () => {
    const { s, slug, folder } = await store();
    s.importThreadRows(slug, [
      claude('w', folder, { waiting: true, lastSaid: 'Shall I ship it?' }),
      claude('f', folder, { waiting: false, lastSaid: 'Shipped. Tests pass.' }),
    ], { now: NOW, land: 'sorted' });
    s.importCodexThreads(slug, [
      codex('cw', folder, { waiting: true, lastSaid: 'Skip them, or estimate it?' }),
      codex('cf', folder, { waiting: false, lastSaid: 'Bumped and tested.' }),
    ], { now: NOW, land: 'sorted' });
    expect(rowFor(s, slug, 'thread:w').status).toBe('open');
    expect(rowFor(s, slug, 'thread:f').status).toBe('done');
    expect(rowFor(s, slug, 'codex:cw').status).toBe('open');
    expect(rowFor(s, slug, 'codex:cf').status).toBe('done');
  });

  it('keeps a hand-picked finished chat open, because you picked it', async () => {
    const { s, slug, folder } = await store();
    s.importThreadRows(slug, [claude('p', folder, { waiting: false, lastSaid: 'Done.' })], { now: NOW });
    s.importCodexThreads(slug, [codex('cp', folder, { waiting: false, lastSaid: 'Done.' })], { now: NOW });
    expect(rowFor(s, slug, 'thread:p').status).toBe('open');
    expect(rowFor(s, slug, 'codex:cp').status).toBe('open');
  });

  it('files a chat once, however many times it is brought in', async () => {
    const { s, slug, folder } = await store();
    const t = [claude('once', folder, { waiting: false, lastSaid: 'Done.' })];
    expect(s.importThreadRows(slug, t, { now: NOW, land: 'sorted' }).added).toBe(1);
    expect(s.importThreadRows(slug, t, { now: NOW + 60e3, land: 'sorted' }).added).toBe(0);
    expect(s.listItems().filter((i) => (i.labels ?? []).includes('thread:once'))).toHaveLength(1);
  });
});
