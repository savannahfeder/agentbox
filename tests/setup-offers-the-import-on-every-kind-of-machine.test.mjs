// SETUP OFFERS THE IMPORT ON EVERY KIND OF MACHINE.
//
// Asked 2026-10-11 (w-e46f2e9cea): "Can you also confirm this works 100% of the
// time during onboarding? That's the critical location."
//
// Setup's last card is drawn only when `finishCard` (renderer/src/onboarding.ts)
// is handed at least one session that is not already in the inbox; otherwise
// the walk skips it and the person never learns importing exists. Those
// sessions come from `zero:agent-threads`, which is `readImportableThreads`
// (main/importable-threads.mjs) plus `markImported`. This file runs that exact
// chain, start to finish, on one made-up machine per way people actually run
// their agents, as a brand new user has it: no agent files, nothing imported.
//
// What it does NOT cover, written down so nobody reads this as 100%:
//   - a machine whose newest session is older than ninety days;
//   - a CLAUDE_CONFIG_DIR set somewhere neither the app nor the login shell
//     sees (a per-project direnv file, a wrapper script);
//   - sessions run through other tools built on Claude's SDK (Conductor, Zed),
//     which look the same as the app's own workers.
// The first version of this file also pinned "older than ten days" and "a
// CLAUDE_CONFIG_DIR only the shell knows" as gaps; both are closed below.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readImportableThreads } from '../main/importable-threads.mjs';
import { markImported } from '../shared/agent-import.mjs';

const NOW = Date.UTC(2026, 9, 11, 18, 0, 0);
const DAY = 86400000;
let home;
let away;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-home-'));
  away = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-away-'));
});
afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(away, { recursive: true, force: true });
});

function claudeSession(dataDir, { id = 'c1', entrypoint = 'cli', when = NOW - 60_000, said = 'fix the checkout button' } = {}) {
  const cwd = `${home}/code/shop`;
  const dir = path.join(dataDir, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.jsonl`);
  fs.writeFileSync(file, `${JSON.stringify({ type: 'user', sessionId: id, entrypoint, cwd, message: { role: 'user', content: said } })}\n`);
  fs.utimesSync(file, new Date(when), new Date(when));
}

function codexSession(codexDir, { id = 'x1', originator = 'codex_cli_rs', when = NOW - 60_000 } = {}) {
  const d = new Date(when);
  const day = path.join(codexDir, 'sessions', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
  fs.mkdirSync(day, { recursive: true });
  const file = path.join(day, `rollout-${id}.jsonl`);
  const iso = d.toISOString();
  fs.writeFileSync(file, [
    JSON.stringify({ timestamp: iso, type: 'session_meta', payload: { id, timestamp: iso, cwd: `${home}/code/shop`, originator, source: 'cli' } }),
    JSON.stringify({ timestamp: iso, type: 'event_msg', payload: { type: 'user_message', message: 'make the tests faster' } }),
  ].join('\n') + '\n');
  fs.utimesSync(file, d, d);
}

/** What setup's last card decides, given the app as a brand new user has it. */
async function setupCard({ env = {}, shellEnv = {}, config = {}, supervisor = { _codexProfiles: () => ['default'], _codexProfileHome: () => path.join(home, '.codex') } } = {}) {
  const { finishCard } = await import('../renderer/src/onboarding.ts');
  const threads = markImported(await readImportableThreads({ config, supervisor, env, shellEnv, home, now: NOW }), []);
  return { threads, card: finishCard({ missing: false }, { read: true, some: false }, threads) };
}

const shown = (card) => card.show === true && !card.skip;

describe('setup shows the import card', () => {
  it('for someone who runs Claude Code in a terminal', async () => {
    claudeSession(path.join(home, '.claude'));
    expect(shown((await setupCard()).card)).toBe(true);
  });

  it('for someone who runs Claude Code in VS Code, Cursor or Windsurf', async () => {
    claudeSession(path.join(home, '.claude'), { entrypoint: 'claude-vscode' });
    const { card, threads } = await setupCard();
    expect(shown(card)).toBe(true);
    expect(threads[0].source).toBe('editor');
  });

  it('for someone who uses the Claude desktop app', async () => {
    claudeSession(path.join(home, '.claude'), { entrypoint: 'claude-desktop' });
    expect(shown((await setupCard()).card)).toBe(true);
  });

  it('for someone whose Claude Code keeps its data in a second folder like ~/.claude-work', async () => {
    claudeSession(path.join(home, '.claude-work'));
    expect(shown((await setupCard()).card)).toBe(true);
  });

  it('for someone whose CLAUDE_CONFIG_DIR is elsewhere, when the app can see the variable', async () => {
    claudeSession(path.join(away, 'claude'));
    expect(shown((await setupCard({ env: { CLAUDE_CONFIG_DIR: path.join(away, 'claude') } })).card)).toBe(true);
  });

  it('for someone whose Claude profile was configured in the app', async () => {
    claudeSession(path.join(away, 'claude'));
    expect(shown((await setupCard({ config: { authProfiles: [path.join(away, 'claude')] } })).card)).toBe(true);
  });

  it('for someone who only uses Codex', async () => {
    codexSession(path.join(home, '.codex'));
    expect(shown((await setupCard()).card)).toBe(true);
  });

  it('for someone whose Codex keeps its data in a second folder like ~/.codex-work', async () => {
    codexSession(path.join(home, '.codex-work'));
    expect(shown((await setupCard()).card)).toBe(true);
  });

  it('for someone whose CODEX_HOME is elsewhere, when the app can see the variable', async () => {
    codexSession(path.join(away, 'codex'));
    expect(shown((await setupCard({ env: { CODEX_HOME: path.join(away, 'codex') } })).card)).toBe(true);
  });

  it('even when the app\'s settings or supervisor are odd', async () => {
    claudeSession(path.join(home, '.claude'));
    codexSession(path.join(home, '.codex'));
    for (const [config, supervisor] of [[null, null], [{}, {}], [{ authProfiles: 'x' }, { _codexProfiles: () => { throw new Error('no'); } }]]) {
      const { card, threads } = await setupCard({ config, supervisor });
      expect(shown(card)).toBe(true);
      expect(threads.map((t) => t.id).sort()).toEqual(['c1', 'x1']);
    }
  });

  it('when a person\'s session sits among the app\'s own practice run', async () => {
    claudeSession(path.join(home, '.claude'), { id: 'practice', entrypoint: 'sdk-cli', when: NOW - 1000 });
    claudeSession(path.join(home, '.claude'), { id: 'mine', when: NOW - 5 * DAY });
    const { card, threads } = await setupCard();
    expect(shown(card)).toBe(true);
    expect(threads.map((t) => t.id)).toEqual(['mine']);
  });
});

describe('setup goes straight on, and the card stays off', () => {
  it('on a machine with no sessions at all', async () => {
    expect((await setupCard()).card.skip).toBe(true);
  });

  it('when the only sessions are the app\'s own runs', async () => {
    claudeSession(path.join(home, '.claude'), { entrypoint: 'sdk-cli' });
    codexSession(path.join(home, '.codex'), { originator: 'agentbox' });
    expect((await setupCard()).card.skip).toBe(true);
  });

  it('when the only session is older than ninety days', async () => {
    claudeSession(path.join(home, '.claude'), { when: NOW - 91 * DAY });
    expect((await setupCard()).card.skip).toBe(true);
  });

  it('when CLAUDE_CONFIG_DIR points elsewhere and neither the app nor the login shell names it', async () => {
    claudeSession(path.join(away, 'claude'));
    expect((await setupCard({ env: {}, shellEnv: {} })).card.skip).toBe(true);
  });
});

// THE TWO GAPS THIS FILE FIRST PINNED, CLOSED on the founder's pick
// (2026-10-11): main/importable-threads.mjs and main/shell-path.mjs.
describe('setup also shows the import card', () => {
  it('when the newest session is eleven days old', async () => {
    claudeSession(path.join(home, '.claude'), { when: NOW - 11 * DAY });
    expect(shown((await setupCard()).card)).toBe(true);
  });

  it('when CLAUDE_CONFIG_DIR points outside ~/.claude-<name> and only the login shell knows it', async () => {
    claudeSession(path.join(away, 'claude'));
    expect(shown((await setupCard({ env: {}, shellEnv: { CLAUDE_CONFIG_DIR: path.join(away, 'claude') } })).card)).toBe(true);
  });
});
