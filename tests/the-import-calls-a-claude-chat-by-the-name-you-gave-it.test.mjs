// THE IMPORT CALLS A CLAUDE CHAT BY THE NAME YOU GAVE IT.
//
// w-4b8af9d08f, 2026-10-26: "it's not showing me the actual names of the
// thread. It's showing me my prompts." The reader took Claude Code's own
// `ai-title` but not `custom-title`, the line `/rename` writes. Read off Claude
// Code 2.1.310: it writes `{type: "custom-title", customTitle}`, the last one
// wins, and its resume list shows it ahead of the ai title.

import { it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSessionThreads, readTranscriptTail } from '../main/agent-sessions.mjs';

const NOW = Date.UTC(2026, 9, 26, 12);
let home;
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'import-names-')); });
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

function chat(id, extra = []) {
  const cwd = `${home}/code/shop`;
  const file = path.join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'), `${id}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [
    { type: 'user', sessionId: id, entrypoint: 'cli', cwd, message: { role: 'user', content: 'can you look at why the settings dont click' } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Found it.' }] } },
    ...extra,
  ].map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.utimesSync(file, new Date(NOW - 1000), new Date(NOW - 1000));
  return file;
}
const titles = () => readSessionThreads({ home, dirs: [path.join(home, '.claude')], now: NOW }).threads.map((t) => t.title);

it('uses the name given with /rename', () => {
  chat('a', [{ type: 'custom-title', customTitle: 'Settings not clickable', sessionId: 'a' }]);
  expect(titles()).toEqual(['Settings not clickable']);
});

it('prefers that name to the one Claude Code made up, in either order', () => {
  chat('a', [
    { type: 'custom-title', customTitle: 'Settings not clickable', sessionId: 'a' },
    { type: 'ai-title', aiTitle: 'Debug settings click handler', sessionId: 'a' },
  ]);
  expect(titles()).toEqual(['Settings not clickable']);
});

it('takes the last name when it was renamed twice', () => {
  const file = chat('a', [
    { type: 'custom-title', customTitle: 'First name', sessionId: 'a' },
    { type: 'custom-title', customTitle: 'Second name', sessionId: 'a' },
  ]);
  expect(readTranscriptTail(file).customTitle).toBe('Second name');
  expect(titles()).toEqual(['Second name']);
});

it('falls back to the ai title, then to the prompt', () => {
  chat('a', [{ type: 'ai-title', aiTitle: 'Debug settings click handler', sessionId: 'a' }]);
  expect(titles()).toEqual(['Debug settings click handler']);
  fs.rmSync(path.join(home, '.claude'), { recursive: true });
  chat('b');
  expect(titles()).toEqual(['can you look at why the settings dont click']);
});

it('ignores an empty rename', () => {
  chat('a', [
    { type: 'ai-title', aiTitle: 'Debug settings click handler', sessionId: 'a' },
    { type: 'custom-title', customTitle: '', sessionId: 'a' },
  ]);
  expect(titles()).toEqual(['Debug settings click handler']);
});
