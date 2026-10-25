// THE IMPORT FINDS OLDER SESSIONS, AND THE FOLDERS ONLY THE SHELL KNOWS.
//
// The two gaps left open on 2026-10-11 (w-e46f2e9cea), closed on the founder's
// pick: "close both gaps: fall back to older sessions when nothing is recent,
// and ask the login shell for CLAUDE_CONFIG_DIR".
//
// 1. Setup's last card offered the last ten days and nothing else, so somebody
//    whose newest session was eleven days old got no card at all and was never
//    told importing exists. Now, only when the ten days hold nothing, it offers
//    the twenty newest sessions from the last ninety, and says so.
// 2. An app opened from the Dock never sees what a shell profile exports, so a
//    CLAUDE_CONFIG_DIR (or CODEX_HOME) somewhere other than ~/.claude-<name>
//    was invisible. The login shell is asked for those two variables, once, at
//    startup, the way main/shell-path.mjs already asks it for PATH. They are
//    used to FIND sessions and never written into the app's environment,
//    because CLAUDE_CONFIG_DIR there would change which account workers run on.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readShellDataDirs } from '../main/shell-path.mjs';
import { readImportableThreads } from '../main/importable-threads.mjs';
import { markImported } from '../shared/agent-import.mjs';

const NOW = Date.UTC(2026, 9, 11, 18, 0, 0);
const DAY = 86400000;
let home;
let away;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'older-home-'));
  away = fs.mkdtempSync(path.join(os.tmpdir(), 'older-away-'));
});
afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(away, { recursive: true, force: true });
});

function claudeSession(dataDir, { id, entrypoint = 'cli', when }) {
  const cwd = `${home}/code/shop`;
  const dir = path.join(dataDir, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.jsonl`);
  fs.writeFileSync(file, `${JSON.stringify({ type: 'user', sessionId: id, entrypoint, cwd, message: { role: 'user', content: `job ${id}` } })}\n`);
  fs.utimesSync(file, new Date(when), new Date(when));
}

function codexSession(codexDir, { id, when }) {
  const d = new Date(when);
  const day = path.join(codexDir, 'sessions', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
  fs.mkdirSync(day, { recursive: true });
  const file = path.join(day, `rollout-${id}.jsonl`);
  const iso = d.toISOString();
  fs.writeFileSync(file, [
    JSON.stringify({ timestamp: iso, type: 'session_meta', payload: { id, timestamp: iso, cwd: `${home}/code/shop`, originator: 'codex_cli_rs', source: 'cli' } }),
    JSON.stringify({ timestamp: iso, type: 'event_msg', payload: { type: 'user_message', message: `job ${id}` } }),
  ].join('\n') + '\n');
  fs.utimesSync(file, d, d);
}

const read = (opts = {}) => readImportableThreads({ config: {}, supervisor: null, env: {}, shellEnv: {}, home, now: NOW, ...opts });

async function setupCard(threads) {
  const { finishCard } = await import('../renderer/src/onboarding.ts');
  return finishCard({ missing: false }, { read: true, some: false }, markImported(threads, []));
}

describe('when nothing is from the last ten days', () => {
  it('offers the newest older sessions instead, and setup shows the card', async () => {
    claudeSession(path.join(home, '.claude'), { id: 'eleven', when: NOW - 11 * DAY });
    codexSession(path.join(home, '.codex'), { id: 'forty', when: NOW - 40 * DAY });
    const threads = await read();
    expect(threads.map((t) => t.id)).toEqual(['eleven', 'forty']);
    expect((await setupCard(threads)).show).toBe(true);
  });

  it('offers at most twenty, newest first', async () => {
    for (let i = 0; i < 25; i++) claudeSession(path.join(home, '.claude'), { id: `s${String(i).padStart(2, '0')}`, when: NOW - (11 + i) * DAY });
    const threads = await read();
    expect(threads).toHaveLength(20);
    expect(threads[0].id).toBe('s00');
    expect(threads[19].id).toBe('s19');
  });

  it('still goes no further back than ninety days', async () => {
    claudeSession(path.join(home, '.claude'), { id: 'ancient', when: NOW - 91 * DAY });
    expect(await read()).toEqual([]);
    expect((await setupCard([])).skip).toBe(true);
  });

  it('still refuses the app\'s own runs among the older sessions', async () => {
    claudeSession(path.join(home, '.claude'), { id: 'ours', entrypoint: 'sdk-cli', when: NOW - 12 * DAY });
    expect(await read()).toEqual([]);
  });
});

describe('when something is from the last ten days', () => {
  it('offers only those, exactly as before, and leaves the older ones out', async () => {
    claudeSession(path.join(home, '.claude'), { id: 'today', when: NOW - 60_000 });
    claudeSession(path.join(home, '.claude'), { id: 'old', when: NOW - 20 * DAY });
    expect((await read()).map((t) => t.id)).toEqual(['today']);
  });
});

describe('the card says which list it is', () => {
  it('says "From the last 10 days" when they are recent, and something true when they are not', async () => {
    const { listLine } = await import('../renderer/src/agent-import-card.ts');
    expect(listLine([{ when: NOW - DAY }], NOW)).toBe('From the last 10 days. Untick any you want to leave out.');
    expect(listLine([{ when: NOW - 11 * DAY }, { when: NOW - 30 * DAY }], NOW)).toBe('Nothing from the last 10 days, so here are your most recent. Untick any you want to leave out.');
    // Agent files carry no date; they do not make a list "older".
    expect(listLine([], NOW)).toBe('From the last 10 days. Untick any you want to leave out.');
  });
});

describe('the folders only the login shell knows', () => {
  // A real zsh, which GitHub's Linux runner does not have: it read nothing
  // there and was red on every push from 2026-10-09 to 2026-10-13. The macOS
  // run still runs it.
  it.skipIf(!fs.existsSync('/bin/zsh'))('reads CLAUDE_CONFIG_DIR and CODEX_HOME out of a real zsh profile, ignoring what the profile prints', async () => {
    fs.writeFileSync(path.join(home, '.zshrc'), [
      'echo hello from the profile',
      `export CLAUDE_CONFIG_DIR="${away}/claude-config"`,
      `export CODEX_HOME="${away}/codex-home"`,
      'export OPENAI_API_KEY=profile-secret',
    ].join('\n') + '\n');
    const env = { HOME: home, ZDOTDIR: home, SHELL: '/bin/zsh', PATH: '/usr/bin:/bin' };
    const got = await readShellDataDirs({ env, platform: 'darwin' });
    expect(got).toEqual({ CLAUDE_CONFIG_DIR: `${away}/claude-config`, CODEX_HOME: `${away}/codex-home` });
    expect(env).not.toHaveProperty('CLAUDE_CONFIG_DIR');
    expect(env).not.toHaveProperty('OPENAI_API_KEY');
  });

  it('turns a quoted ~ into the home folder, and drops anything that is not a folder path', async () => {
    const run = async () => '\0agentbox-dirs\0~/claude-x\0relative/codex\0';
    expect(await readShellDataDirs({ env: { HOME: '/Users/a', SHELL: '/bin/zsh' }, platform: 'darwin', run }))
      .toEqual({ CLAUDE_CONFIG_DIR: '/Users/a/claude-x' });
  });

  it.each([
    ['a shell that prints nothing useful', async () => 'welcome\n'],
    ['a shell that fails', async () => { throw new Error('no shell'); }],
    ['a value with a newline in it', async () => '\0agentbox-dirs\0/a\nb\0\0'],
  ])('answers nothing rather than guessing: %s', async (_name, run) => {
    expect(await readShellDataDirs({ env: { SHELL: '/bin/zsh' }, platform: 'darwin', run })).toEqual({});
  });

  it('asks on Linux too, where a launcher entry has no shell profile either', async () => {
    const run = async () => '\0agentbox-dirs\0/home/a/claude\0\0';
    expect(await readShellDataDirs({ env: { SHELL: '/bin/bash' }, platform: 'linux', run })).toEqual({ CLAUDE_CONFIG_DIR: '/home/a/claude' });
  });

  it('and the import reads sessions in the folder the shell named', async () => {
    claudeSession(path.join(away, 'claude-config'), { id: 'shell', when: NOW - 60_000 });
    expect((await read()).map((t) => t.id)).toEqual([]);
    expect((await read({ shellEnv: { CLAUDE_CONFIG_DIR: path.join(away, 'claude-config') } })).map((t) => t.id)).toEqual(['shell']);
  });

  it('and the same for Codex', async () => {
    codexSession(path.join(away, 'codex-home'), { id: 'cx', when: NOW - 60_000 });
    expect((await read({ shellEnv: { CODEX_HOME: path.join(away, 'codex-home') } })).map((t) => t.id)).toEqual(['cx']);
  });
});
