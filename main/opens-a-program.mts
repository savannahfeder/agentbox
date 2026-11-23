// What a click may open for the person. shell.openPath is a double-click, so a
// file a worker wrote that macOS runs or launches is shown in Finder instead:
// opened, it would run as the person, outside the worker's sandbox.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RUNS = new Set([
  '.command', '.tool', '.terminal', '.term', '.app', '.workflow', '.action', '.prefpane', '.saver', '.qlgenerator', '.kext', '.bundle', '.plugin',
  '.fileloc', '.webloc', '.inetloc', '.scpt', '.scptd', '.applescript', '.pkg', '.mpkg', '.jar', '.osax',
]);

export function opensAProgram(p: string): boolean {
  let real: string;
  let st: fs.Stats;
  try { real = fs.realpathSync(p); st = fs.statSync(real); } catch { return false; }
  if (RUNS.has(path.extname(real).toLowerCase()) || RUNS.has(path.extname(p).toLowerCase())) return true;
  return st.isFile() && (st.mode & 0o111) !== 0;
}

export interface OpeningShell { openPath?(p: string): Promise<string>; showItemInFolder?(p: string): void }
type Run = (cmd: string, args: string[], opts: { timeout: number }) => Promise<unknown>;

// Long enough for a big app's first start, which can take seconds.
export const OPEN_MS = 60_000;

const runFile: Run = (cmd, args, opts) => new Promise((resolve, reject) => {
  execFile(cmd, args, opts, (err) => (err ? reject(err) : resolve(undefined)));
});

/**
 * Opens a file for the person, or shows it in Finder when opening would run it.
 * `app` is an app the Mac listed for this file (main/open-with.mts); only a Mac has that list.
 */
export async function openForThePerson(shell: OpeningShell, p: string, { app, platform = process.platform, run = runFile }: { app?: string; platform?: NodeJS.Platform; run?: Run } = {}): Promise<string> {
  if (opensAProgram(p)) { shell.showItemInFolder?.(p); return ''; }
  if (!shell.openPath) return '';
  // On a Mac, shell.openPath blocks the main thread until the receiving app
  // has started, and the window freezes with it.
  if (platform === 'darwin') {
    const args = app ? ['-a', path.resolve(app), path.resolve(p)] : [path.resolve(p)];
    return run('/usr/bin/open', args, { timeout: OPEN_MS }).then(() => '', () => 'Failed to open path');
  }
  return shell.openPath(p);
}
