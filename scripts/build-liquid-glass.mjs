// Builds main/native/liquid-glass into a .node the tray loads (main/liquid-glass.mjs).
//
// It runs on every `npm run build`, on a Mac only, and never fails the build:
// without it the tray draws its own glass, as it always has. The binary is
// gitignored, because a checked-in binary is a thing nobody can review.
// It is built for both Mac chips, since the release is one universal app.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'main', 'native', 'liquid-glass');
const source = path.join(dir, 'liquid-glass.mm');
const out = path.join(dir, 'build', 'liquid-glass.node');

function skip(why) {
  console.log(`liquid glass: not built (${why}); the tray draws its own glass`);
  process.exit(0);
}

if (process.platform !== 'darwin') skip('not a Mac');
const headers = path.join(path.dirname(process.execPath), '..', 'include', 'node');
if (!fs.existsSync(path.join(headers, 'node_api.h'))) skip(`no Node headers at ${headers}`);
if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(source).mtimeMs) process.exit(0);

fs.mkdirSync(path.dirname(out), { recursive: true });
const tmp = `${out}.tmp-${process.pid}`;
try {
  execFileSync('clang++', [
    '-x', 'objective-c++', '-std=c++17', '-fno-objc-arc', '-O2',
    '-shared', '-undefined', 'dynamic_lookup', '-mmacosx-version-min=11.0',
    '-arch', 'arm64', '-arch', 'x86_64',
    '-I', headers, '-framework', 'AppKit',
    source, '-o', tmp,
  ], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 120_000 });
  fs.renameSync(tmp, out);
  console.log('liquid glass: built');
} catch (err) {
  fs.rmSync(tmp, { force: true });
  skip(String(err.stderr || err.message).trim().split('\n')[0]);
}
