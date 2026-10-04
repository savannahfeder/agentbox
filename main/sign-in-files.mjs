// THE FILES A LOGIN WRITES, SO THE APP CAN SEE ONE LAND.
//
// A signed-out account used to sit out a fixed half hour, and nothing but a
// session surviving on it could bring it back, which no session could do while
// it sat out. So typing /login fixed nothing she could see: her agents stayed
// "Queued" until the half hour ran out on its own (2026-10-04, measured off her
// supervisor state: signed out at 11:34, benched to 12:04, agents moving at
// 12:04, her /login and her "continue" replies in between did nothing).
//
// A login rewrites these. Only their modification times are read, never their
// contents: what is in them is her credentials and is none of our business.
// A moved time is a reason to TRY again, not proof; the try is the proof.

import fs from 'node:fs';
import path from 'node:path';

/**
 * Where one account's login is written.
 *  - Claude Code, its default login: `~/.claude.json` (where the CLI keeps the
 *    account it is signed in as) and the same files inside `~/.claude`.
 *  - Claude Code, a CLAUDE_CONFIG_DIR: those files inside that folder.
 *  - Codex: `auth.json` inside its CODEX_HOME.
 */
export function signInFiles({ engine = 'claude', folder = null, home }) {
  if (engine === 'codex') return folder ? [path.join(folder, 'auth.json')] : [];
  if (!folder) {
    const dir = path.join(home, '.claude');
    return [path.join(home, '.claude.json'), path.join(dir, '.claude.json'), path.join(dir, '.credentials.json')];
  }
  return [path.join(folder, '.claude.json'), path.join(folder, '.credentials.json')];
}

/** The newest modification time among them, or 0 when none can be read. */
export function signInStamp(files, stat = fs.statSync) {
  let newest = 0;
  for (const f of files ?? []) {
    try { newest = Math.max(newest, stat(f).mtimeMs); } catch {}
  }
  return newest;
}
