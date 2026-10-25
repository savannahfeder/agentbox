// A CHAT WHOSE END WAS NOT READ IS READ WHEN YOU BRING IT IN.
//
// The import list reads how each chat ended (its own title, the last answer,
// whether it waits on you) for the newest 120 chats and for two seconds at
// most, so the list still opens fast on a Mac with tens of thousands of
// chats. Past that, a chat came back as if it had ended on nothing: not
// waiting, no answer. Setup's last screen (w-62228098e6) then counted it as
// finished and sent it to Done with an empty answer, even when it was waiting
// on you. A chat found by the card's name search is read without its end at
// all, and came in the same way.
//
// So a chat whose end was not read says so, setup's screen neither offers it
// as waiting nor sends it to Done, and bringing one in reads its end first.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSessionThreads, readChatEnds } from '../main/agent-sessions.mjs';
import { pickupChats } from '../renderer/src/agent-import-card';

let home;
let folder;
let chats;
const NOW = Date.now();

function chat(id, minsAgo, { last = 'Done. Tests pass.', title = null } = {}) {
  const at = (m) => new Date(NOW - m * 60e3).toISOString();
  const file = path.join(chats, `${id}.jsonl`);
  fs.writeFileSync(file, `${[
    { type: 'user', cwd: folder, entrypoint: 'cli', timestamp: at(minsAgo + 1), message: { role: 'user', content: `do ${id}` } },
    ...(title ? [{ type: 'ai-title', aiTitle: title }] : []),
    { type: 'assistant', cwd: folder, entrypoint: 'cli', timestamp: at(minsAgo), message: { role: 'assistant', content: [{ type: 'text', text: last }] } },
  ].map((r) => JSON.stringify(r)).join('\n')}\n`);
  const t = new Date(NOW - minsAgo * 60e3);
  fs.utimesSync(file, t, t);
  return file;
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'ends-unread-'));
  folder = path.join(home, 'dev', 'kestrel');
  chats = path.join(home, '.claude', 'projects', folder.replace(/[^a-zA-Z0-9]/g, '-'));
  fs.mkdirSync(chats, { recursive: true });
});
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

describe('past the newest 120', () => {
  it('a chat whose end was not read says so, and setup sends it nowhere', () => {
    for (let i = 0; i < 125; i++) chat(`c${String(i).padStart(3, '0')}`, i + 1, { last: 'Shall I ship it?' });
    const { threads } = readSessionThreads({ home, now: NOW });
    const oldest = threads.find((t) => t.id === 'c124');
    const newest = threads.find((t) => t.id === 'c000');
    expect(newest).toMatchObject({ waiting: true });
    expect(newest.endUnknown).toBeFalsy();
    expect(oldest).toMatchObject({ endUnknown: true, waiting: false });
    const { waiting, finished } = pickupChats(threads, NOW);
    expect(waiting.some((t) => t.id === 'c124')).toBe(false);
    expect(finished.some((t) => t.id === 'c124')).toBe(false);
  });
});

describe('bringing a chat in', () => {
  it('reads the end of one the list left unread', () => {
    chat('late', 5, { last: 'Shall I ship it?', title: 'Ship the release' });
    const [t] = readChatEnds([{ id: 'late', source: 'terminal', path: path.join(chats, 'late.jsonl'), title: 'do late', endUnknown: true, waiting: false, lastSaid: '' }]);
    expect(t).toMatchObject({ title: 'Ship the release', waiting: true, lastSaid: 'Shall I ship it?' });
    expect(t.endUnknown).toBeFalsy();
  });

  it('reads the end of one found by name, which never had one read', () => {
    chat('found', 60 * 24 * 30, { last: 'Fixed and tested.', title: 'Fix the date picker' });
    const [t] = readChatEnds([{ id: 'found', source: 'terminal', path: path.join(chats, 'found.jsonl'), title: 'do found' }]);
    expect(t).toMatchObject({ title: 'Fix the date picker', waiting: false, lastSaid: 'Fixed and tested.' });
  });

  it('leaves alone one whose end the list already read, and every Codex chat', () => {
    const read = { id: 'x', source: 'terminal', path: '/nowhere/x.jsonl', title: 'Kept', waiting: true, lastSaid: 'Ok?' };
    const codex = { id: 'y', source: 'codex', path: '/nowhere/y.jsonl', title: 'Codex one' };
    expect(readChatEnds([read, codex])).toEqual([read, codex]);
  });
});
