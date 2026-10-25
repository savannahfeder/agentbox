// THE IMPORT KNOWS WHICH CODEX CHATS STILL WAIT ON YOU.
//
// The same question as the Claude Code side (w-62228098e6, R1): setup lists
// only the chats you were in the middle of. The Codex reader already kept the
// last thing Codex said, but not whether you had answered it since, so a chat
// you replied to read as still asking.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readCodexThreads } from '../main/codex-threads.mjs';

let home;
let codexDir;
const NOW = Date.now();
const iso = (minsAgo) => new Date(NOW - minsAgo * 60e3).toISOString();

function rollout(id, turns) {
  const d = new Date(NOW - 60 * 60e3);
  const parts = [String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')];
  const dir = path.join(codexDir, 'sessions', ...parts);
  fs.mkdirSync(dir, { recursive: true });
  const lines = [
    { type: 'session_meta', timestamp: iso(60), payload: { id, cwd: path.join(home, 'work', 'app'), timestamp: iso(60), thread_source: 'user' } },
    ...turns.map(([who, text], i) => ({
      type: 'event_msg', timestamp: iso(50 - i),
      payload: { type: who === 'you' ? 'user_message' : 'agent_message', message: text },
    })),
  ];
  fs.writeFileSync(path.join(dir, `rollout-${parts.join('-')}T10-00-00-${id}.jsonl`), `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
}

const read = () => Object.fromEntries(readCodexThreads({ home, codexDirs: [codexDir], now: NOW }).threads.map((t) => [t.id, t]));

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-chats-'));
  codexDir = path.join(home, '.codex');
});
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

describe('which Codex chats still wait on you', () => {
  it('is waiting when Codex ended on a question, and keeps the question and the first prompt', () => {
    rollout('asks', [['you', 'import workouts from strava'], ['codex', 'Read the export.'], ['codex', 'Older rides have no heart rate. Skip them, or estimate it?']]);
    expect(read().asks).toMatchObject({
      waiting: true,
      ask: 'Older rides have no heart rate. Skip them, or estimate it?',
      firstSaid: 'import workouts from strava',
      lastSaid: 'Older rides have no heart rate. Skip them, or estimate it?',
    });
  });

  it('is finished when Codex ended on a statement', () => {
    rollout('done', [['you', 'bump react'], ['codex', 'Bumped to 19 and the tests pass.']]);
    expect(read().done).toMatchObject({ waiting: false, ask: '' });
  });

  it('is not waiting once you answered after its question', () => {
    rollout('answered', [['you', 'import workouts'], ['codex', 'Skip them, or estimate it?'], ['you', 'skip them']]);
    expect(read().answered.waiting).toBe(false);
  });
});
