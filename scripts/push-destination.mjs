// WHERE A PUSH MAY NOT GO: the repository this project retired.
//
// The project moved to its public repository on 2026-09-29, and the private
// repository it came from was frozen as it was. A checkout whose `origin` was
// never repointed kept pushing there, green, because the hook's only other
// destination check (check-before-public.mjs) examines pushes to the public
// repository and lets every other destination through, so that a
// contributor's fork is never refused.
//
// This refuses the retired repository by name and nothing else. A fork, the
// public repository and a local folder all pass.
//
//   git pre-push:  node scripts/push-destination.mjs <remote> <url>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RETIRED = ['github.com/astral-agent/zero'];

/** `host/owner/repo`, lowercased, from any spelling git accepts; '' for a local path. */
function where(url) {
  const u = String(url ?? '').trim();
  let host = '';
  let rest = '';
  const scp = /^[^/@:\s]+@([^/:\s]+):(.+)$/.exec(u);
  if (scp) {
    [, host, rest] = scp;
  } else {
    try {
      const parsed = new URL(u);
      if (parsed.protocol === 'file:') return '';
      host = parsed.hostname;
      rest = parsed.pathname;
    } catch { return ''; }
  }
  if (!host) return '';
  rest = rest.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
  return `${host}/${rest}`.toLowerCase();
}

/** Is this remote url the repository this project retired. */
export function retiredDestination(url) {
  const w = where(url);
  return Boolean(w) && RETIRED.includes(w);
}

/** The project's own repository, as a url to paste into `git remote set-url`. */
function ownRepository() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));
    return String(pkg.repository?.url ?? '').replace(/^git\+/, '');
  } catch { return ''; }
}

function main(argv) {
  const [remote = 'origin', url = ''] = argv.slice(2);
  if (!retiredDestination(url)) return 0;
  const own = ownRepository();
  console.error('');
  console.error(`  PUSH REFUSED. "${remote}" points at ${url},`);
  console.error('  the repository this project retired. Nothing was sent.');
  console.error('');
  if (own) {
    console.error('  Point it at the live repository and push again:');
    console.error(`    git remote set-url ${remote} ${own}`);
    console.error('');
  }
  return 1;
}

const invoked = (() => { try { return fs.realpathSync(process.argv[1] ?? ''); } catch { return ''; } })();
if (invoked && fs.realpathSync(fileURLToPath(import.meta.url)) === invoked) process.exit(main(process.argv));
