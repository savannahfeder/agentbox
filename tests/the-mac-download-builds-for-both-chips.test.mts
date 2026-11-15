// THE UNIVERSAL MAC BUILD MUST KNOW WHAT TO DO WITH NODE-PTY'S PREBUILT BINARIES.
//
// Found on 2026-10-05 making the first signed build for agentbox.ac. `npm run
// release` built both the Intel and the Apple silicon app, then died merging
// them into the one universal app the website hands out:
//
//   ⨯ Detected file "Contents/Resources/app.asar.unpacked/node_modules/node-pty/
//     prebuilds/darwin-arm64/pty.node" that's the same in both x64 and arm64
//     builds and not covered by the x64ArchFiles rule: "undefined"
//
// node-pty 1.1.0 ships its own prebuilt binaries for both chips
// (prebuilds/darwin-arm64 and prebuilds/darwin-x64, a pty.node and a
// spawn-helper in each). Each file is the same in both halves of the build, and
// @electron/universal refuses to merge an identical Mach-O file unless
// `mac.x64ArchFiles` says it may keep one copy. With the rule set, the build
// finished and the universal app kept an arm64 pty.node under darwin-arm64 and an
// x86_64 one under darwin-x64, checked with `file`.
//
// The rule must stay narrow: anything it matches is copied rather than merged, so
// it must never reach node-pty's rebuilt build/Release module or the app itself.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const rule = pkg.build?.mac?.x64ArchFiles;
const inApp = (p) => `Contents/Resources/app.asar.unpacked/node_modules/node-pty/${p}`;

describe('the universal Mac build merges node-pty for both chips', () => {
  it('has an x64ArchFiles rule', () => {
    expect(typeof rule).toBe('string');
  });

  it('covers both prebuilt binaries for both chips', () => {
    for (const chip of ['darwin-arm64', 'darwin-x64']) {
      for (const file of ['pty.node', 'spawn-helper']) {
        expect(path.matchesGlob(inApp(`prebuilds/${chip}/${file}`), rule), `${chip}/${file}`).toBe(true);
      }
    }
  });

  it('does not reach the rebuilt module or the app itself, which must still be merged per chip', () => {
    expect(path.matchesGlob(inApp('build/Release/pty.node'), rule)).toBe(false);
    expect(path.matchesGlob(inApp('prebuilds/win32-x64/pty.node'), rule)).toBe(false);
    expect(path.matchesGlob('Contents/MacOS/Agentbox', rule)).toBe(false);
  });
});
