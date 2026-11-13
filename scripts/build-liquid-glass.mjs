// Builds main/native/liquid-glass into a .node the tray loads (main/liquid-glass.mts),
// and main/native/window-glass into one the main window loads (main/window-glass.mts).
//
// It runs on every `npm run build`, on a Mac only, and never fails the build:
// without them the tray draws its own glass, as it always has, and the main
// window's Glass switch uses the older blur. The binary is
// gitignored, because a checked-in binary is a thing nobody can review.
// It is built for both Mac chips, since the release is one universal app.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const headers = path.join(path.dirname(process.execPath), '..', 'include', 'node');

function build(name, without) {
  const dir = path.join(root, 'main', 'native', name);
  const source = path.join(dir, `${name}.mm`);
  const out = path.join(dir, 'build', `${name}.node`);
  const skip = (why) => console.log(`${name}: not built (${why}); ${without}`);
  if (process.platform !== 'darwin') return skip('not a Mac');
  if (!fs.existsSync(path.join(headers, 'node_api.h'))) return skip(`no Node headers at ${headers}`);
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(source).mtimeMs) return;

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
    console.log(`${name}: built`);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    skip(String(err.stderr || err.message).trim().split('\n')[0]);
  }
}

build('liquid-glass', 'the tray draws its own glass');
build('window-glass', 'the Glass switch uses the older blur');
