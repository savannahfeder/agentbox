#!/usr/bin/env node
// Puts the Electron a branch's lockfile names into the download cache, so its
// install can unpack it in the sandbox with no internet (scripts/lib/branch-sandbox.mjs).
// It runs outside the sandbox, so it takes only the version from the branch and
// downloads with the app folder's own @electron/get, which checks the release's
// checksums.
//
//   node fetch-electron.mjs <task folder>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export function electronVersionOf(lockText) {
  let version;
  try { version = JSON.parse(lockText)?.packages?.['node_modules/electron']?.version; } catch { return null; }
  return typeof version === 'string' && /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version) ? version : null;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const task = process.argv[2] ?? process.cwd();
  let lock = '';
  try { lock = fs.readFileSync(path.join(task, 'package-lock.json'), 'utf8'); } catch { process.exit(0); }
  const version = electronVersionOf(lock);
  if (!version) process.exit(0);
  const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  let get;
  try { get = createRequire(path.join(app, 'package.json'))('@electron/get'); } catch { process.exit(0); }
  const cacheRoot = path.join(os.homedir(), 'Library', 'Caches', 'electron');
  try {
    const deadline = new Promise((_, no) => setTimeout(() => no(new Error('it took over ten minutes')), 10 * 60_000).unref());
    await Promise.race([get.downloadArtifact({ version, artifactName: 'electron', platform: process.platform, arch: process.arch, cacheRoot }), deadline]);
  } catch (err) {
    console.error(`pre-push: Electron ${version} could not be downloaded (${err?.message ?? err}).`);
    process.exit(1);
  }
}
