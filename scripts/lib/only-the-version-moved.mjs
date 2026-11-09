// Exits 0 when the commits from <base> to <sha> change only the version in
// package.json and package-lock.json, as a release's own commit does; 1 otherwise.
// Usage: node scripts/lib/only-the-version-moved.mjs <base> <sha>
import { execFileSync } from 'node:child_process';
import { onlyTheVersionMoved } from './deploy-rules.mjs';

const [base, sha] = process.argv.slice(2);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const show = (ref, file) => { try { return git('show', `${ref}:${file}`); } catch { return null; } };

let ok = false;
try {
  const changed = git('diff', '--name-only', base, sha).split('\n').filter(Boolean);
  ok = changed.length > 0
    && changed.every((f) => f === 'package.json' || f === 'package-lock.json')
    && changed.every((f) => onlyTheVersionMoved(show(base, f), show(sha, f)));
} catch { ok = false; }
process.exit(ok ? 0 : 1);
