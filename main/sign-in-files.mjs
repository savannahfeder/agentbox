import { harnessFor } from './harnesses.mjs';
// THE FILES A LOGIN WRITES, SO THE APP CAN SEE ONE LAND.
//
// A signed-out account used to sit out a fixed half hour, and nothing but a
// session surviving on it could bring it back, which no session could do while
// it sat out. So typing /login fixed nothing a person could see: their agents
// stayed "Queued" until the half hour ran out on its own, and a /login and any
// "continue" replies in between did nothing.
//
// A login rewrites these. Only their modification times are read, never their
// contents: what is in them is her credentials and is none of our business.
// A moved time is a reason to TRY again, not proof; the try is the proof.

import fs from 'node:fs';


/**
 * Where one account's login is written.
 *  - Claude Code, its default login: `~/.claude.json` (where the CLI keeps the
 *    account it is signed in as) and the same files inside `~/.claude`.
 *  - Claude Code, a CLAUDE_CONFIG_DIR: those files inside that folder.
 *  - Codex: `auth.json` inside its CODEX_HOME.
 */
export function signInFiles({ engine = 'claude', folder = null, home }) {
  return harnessFor(engine).signInFiles({ folder, home });
}

/** The newest modification time among them, or 0 when none can be read. */
export function signInStamp(files, stat = fs.statSync) {
  let newest = 0;
  for (const f of files ?? []) {
    try { newest = Math.max(newest, stat(f).mtimeMs); } catch {}
  }
  return newest;
}
