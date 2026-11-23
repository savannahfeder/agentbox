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

/** The path a click would open, resolved, or null when it would run a program. A missing file is its own path. */
function checked(p: string): string | null {
  let real: string;
  let st: fs.Stats;
  try { real = fs.realpathSync(p); st = fs.statSync(real); } catch { return path.resolve(p); }
  if (RUNS.has(path.extname(real).toLowerCase()) || RUNS.has(path.extname(p).toLowerCase())) return null;
  return st.isFile() && (st.mode & 0o111) !== 0 ? null : real;
}

export function opensAProgram(p: string): boolean {
  return checked(p) === null;
}

// Only URLForApplicationToOpenURL, which every macOS the app runs on has. The file comes in as argv.
const DEFAULT_APP = `ObjC.import('AppKit');
function run(argv) {
  const app = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.fileURLWithPath(argv[0]));
  return app.isNil() ? '' : ObjC.unwrap(app.path);
}`;

const askTheMac = (file: string): Promise<string | null> => new Promise((resolve) => {
  execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', DEFAULT_APP, file], { timeout: 5_000, encoding: 'utf8', windowsHide: true }, (err, out) => {
    const app = String(out ?? '').trim();
    resolve(!err && /\.app$/i.test(app) && path.isAbsolute(app) ? app : null);
  });
});

export interface OpeningShell { openPath?(p: string): Promise<string>; showItemInFolder?(p: string): void }
type Run = (cmd: string, args: string[], opts: { timeout: number }) => Promise<unknown>;

// Long enough for a big app's first start, which can take seconds.
export const OPEN_MS = 60_000;

const runFile: Run = (cmd, args, opts) => new Promise((resolve, reject) => {
  execFile(cmd, args, { ...opts, windowsHide: true }, (err) => (err ? reject(err) : resolve(undefined)));
});

/**
 * Opens a file for the person, or shows it in Finder when opening would run it.
 * `app` is an app the Mac listed for this file (main/open-with.mts); only a Mac has that list.
 */
export async function openForThePerson(shell: OpeningShell, p: string, { app, platform = process.platform, run = runFile, defaultApp = askTheMac }: { app?: string; platform?: NodeJS.Platform; run?: Run; defaultApp?: (file: string) => Promise<string | null> } = {}): Promise<string> {
  const real = checked(p);
  if (real === null) { shell.showItemInFolder?.(p); return ''; }
  if (!shell.openPath) return '';
  // On a Mac, shell.openPath blocks the main thread until the receiving app
  // has started, and the window freezes with it.
  if (platform === 'darwin') {
    // Named, the app gets whatever the path has become as a document: a link a
    // worker swapped to its own .app since the check is not launched.
    const by = app ? path.resolve(app) : await defaultApp(real).catch(() => null);
    const args = by ? ['-a', by, real] : [real];
    return run('/usr/bin/open', args, { timeout: OPEN_MS }).then(() => '', () => 'Failed to open path');
  }
  return shell.openPath(real);
}
