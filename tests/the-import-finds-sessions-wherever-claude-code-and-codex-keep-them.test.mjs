// THE IMPORT FINDS SESSIONS WHEREVER CLAUDE CODE AND CODEX KEEP THEM.
//
// Reported 2026-10-11 (w-e46f2e9cea): most people never saw the import at all.
// The walk's last card only appears when the finder hands back something, so a
// finder that looks in the wrong place does not show an empty card, it shows no
// card, and the person never learns importing exists.
//
// Three places it was not looking, each measured on a real Mac that day:
//
//   1. A SESSION STARTED IN VS CODE, CURSOR OR WINDSURF. Claude Code's extension
//      marks its transcripts `entrypoint: "claude-vscode"` (read out of the
//      Claude Code 2.1.293 binary, which maps it to `claude_code_vscode`). The
//      finder kept only `cli` and `claude-desktop`, so everybody who runs Claude
//      Code in their editor had every session thrown away.
//   2. A SECOND CLAUDE FOLDER. Claude Code writes to `$CLAUDE_CONFIG_DIR/projects`
//      when that is set, and `~/.claude/projects` only when it is not. The finder
//      read `~/.claude` and nothing else. On the Mac this was measured on, every
//      Claude Code session of the person running it lives in `~/.claude-2`. And an
//      app opened from the Dock never sees a shell's CLAUDE_CONFIG_DIR, so reading
//      the variable alone would not have found it either: the folders have to be
//      looked for.
//   3. A SECOND CODEX FOLDER. Same shape: `CODEX_HOME`, or `~/.codex-<name>` for a
//      second login. The thread reader hard-coded `~/.codex`, while the rest of the
//      app already honoured both.
//
// And what must still NOT come in, because the filters exist for a reason: the
// app's own workers (`sdk-cli`), a session with an entrypoint nobody has seen,
// a folder that only looks like a Claude folder, and the same session found
// twice because a backup folder holds a copy of it.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSessionThreads, startedByHand } from '../main/agent-sessions.mjs';
import { readCodexThreads } from '../main/codex-threads.mjs';
import { claudeDataDirs, codexDataDirs } from '../main/agent-homes.mjs';
import { startedIn, threadImportRow } from '../shared/agent-import.mjs';

const NOW = Date.UTC(2026, 9, 11, 18, 0, 0);
const ago = (mins) => NOW - mins * 60 * 1000;

let home;
let elsewhere;

function writeTranscript(dataDir, { id, entrypoint, cwd, said, when }) {
  const folder = cwd.replace(/[^a-zA-Z0-9]/g, '-');
  const dir = path.join(dataDir, 'projects', folder);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.jsonl`);
  const row = { type: 'user', sessionId: id, cwd, userType: 'external', message: { role: 'user', content: said } };
  if (entrypoint) row.entrypoint = entrypoint;
  fs.writeFileSync(file, `${JSON.stringify(row)}\n`);
  fs.utimesSync(file, new Date(when), new Date(when));
  return file;
}

function writeRollout(codexDir, { id, cwd, said, when, originator = 'codex_cli_rs', source = 'cli' }) {
  const d = new Date(when);
  const day = path.join(codexDir, 'sessions', String(d.getFullYear()),
    String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
  fs.mkdirSync(day, { recursive: true });
  const file = path.join(day, `rollout-2026-10-11T10-00-00-${id}.jsonl`);
  const iso = d.toISOString();
  fs.writeFileSync(file, [
    JSON.stringify({ timestamp: iso, type: 'session_meta', payload: { id, timestamp: iso, cwd, originator, source } }),
    JSON.stringify({ timestamp: iso, type: 'event_msg', payload: { type: 'user_message', message: said } }),
  ].join('\n') + '\n');
  fs.utimesSync(file, d, d);
  return file;
}

beforeAll(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'import-homes-'));
  elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'import-elsewhere-'));
  const work = `${home}/code/shop`;

  // The ordinary terminal session, in the ordinary folder. Already found before.
  writeTranscript(path.join(home, '.claude'), { id: 'term-1', entrypoint: 'cli', cwd: work, said: 'fix the checkout button', when: ago(5) });
  // 1. Started in VS Code (or Cursor, or Windsurf).
  writeTranscript(path.join(home, '.claude'), { id: 'vscode-1', entrypoint: 'claude-vscode', cwd: work, said: 'add dark mode to the settings page', when: ago(10) });
  // 2. A second Claude login under ~/.claude-work, which the app was never told about.
  writeTranscript(path.join(home, '.claude-work'), { id: 'second-1', entrypoint: 'cli', cwd: work, said: 'write the release notes', when: ago(20) });
  // 2b. CLAUDE_CONFIG_DIR pointing somewhere that is not under home at all.
  writeTranscript(path.join(elsewhere, 'claude-data'), { id: 'envdir-1', entrypoint: 'cli', cwd: work, said: 'rename the payments module', when: ago(25) });
  // 2c. Where Claude Code kept its data on Linux for a while: ~/.config/claude.
  writeTranscript(path.join(home, '.config', 'claude'), { id: 'xdg-1', entrypoint: 'cli', cwd: work, said: 'bump the node version', when: ago(30) });

  // MUST NOT COME IN.
  // The app's own worker, in the second folder: the entrypoint filter still applies there.
  writeTranscript(path.join(home, '.claude-work'), { id: 'worker-1', entrypoint: 'sdk-cli', cwd: work, said: '# Your work item', when: ago(2) });
  // An entrypoint nobody has seen.
  writeTranscript(path.join(home, '.claude'), { id: 'odd-1', entrypoint: 'something-new', cwd: work, said: 'who knows', when: ago(3) });
  // A cloud session that happens to be on disk.
  writeTranscript(path.join(home, '.claude'), { id: 'remote-1', entrypoint: 'remote', cwd: work, said: 'from the phone', when: ago(4) });
  // A backup folder holding an older copy of a session that is already counted.
  writeTranscript(path.join(home, '.claude-backup'), { id: 'term-1', entrypoint: 'cli', cwd: work, said: 'fix the checkout button', when: ago(600) });
  // A folder with Claude's name but no dot is somebody's checkout, never read.
  writeTranscript(path.join(home, 'claude-src'), { id: 'checkout-1', entrypoint: 'cli', cwd: work, said: 'not a data folder', when: ago(6) });
  // A `.claude-` folder with no projects in it (worktrees live in one like this).
  fs.mkdirSync(path.join(home, '.claude-worktrees', 'w-1'), { recursive: true });

  // CODEX.
  writeRollout(path.join(home, '.codex'), { id: 'cx-main', cwd: work, said: 'make the tests faster', when: ago(15) });
  writeRollout(path.join(home, '.codex-2'), { id: 'cx-second', cwd: work, said: 'clean up the logging', when: ago(35) });
  writeRollout(path.join(elsewhere, 'codex-data'), { id: 'cx-env', cwd: work, said: 'port the cron job', when: ago(40) });
  // The app's own Codex run, in the second folder: still not offered.
  writeRollout(path.join(home, '.codex-2'), { id: 'cx-ours', cwd: work, said: 'Run the tests.', when: ago(1), originator: 'agentbox', source: 'vscode' });
  // The same conversation copied into a second folder: one row, not two.
  writeRollout(path.join(home, '.codex-backup'), { id: 'cx-main', cwd: work, said: 'make the tests faster', when: ago(900) });
});

afterAll(() => {
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(elsewhere, { recursive: true, force: true });
});

describe('which Claude Code sessions a person started', () => {
  it('counts a session started from the VS Code, Cursor or Windsurf extension', () => {
    expect(startedByHand('claude-vscode')).toBe(true);
  });

  it('still refuses the app\'s own runs, cloud sessions and anything unknown', () => {
    for (const ep of ['sdk-cli', 'sdk-ts', 'sdk-py', 'remote', 'remote_mobile', 'mcp', 'local-agent', 'something-new', undefined, '']) {
      expect(startedByHand(ep)).toBe(false);
    }
  });

  it('says where the session was started, in words a person uses', () => {
    expect(startedIn('editor')).toBe('in your code editor');
    expect(startedIn('terminal')).toBe('in a terminal');
  });
});

describe('every folder Claude Code keeps sessions in', () => {
  it('finds ~/.claude, every ~/.claude-<name> with sessions in it, ~/.config/claude and CLAUDE_CONFIG_DIR', () => {
    const dirs = claudeDataDirs({ home, env: { CLAUDE_CONFIG_DIR: path.join(elsewhere, 'claude-data') } });
    expect(dirs).toEqual(expect.arrayContaining([
      path.join(home, '.claude'),
      path.join(home, '.claude-work'),
      path.join(home, '.claude-backup'),
      path.join(home, '.config', 'claude'),
      path.join(elsewhere, 'claude-data'),
    ]));
  });

  it('leaves out a folder with no sessions in it, and one that is only named like Claude', () => {
    const dirs = claudeDataDirs({ home, env: {} });
    expect(dirs).not.toContain(path.join(home, '.claude-worktrees'));
    expect(dirs).not.toContain(path.join(home, 'claude-src'));
    expect(dirs).not.toContain(path.join(elsewhere, 'claude-data'));
  });

  it('reads a folder the app was configured with, wherever it is', () => {
    const dirs = claudeDataDirs({ home, env: {}, configured: ['default', path.join(elsewhere, 'claude-data')] });
    expect(dirs).toContain(path.join(elsewhere, 'claude-data'));
  });

  it('names one folder once, however many ways it was reached', () => {
    const dirs = claudeDataDirs({ home, env: { CLAUDE_CONFIG_DIR: path.join(home, '.claude') }, configured: ['default', `${home}/.claude/`] });
    expect(dirs.filter((d) => d === path.join(home, '.claude'))).toHaveLength(1);
  });
});

describe('the Claude Code sessions the import offers', () => {
  let found;
  beforeAll(() => {
    found = readSessionThreads({ home, now: NOW, dirs: claudeDataDirs({ home, env: { CLAUDE_CONFIG_DIR: path.join(elsewhere, 'claude-data') } }) });
  });
  const ids = () => found.threads.map((t) => t.id);

  it('offers the terminal session, the editor session and the ones in every other folder', () => {
    expect(ids()).toEqual(expect.arrayContaining(['term-1', 'vscode-1', 'second-1', 'envdir-1', 'xdg-1']));
  });

  // The row is the chat itself since w-62228098e6: it opens on what was typed
  // into the editor rather than on a note saying where it came from.
  it('marks the editor session as one, and its row opens on what was typed there', () => {
    const editor = found.threads.find((t) => t.id === 'vscode-1');
    expect(editor.source).toBe('editor');
    expect(threadImportRow(editor).body).toBe(editor.firstSaid || editor.title);
  });

  it('offers a session found in two folders once, as its newest copy', () => {
    const term = found.threads.filter((t) => t.id === 'term-1');
    expect(term).toHaveLength(1);
    expect(term[0].when).toBe(ago(5));
  });

  it('still leaves out the app\'s own worker, a cloud session, an unknown entrypoint and a checkout', () => {
    for (const id of ['worker-1', 'remote-1', 'odd-1', 'checkout-1']) expect(ids()).not.toContain(id);
  });

  it('with no folders handed to it, reads the ones under home and nothing from the test runner\'s own env', () => {
    const plain = readSessionThreads({ home, now: NOW }).threads.map((t) => t.id);
    expect(plain).toEqual(expect.arrayContaining(['term-1', 'vscode-1', 'second-1', 'xdg-1']));
    expect(plain).not.toContain('envdir-1');
  });
});

describe('every folder Codex keeps sessions in', () => {
  it('finds ~/.codex, every ~/.codex-<name> with sessions in it, and CODEX_HOME', () => {
    const dirs = codexDataDirs({ home, env: { CODEX_HOME: path.join(elsewhere, 'codex-data') } });
    expect(dirs).toEqual(expect.arrayContaining([
      path.join(home, '.codex'), path.join(home, '.codex-2'), path.join(elsewhere, 'codex-data'),
    ]));
  });

  it('offers the conversations in every folder, once each, and not the app\'s own run', () => {
    const dirs = codexDataDirs({ home, env: { CODEX_HOME: path.join(elsewhere, 'codex-data') } });
    const { threads } = readCodexThreads({ home, now: NOW, codexDirs: dirs });
    const ids = threads.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(['cx-main', 'cx-second', 'cx-env']));
    expect(ids).not.toContain('cx-ours');
    expect(ids.filter((id) => id === 'cx-main')).toHaveLength(1);
    expect(threads.find((t) => t.id === 'cx-main').when).toBe(ago(15));
  });

  it('still reads exactly one folder when it is handed one, as before', () => {
    const { threads } = readCodexThreads({ home, now: NOW, codexDir: path.join(home, '.codex-2') });
    expect(threads.map((t) => t.id)).toEqual(['cx-second']);
  });
});
