// The apps a Mac would offer for a file, as Finder's Open With lists them.
import { execFile } from 'node:child_process';
import path from 'node:path';

export interface AppThatOpens { path: string; name: string; isDefault: boolean }
type Ask = (cmd: string, args: string[], opts: { timeout: number }) => Promise<string>;

export const APPS_MS = 5_000;

// NSWorkspace through osascript's JavaScript bridge, so no native module is
// needed. URLsForApplicationsToOpenURL is macOS 12 and later; older ones fail
// and offer no list. The file comes in as argv, never inside the script.
export const ASK_THE_MAC = `ObjC.import('AppKit');
function run(argv) {
  const ws = $.NSWorkspace.sharedWorkspace;
  const url = $.NSURL.fileURLWithPath(argv[0]);
  const first = ws.URLForApplicationToOpenURL(url);
  const all = ws.URLsForApplicationsToOpenURL(url);
  const paths = [];
  for (let i = 0; i < all.count; i++) paths.push(ObjC.unwrap(all.objectAtIndex(i).path));
  return JSON.stringify({ first: first.isNil() ? null : ObjC.unwrap(first.path), paths });
}`;

const askFile: Ask = (cmd, args, opts) => new Promise((resolve, reject) => {
  execFile(cmd, args, { ...opts, encoding: 'utf8', maxBuffer: 1 << 20 }, (err, out) => (err ? reject(err) : resolve(String(out))));
});

const appName = (p: string) => path.basename(p).replace(/\.app$/i, '');

/** The Mac's answer as a menu: its default first, the rest by name, one row per app name. */
export function appsFromAnswer(text: string): AppThatOpens[] {
  let got: { first?: unknown; paths?: unknown };
  try { got = JSON.parse(text); } catch { return []; }
  const isApp = (p: unknown): p is string => typeof p === 'string' && /\.app$/i.test(p);
  const first = isApp(got?.first) ? got.first : null;
  const rest = (Array.isArray(got?.paths) ? got.paths.filter(isApp) : [])
    .filter((p) => p !== first)
    .sort((a, b) => appName(a).localeCompare(appName(b)));
  const seen = new Set<string>();
  const apps: AppThatOpens[] = [];
  for (const p of first ? [first, ...rest] : rest) {
    const name = appName(p);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    apps.push({ path: p, name, isDefault: p === first });
  }
  return apps;
}

/** The apps that can open `file`, or none when this is not a Mac or the Mac would not say. */
export async function appsThatOpen(file: string, { platform = process.platform, ask = askFile }: { platform?: NodeJS.Platform; ask?: Ask } = {}): Promise<AppThatOpens[]> {
  if (platform !== 'darwin') return [];
  try { return appsFromAnswer(await ask('/usr/bin/osascript', ['-l', 'JavaScript', '-e', ASK_THE_MAC, path.resolve(file)], { timeout: APPS_MS })); }
  catch { return []; }
}
