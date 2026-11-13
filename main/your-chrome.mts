// Whether a Claude Code agent on this computer may use the person's own Chrome,
// the one signed into everything they hold. It follows their own Claude Code:
// "Claude in Chrome enabled by default" (/chrome), which Claude Code itself
// ignores in a `-p` run. This is the only file that may put `--chrome` on a
// worker's line (tests/no-worker-drives-her-own-browser.test.mts).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The file Claude Code keeps that setting in, for the account a run is on. */
export function claudeJsonFor(profile: string | null | undefined, home = os.homedir()) {
  return profile && profile !== 'default' ? path.join(profile, '.claude.json') : path.join(home, '.claude.json');
}

/** True only when that account's Claude Code says exactly true. Unset, unreadable or anything else is off. */
export function chromeOnInClaudeCode(file: string) {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return !!parsed && typeof parsed === 'object' && (parsed as { claudeInChromeDefaultEnabled?: unknown }).claudeInChromeDefaultEnabled === true;
  } catch {
    return false;
  }
}

// Claude Code reads the last mode it is given, and a run that skips permissions
// also skips Chrome's own per-site asks.
function skipsPermissions(args: readonly string[]) {
  let mode: string | null = null;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--dangerously-skip-permissions') return true;
    if (arg === '--permission-mode') mode = args[i + 1] ?? null;
    else if (arg.startsWith('--permission-mode=')) mode = arg.slice('--permission-mode='.length);
  }
  return mode === 'bypassPermissions';
}

export function yourChromeArgs(chromeOn: boolean, args: readonly string[]): string[] {
  if (chromeOn !== true) return [];
  if (skipsPermissions(args)) return [];
  return ['--chrome'];
}
