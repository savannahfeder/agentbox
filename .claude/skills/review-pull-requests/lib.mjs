// What queue.mjs and file.mjs share: `gh`, this repository, and the inbox.
//
// The inbox is written through the store's own code (mcp/core), the same path
// the agents' create_work_item takes, never a second writer.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { githubRepoOf } from './scan.mjs';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..', '..', '..');
export const SANDBOX = path.join(here, 'run-untrusted.sh');
export const DEFAULT_PRODUCT = 'agentbox-team';

// An app opened from the Dock has no Homebrew on its PATH, and that is where
// `gh` almost always is.
const GH = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh'].find((p) => fs.existsSync(p)) ?? 'gh';
export const gh = (args) => execFileSync(GH, args, {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1' },
});

export function repoOf(root = repoRoot) {
  return githubRepoOf(execFileSync('git', ['-C', root, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }));
}

/** The store's own work-item functions, for the one account on this Mac. */
export async function inbox() {
  const { resolveAccount } = await import('../../../mcp/core/account.mjs');
  resolveAccount();
  return import('../../../mcp/core/work.mjs');
}

export function argOf(argv, name, fallback = null) {
  const at = argv.indexOf(name);
  return at >= 0 && argv[at + 1] ? argv[at + 1] : fallback;
}
