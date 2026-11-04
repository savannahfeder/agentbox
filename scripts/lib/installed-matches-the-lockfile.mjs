#!/usr/bin/env node
// Whether node_modules holds what package-lock.json says, read off the record
// npm keeps of its own install (node_modules/.package-lock.json). Run in a
// checkout, it exits 1 and names the first differences when they disagree.
// The pre-push hook runs it: a task folder's node_modules is a copy of the app
// folder's, so a branch that changes packages is otherwise tested on main's.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** What is installed differently from the lockfile, one line each; [] when they match. */
export function installedDiffers(lockfile, installed) {
  if (!installed?.packages) return ['nothing installed'];
  const want = lockfile?.packages ?? {};
  const have = installed.packages;
  const differs = [];
  for (const [at, pkg] of Object.entries(want)) {
    if (!at) continue;
    // Optional packages for other platforms (esbuild's, rollup's) are never installed.
    if (!have[at]) { if (!pkg.optional) differs.push(`${at}: not installed`); continue; }
    if (have[at].version !== pkg.version) differs.push(`${at}: ${have[at].version} installed, ${pkg.version} in the lockfile`);
  }
  for (const at of Object.keys(have)) if (!want[at]) differs.push(`${at}: installed, not in the lockfile`);
  return differs;
}

const read = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lockfile = read('package-lock.json');
  if (!lockfile) process.exit(0);
  const differs = installedDiffers(lockfile, read(path.join('node_modules', '.package-lock.json')));
  if (differs.length) {
    console.log(`${differs.length} package(s) installed differently from package-lock.json, among them:`);
    for (const line of differs.slice(0, 5)) console.log(`  ${line}`);
    process.exitCode = 1;
  }
}
