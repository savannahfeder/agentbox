#!/usr/bin/env node
// EVERY PACKAGE LIST, EVERY PACKAGE, FAILING ON HIGH.
//
// Dev packages are read too: the renderer bundles packages marked dev, so
// "dev" does not mean "does not ship". An advisory nobody can fix yet goes in
// KNOWN with the reason it reaches nobody; that is the only way past, and it is
// one advisory, not a package or a severity.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const FOLDERS = ['.', 'mobile'];

export const KNOWN = {
  'GHSA-5xrq-8626-4rwp': 'vitest: needs the Vitest UI server, which nothing here starts. Goes with the vitest upgrade.',
  'GHSA-5gmw-xhrv-c9v3': 'tinypool (vitest): test runner only, needs a prototype pollution in the test process. Goes with the vitest upgrade.',
  'GHSA-85c8-ppgw-ccpr': 'tinypool (vitest): as above.',
  'GHSA-587h-7wmj-h5pm': 'vite: Windows only, dev server only. Goes with the vite upgrade.',
  'GHSA-mrhx-c7xc-m3w5': 'zod 3 in mobile: only Expo\'s command-line build tool uses it, which pins zod 3. Goes when Expo moves to zod 4.',
};

const BLOCKS = new Set(['high', 'critical']);

/** The advisories in one `npm audit --json` that fail the check. */
export function blocking(audit, known = KNOWN) {
  const seen = new Map();
  for (const [pkg, v] of Object.entries(audit.vulnerabilities ?? {})) {
    for (const via of v.via ?? []) {
      if (typeof via !== 'object' || !BLOCKS.has(via.severity)) continue;
      const id = String(via.url ?? '').split('/').pop();
      if (known[id]) continue;
      seen.set(id, { id, pkg: via.name ?? pkg, severity: via.severity, title: via.title, url: via.url, range: via.range });
    }
  }
  return [...seen.values()];
}

function auditOf(folder, root) {
  const run = spawnSync('npm', ['audit', '--package-lock-only', '--json'], {
    cwd: path.join(root, folder), encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024,
  });
  try {
    const audit = JSON.parse(run.stdout);
    if (audit.error) throw new Error(audit.error.summary ?? JSON.stringify(audit.error));
    return audit;
  } catch (err) {
    throw new Error(`npm audit in ${folder} gave no report (${run.error?.message ?? err.message}). ${String(run.stderr).trim().slice(0, 400)}`);
  }
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let failed = false;
  for (const folder of FOLDERS) {
    const audit = auditOf(folder, root);
    const found = blocking(audit);
    const counts = audit.metadata?.vulnerabilities ?? {};
    console.log(`${folder}: ${found.length} to fix (${Object.entries(counts).filter(([k]) => k !== 'total').map(([k, n]) => `${n} ${k}`).join(', ')} in all)`);
    for (const f of found) console.log(`  ${f.severity} ${f.pkg} ${f.range}: ${f.title}\n    ${f.url}`);
    failed ||= found.length > 0;
  }
  if (failed) {
    console.log('\nUpgrade the package. If nobody can yet, add the advisory to KNOWN in scripts/audit-packages.mjs with why it reaches nobody.');
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(); } catch (err) { console.error(err.message); process.exit(1); }
}
