// THE WATCH FOR NEW CHATS READS ONLY YOUR PROJECTS' FOLDERS.
//
// The watch that brings new chats in (main/new-chats-watch.mjs, w-62228098e6)
// first used the import card's reader, which walks every transcript Claude Code
// has and opens the newest until a three second budget runs out. On a computer
// that runs Agentbox, most of those are Agentbox's own runs, so every pass
// could spend the whole budget on the main process. Claude Code files a chat
// under its folder's name with every other character turned into `-`, so the
// watch reads only the folders the projects point at, only what changed since
// the switch went on, and each file once until it changes.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readProjectChats } from '../main/agent-sessions.mjs';

let home;
let claudeDir;
const NOW = Date.now();
const SINCE = NOW - 3600e3;
const iso = (t) => new Date(t).toISOString();

function chat(folder, id, { entrypoint = 'cli', at = NOW - 60e3, last = 'Done. Tests pass.' } = {}) {
  const dir = path.join(claudeDir, 'projects', folder.replace(/[^a-zA-Z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.jsonl`);
  const rows = [
    { type: 'user', cwd: folder, entrypoint, timestamp: iso(at - 60e3), message: { role: 'user', content: [{ type: 'text', text: `please ${id}` }] } },
    { type: 'assistant', cwd: folder, entrypoint, timestamp: iso(at), message: { role: 'assistant', content: [{ type: 'text', text: last }] } },
  ];
  fs.writeFileSync(file, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
  fs.utimesSync(file, new Date(at), new Date(at));
  return file;
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'project-chats-'));
  claudeDir = path.join(home, '.claude');
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(home, { recursive: true, force: true }); });

describe('the chats the watch reads', () => {
  it('are the ones a person started in a project folder since the switch went on', () => {
    const kestrel = path.join(home, 'dev', 'kestrel');
    chat(kestrel, 'mine', { last: 'Shall I ship it?' });
    chat(kestrel, 'before', { at: SINCE - 60e3 });
    chat(kestrel, 'worker', { entrypoint: 'sdk-cli' });
    chat(path.join(kestrel, '.claude', 'worktrees', 'w-1'), 'inworktree');
    chat(path.join(home, 'dev', 'elsewhere'), 'elsewhere');
    const got = readProjectChats({ home, dirs: [claudeDir], folders: [kestrel], since: SINCE, now: NOW });
    expect(got.map((t) => t.id)).toEqual(['mine']);
    expect(got[0]).toMatchObject({ folder: kestrel, waiting: true, ask: 'Shall I ship it?', firstSaid: 'please mine' });
  });

  it('opens a file once until it changes', () => {
    const kestrel = path.join(home, 'dev', 'kestrel');
    const file = chat(kestrel, 'once');
    const opened = vi.spyOn(fs, 'openSync');
    readProjectChats({ home, dirs: [claudeDir], folders: [kestrel], since: SINCE, now: NOW });
    const first = opened.mock.calls.filter(([p]) => p === file).length;
    readProjectChats({ home, dirs: [claudeDir], folders: [kestrel], since: SINCE, now: NOW });
    expect(opened.mock.calls.filter(([p]) => p === file).length).toBe(first);
    fs.appendFileSync(file, `${JSON.stringify({ type: 'assistant', cwd: kestrel, entrypoint: 'cli', timestamp: iso(NOW), message: { role: 'assistant', content: [{ type: 'text', text: 'One more thing?' }] } })}\n`);
    const again = readProjectChats({ home, dirs: [claudeDir], folders: [kestrel], since: SINCE, now: NOW });
    expect(opened.mock.calls.filter(([p]) => p === file).length).toBeGreaterThan(first);
    expect(again[0].waiting).toBe(true);
  });
});
