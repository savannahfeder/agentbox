// The browser an agent starts without a window. On a Mac it is never the
// person's Google Chrome: a headless copy of that app registers as
// com.google.Chrome, and every Dock click, ⌘N and `open` on Chrome goes to it
// and opens nothing, while Force Quit does not list it. Chrome for Testing and
// Playwright's headless shell are not filed as Google Chrome.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PLAYWRIGHT_CACHE = path.join(os.homedir(), 'Library/Caches/ms-playwright');
const FOR_TESTING = 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

export const NO_HIDDEN_BROWSER = 'No test browser on this computer, and a hidden Google Chrome would stop your own Chrome opening a window. Run `npx playwright install chromium-headless-shell`, then try again.';

function builds(root: string, folder: RegExp, arches: string[], exe: string): string[] {
  let dirs: string[];
  try { dirs = fs.readdirSync(root); } catch { return []; }
  return dirs
    .map((d) => ({ d, n: Number(d.match(folder)?.[1]) }))
    .filter((x) => x.n)
    .sort((a, b) => b.n - a.n)
    .flatMap(({ d }) => arches.map((arch) => path.join(root, d, arch, exe)))
    .filter((p) => fs.existsSync(p));
}

/** Playwright's Chrome for Testing builds on this Mac, newest first. */
export const chromesForTesting = (root: string = PLAYWRIGHT_CACHE): string[] =>
  builds(root, /^chromium-(\d+)$/, ['chrome-mac-arm64', 'chrome-mac', 'chrome-mac-x64'], FOR_TESTING);

/** Playwright's headless shell builds on this Mac, newest first: a bare binary the Mac never counts as an app. */
export const headlessShells = (root: string = PLAYWRIGHT_CACHE): string[] =>
  builds(root, /^chromium_headless_shell-(\d+)$/, ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell-mac-x64'], 'chrome-headless-shell');

/** Chrome for Testing, else the headless shell, else null. */
export function hiddenBrowser({ forTesting = chromesForTesting, shells = headlessShells }: { forTesting?: () => string[]; shells?: () => string[] } = {}): string | null {
  return forTesting()[0] ?? shells()[0] ?? null;
}

/** The binary a script spawns: on a Mac the hidden browser or a refusal; elsewhere `CHROME`, which the Linux box sets. */
export function startableChrome({ platform = process.platform, env = process.env, hidden = hiddenBrowser }: {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  hidden?: () => string | null;
} = {}): string {
  if (platform !== 'darwin') return env.CHROME || MAC_CHROME;
  if (env.CHROME && env.CHROME !== MAC_CHROME) return env.CHROME;
  const found = hidden();
  if (!found) throw new Error(NO_HIDDEN_BROWSER);
  return found;
}
