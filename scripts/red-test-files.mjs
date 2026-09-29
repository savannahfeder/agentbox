// WHICH FILES WERE RED, out of a vitest json report.
//
// The pre-push hook uses this to decide what to re-run. It prints one path per
// line, relative to the repo root, and nothing else, so the hook can read it
// with a plain `$(...)`.
//
// It prints NOTHING and exits 0 when it cannot tell. A run can fail with no
// failed FILE at all, which is what an unhandled worker error looks like, and
// that case has to stay loud.
import fs from 'node:fs';
import path from 'node:path';

const report = process.argv[2];
if (!report || !fs.existsSync(report)) process.exit(0);

let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(report, 'utf8'));
} catch {
  process.exit(0);
}

// THE TWO SIDES ARE SPELLED DIFFERENTLY AND HAVE TO BE RECONCILED. On macOS
// the temp dir is a symlink, `/var/...` against `/private/var/...`, and the
// hook arrives here having done `cd "$(git rev-parse --show-toplevel)"`, which
// resolves it while the report does not. Without this every path looks like it
// climbed out of the repo and the hook decides it cannot name a red file at
// all, which turns every retry into a second full run. Measured while building
// this: the throwaway repo was `/var/...` and its toplevel `/private/var/...`.
const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };

/**
 * Every spelling of one absolute path worth trying. realpath only resolves a
 *  file that still exists, so `/private` is added and removed by hand too: a
 *  report can name a file whose test has since deleted it. */
function spellings(p) {
  const abs = path.resolve(p);
  const set = new Set([real(p), abs]);
  if (abs.startsWith('/private/')) set.add(abs.slice('/private'.length));
  else set.add(path.join('/private', abs));
  return [...set];
}

const roots = spellings(process.cwd());

/** The path relative to whichever spelling of the root actually contains it. */
function inside(name) {
  for (const candidate of spellings(name)) {
    for (const root of roots) {
      const rel = path.relative(root, candidate);
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel;
    }
  }
  return null;
}

const out = new Set();
for (const result of parsed?.testResults ?? []) {
  // jest-style report: a file is `name`, and `status` is failed when anything
  // in it failed. Belt and braces, because a file can also carry a failure
  // message with no failed assertion in it (a collection error).
  const failed = result?.status === 'failed'
    || (result?.assertionResults ?? []).some((a) => a?.status === 'failed');
  if (!failed) continue;
  const name = result?.name;
  if (typeof name !== 'string' || !name) continue;
  // A path that is not inside the repo is not ours to re-run, and handing it
  // back would put an arbitrary string on a command line.
  const rel = path.isAbsolute(name) ? inside(name) : name;
  if (rel) out.add(rel);
}

for (const file of out) console.log(file);
