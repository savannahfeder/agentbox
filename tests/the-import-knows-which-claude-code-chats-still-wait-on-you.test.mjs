// THE IMPORT KNOWS WHICH CLAUDE CODE CHATS STILL WAIT ON YOU, AND WHAT THEY ARE
// CALLED.
//
// Setup's last screen (w-62228098e6, R1) lists only the chats you were in the
// middle of, by their own titles, each with the question it ended on. The
// reader behind the card read only a transcript's head, so every chat was
// named after the first thing typed into it ("this is a test") and nothing
// said whether it had finished. Claude Code writes its own title for a chat as
// an `ai-title` line and the agent's last reply is at the end of the file, so
// the reader now reads the end as well.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSessionThreads } from '../main/agent-sessions.mjs';

let home;
const NOW = Date.now();
const at = (minsAgo) => new Date(NOW - minsAgo * 60e3).toISOString();

const typed = (text, minsAgo, extra = {}) => ({
  type: 'user', cwd: path.join(home, 'work', 'app'), entrypoint: 'cli', timestamp: at(minsAgo),
  message: { role: 'user', content: [{ type: 'text', text }] }, ...extra,
});
const said = (text, minsAgo) => ({
  type: 'assistant', cwd: path.join(home, 'work', 'app'), entrypoint: 'cli', timestamp: at(minsAgo),
  message: { role: 'assistant', content: [{ type: 'text', text }] },
});
const tool = (minsAgo) => ({
  type: 'user', cwd: path.join(home, 'work', 'app'), entrypoint: 'cli', timestamp: at(minsAgo), toolUseResult: { stdout: 'ok' },
  message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] },
});

function chat(id, rows) {
  const dir = path.join(home, '.claude', 'projects', '-work-app');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.jsonl`), `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
}

const read = () => Object.fromEntries(readSessionThreads({ home, dirs: [path.join(home, '.claude')], now: NOW }).threads.map((t) => [t.id, t]));

beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'chats-')); });
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

describe('which Claude Code chats still wait on you', () => {
  it('names a chat with its own title and says the question it ended on', () => {
    chat('asks', [
      typed('the upload test fails about one run in five on CI, find out why and fix it', 60),
      { type: 'ai-title', aiTitle: 'Fix flaky upload test' },
      said('Looking at the test now.', 58),
      tool(57),
      said('Found it. The timer fires late on CI.', 50),
      { type: 'ai-title', aiTitle: 'Fix the flaky upload test on CI' },
      said('Two ways to fix it.\n\n1. Mock the clock\n2. Retry once\n\nMocking the clock is the real fix. Which one?', 49),
    ]);
    const t = read().asks;
    expect(t.title).toBe('Fix the flaky upload test on CI');
    expect(t.waiting).toBe(true);
    expect(t.ask).toBe('Mocking the clock is the real fix. Which one?');
    expect(t.lastSaid).toContain('Two ways to fix it.');
    expect(t.firstSaid).toBe('the upload test fails about one run in five on CI, find out why and fix it');
    expect(t.startedAt).toBe(Date.parse(at(60)));
  });

  it('is finished when the last reply is a statement', () => {
    chat('done', [typed('rename the billing page', 30), said('Renamed it and updated the links. Tests pass.', 25)]);
    expect(read().done).toMatchObject({ waiting: false, ask: '' });
  });

  it('is not waiting once you have answered the question', () => {
    chat('answered', [
      typed('fix the import', 30), said('Skip old rides, or estimate them?', 25), typed('skip them', 20),
    ]);
    expect(read().answered.waiting).toBe(false);
  });

  it('still waits when only a closing command came after the question', () => {
    chat('exited', [
      typed('check the webhook', 30), said('The check is written. Can I run the migration on staging?', 25),
      typed('<command-name>/exit</command-name>', 24), typed('<local-command-stdout>Bye!</local-command-stdout>', 24),
    ]);
    expect(read().exited).toMatchObject({ waiting: true, ask: 'The check is written. Can I run the migration on staging?' });
  });

  it('keeps the first thing typed as the name when Claude Code wrote no title', () => {
    chat('untitled', [typed('make the export faster', 30), said('Done.', 25)]);
    expect(read().untitled.title).toBe('make the export faster');
  });

  it('reads the end of a transcript too long to read whole', () => {
    const padding = Array.from({ length: 400 }, (_, i) => said(`step ${i} ${'x'.repeat(1200)}`, 59));
    chat('long', [typed('migrate the database', 60), ...padding, said('Migrated. Shall I drop the old table?', 1)]);
    expect(read().long).toMatchObject({ waiting: true, ask: 'Migrated. Shall I drop the old table?' });
  });
});
