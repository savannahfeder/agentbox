import { harnessFor } from './harnesses.mts';
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
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';


/**
 * Where one account's login is written.
 *  - Claude Code, its default login: `~/.claude.json` (where the CLI keeps the
 *    account it is signed in as) and the same files inside `~/.claude`.
 *  - Claude Code, a CLAUDE_CONFIG_DIR: those files inside that folder.
 *  - Codex: `auth.json` inside its CODEX_HOME.
 */
export function signInFiles({ engine = 'claude', folder = null, home }: { engine?: string; folder?: string | null; home: string }) {
  return harnessFor(engine).signInFiles({ folder, home });
}

/** The Keychain entry Claude Code keeps a login in on a Mac, named as the CLI names it. */
export function claudeKeychainService(folder: string | null | undefined) {
  return folder ? `Claude Code-credentials-${createHash('sha256').update(folder).digest('hex').slice(0, 8)}` : 'Claude Code-credentials';
}

type Run = (cmd: string, args: string[], opts: { encoding: 'utf8'; timeout: number }, done: (err: Error | null, out: string) => void) => unknown;

/**
 * When that Keychain entry last changed, or null when there is none. Without
 * -g or -w, `security` prints the entry's attributes and never its secret.
 * Asynchronous: on a swapping Mac `security` can take minutes, far past its
 * timeout, and the main thread must not wait for it.
 */
export function keychainStamp(service: string, run: Run = execFile as unknown as Run, platform: string = process.platform): Promise<number | null> {
  if (platform !== 'darwin') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      run('/usr/bin/security', ['find-generic-password', '-s', service], { encoding: 'utf8', timeout: 3000 }, (err, out) => {
        if (err) return resolve(null);
        const m = /"mdat"<timedate>=\S*\s+"(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z/.exec(String(out ?? ''));
        resolve(m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null);
      });
    } catch { resolve(null); }
  });
}

/** The newest modification time among them, or 0 when none can be read. */
export function signInStamp(files: string[] | null | undefined, stat: (file: string) => { mtimeMs: number } = fs.statSync) {
  let newest = 0;
  for (const f of files ?? []) {
    try { newest = Math.max(newest, stat(f).mtimeMs); } catch {}
  }
  return newest;
}
