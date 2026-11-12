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

function mdatOf(out: unknown): number | null {
  const m = /"mdat"<timedate>=\S*\s+"(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z/.exec(String(out ?? ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
}

type RunLater = (cmd: string, args: string[], opts: { encoding: 'utf8'; timeout: number }, done: (err: Error | null, out: string) => void) => void;

/**
 * When that Keychain entry last changed, or null when there is none, handed to
 * `done` later: `security` takes 0.1 to 2 s on a busy Mac, so it is never
 * waited on. Without -g or -w it prints the entry's attributes, never its secret.
 */
export function keychainStampLater(service: string, done: (at: number | null) => void, run: RunLater = execFile as unknown as RunLater, platform: string = process.platform) {
  if (platform !== 'darwin') { done(null); return; }
  try {
    run('/usr/bin/security', ['find-generic-password', '-s', service], { encoding: 'utf8', timeout: 3000 }, (err, out) => done(err ? null : mdatOf(out)));
  } catch { done(null); }
}

/**
 * The last answer for each Keychain entry, asked again in the background at
 * most once per `everyMs`. `undefined` means no answer yet; `null`, no entry.
 */
export class KeychainStamps {
  _known = new Map<string, { at: number | null; known: boolean; askedAt: number; asking: boolean }>();
  _read: typeof keychainStampLater;
  _everyMs: number;
  _now: () => number;

  constructor(read: typeof keychainStampLater = keychainStampLater, everyMs = 10_000, now: () => number = () => Date.now()) {
    this._read = read;
    this._everyMs = everyMs;
    this._now = now;
  }

  get(service: string): number | null | undefined {
    let entry = this._known.get(service);
    if (!entry) { entry = { at: null, known: false, askedAt: -Infinity, asking: false }; this._known.set(service, entry); }
    if (!entry.asking && this._now() - entry.askedAt >= this._everyMs) {
      entry.asking = true;
      entry.askedAt = this._now();
      const e = entry;
      this._read(service, (at) => { e.at = at; e.known = true; e.asking = false; });
    }
    return entry.known ? entry.at : undefined;
  }
}

/** The newest modification time among them, or 0 when none can be read. */
export function signInStamp(files: string[] | null | undefined, stat: (file: string) => { mtimeMs: number } = fs.statSync) {
  let newest = 0;
  for (const f of files ?? []) {
    try { newest = Math.max(newest, stat(f).mtimeMs); } catch {}
  }
  return newest;
}
