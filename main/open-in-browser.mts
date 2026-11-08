// Opening an address in the person's own browser.
//
// Electron's `shell.openExternal` can be refused by macOS for reasons that are
// the machine's, not ours (a default browser just changed, Launch Services out
// of step), and `/usr/bin/open` goes in by a different door, so a refusal tries
// that before giving up. A hang is not retried: the first browser may still
// open the page, and a second try would open it twice.
import { execFile } from 'node:child_process';

export interface BrowserShell { openExternal(url: string): unknown }
type Run = (cmd: string, args: string[], opts: { timeout: number }) => Promise<unknown>;
export type Opened = { ok: true } | { ok: false; error: string };

export const ELECTRON_MS = 15_000;
const SYSTEM_MS = 10_000;

const runFile: Run = (cmd, args, opts) => new Promise((resolve, reject) => {
  execFile(cmd, args, opts, (err) => (err ? reject(err) : resolve(undefined)));
});

// `open` runs a path or an app bundle it is handed, so only these get that far.
const SYSTEM_MAY_OPEN = /^(https?:\/\/|mailto:)/i;

function systemOpener(platform: NodeJS.Platform): string | null {
  if (platform === 'darwin') return '/usr/bin/open';
  if (platform === 'linux') return 'xdg-open';
  return null;
}

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

export async function openInBrowser(url: string, {
  shell, platform = process.platform, run = runFile, log = (l: string) => console.warn(l), waitMs = ELECTRON_MS,
}: { shell: BrowserShell; platform?: NodeJS.Platform; run?: Run; log?: (line: string) => void; waitMs?: number }): Promise<Opened> {
  const failed: Opened = { ok: false, error: `${url} could not be opened.` };
  let timer: NodeJS.Timeout | undefined;
  const hung = Symbol('hung');
  let first: unknown;
  try {
    const answer = await Promise.race([
      Promise.resolve(shell.openExternal(url)),
      new Promise<typeof hung>((resolve) => { timer = setTimeout(() => resolve(hung), waitMs); }),
    ]);
    if (answer !== hung) return { ok: true };
    log(`open in browser: the browser did not answer within ${waitMs / 1000}s for ${url}`);
    return failed;
  } catch (err) {
    first = err;
  } finally {
    clearTimeout(timer);
  }
  const opener = systemOpener(platform);
  if (!opener || !SYSTEM_MAY_OPEN.test(url)) {
    log(`open in browser: refused for ${url}: ${reason(first)}`);
    return failed;
  }
  try {
    await run(opener, [url], { timeout: SYSTEM_MS });
    log(`open in browser: Electron was refused (${reason(first)}); ${opener} opened ${url}`);
    return { ok: true };
  } catch (err) {
    log(`open in browser: refused for ${url}: Electron said ${reason(first)}; ${opener} said ${reason(err)}`);
    return failed;
  }
}
