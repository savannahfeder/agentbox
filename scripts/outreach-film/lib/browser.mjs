// Playwright from the repo's packages, or from the machine's global install
// (cloud machines carry it there), and the browser it should launch.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function load() {
  for (const name of ['playwright-core', 'playwright']) {
    try { return require(name); } catch { /* next */ }
  }
  let root = '';
  try { root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', timeout: 15_000 }).trim(); } catch { /* none */ }
  for (const name of ['playwright-core', 'playwright']) {
    try { return require(path.join(root, name)); } catch { /* next */ }
  }
  throw new Error('Playwright is not installed: run `npm i -g playwright && npx playwright install chromium`');
}

export const { chromium } = load();

// SHOT_CHROME wins; then the cloud's patched Chromium; then Playwright's own.
export function chromePath() {
  for (const p of [process.env.SHOT_CHROME, '/opt/agentbox/chromium.sh']) if (p && fs.existsSync(p)) return p;
  return undefined;
}

export const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
