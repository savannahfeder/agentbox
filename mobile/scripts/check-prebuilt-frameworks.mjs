// Run by Expo's build machine after npm install (`eas-build-post-install`).
// Expo ships its modules as ready-made frameworks, each compiled against one
// version of the others. When the lock pairs one with an older ExpoModulesCore
// than it was compiled against, the app builds, uploads, and dies at launch
// with "Symbol not found" before any of our code runs. This fails the build
// instead, naming the symbol, so the fix is a version bump and not a guess.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Swift symbols one framework needs from another prebuilt one that the other does not define. */
export function gaps(frameworks) {
  const out = [];
  for (const f of frameworks) {
    for (const other of frameworks) {
      if (other === f) continue;
      const prefix = `_$s${other.name.length}${other.name}`;
      const missing = [...f.needs].filter((s) => s.startsWith(prefix) && !other.defined.has(s)).sort();
      if (missing.length) out.push({ framework: f.name, from: other.name, missing });
    }
  }
  return out;
}

function findNm() {
  for (const [cmd, args] of [['xcrun', ['--find', 'nm']], ['which', ['llvm-nm']]]) {
    try { const p = execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); if (p) return p; } catch { /* next */ }
  }
  return null;
}

const symbols = (nm, args, file) => new Set(execFileSync(nm, [...args, file], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  .split('\n').map((l) => l.trim().split(/\s+/).pop()).filter(Boolean));

function tarballs(nodeModules) {
  const found = [];
  const look = (dir) => {
    const at = path.join(dir, 'prebuilds', 'output', 'release', 'xcframeworks');
    if (!fs.existsSync(at)) return;
    for (const f of fs.readdirSync(at)) if (f.endsWith('.tar.gz') && !f.endsWith('Headers.tar.gz')) found.push(path.join(at, f));
  };
  for (const e of fs.readdirSync(nodeModules)) {
    if (e.startsWith('@')) for (const s of fs.readdirSync(path.join(nodeModules, e))) look(path.join(nodeModules, e, s));
    else look(path.join(nodeModules, e));
  }
  return found;
}

function read(nm, tarball, into) {
  const name = path.basename(tarball, '.tar.gz');
  const dir = path.join(into, name);
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('tar', ['xzf', tarball, '-C', dir]);
  const binary = path.join(dir, `${name}.xcframework`, 'ios-arm64', `${name}.framework`, name);
  if (!fs.existsSync(binary)) return null;
  return { name, defined: symbols(nm, ['-gU'], binary), needs: symbols(nm, ['-u'], binary) };
}

function main() {
  const nm = findNm();
  if (!nm) { console.warn('[prebuilt check] no nm on this machine; skipped.'); return 0; }
  const nodeModules = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'prebuilt-check-'));
  try {
    const frameworks = tarballs(nodeModules).map((t) => read(nm, t, work)).filter(Boolean);
    const found = gaps(frameworks);
    if (!found.length) { console.log(`[prebuilt check] ${frameworks.length} ready-made frameworks fit together.`); return 0; }
    console.error('[prebuilt check] This build would crash at launch: a ready-made framework needs symbols another does not have.');
    for (const g of found) console.error(`  ${g.framework} needs from ${g.from}:\n${g.missing.slice(0, 5).map((s) => `    ${s}`).join('\n')}`);
    console.error('Bring the packages into line (npx expo install --fix in mobile/) and build again.');
    return 1;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) process.exitCode = main();
