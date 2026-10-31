// THE README'S INSTALL FLOW SAYS WHAT REALLY HAPPENS (F-143, F-144, F-146,
// F-147, w-b54c790f9a).
//
// What broke: a tester ran the README's desktop flow literally on a fresh
// Debian box. `npm install` printed six deprecation warnings and "57
// vulnerabilities (2 low, 39 moderate, 13 high, 3 critical)" and the README
// said nothing about it; the vite build printed "(!) Some chunks are larger
// than 500 kB"; the README asked for Node 22 while the run worked on Node
// 24.22.1; and the clone called itself 0.1.17 while 0.1.18 was the published
// release and 0.1.19 followed it.
//
// Three of those four are drift between two files that nobody reads together,
// so they are checked here rather than remembered.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const readme = read('README.md');
const pkg = JSON.parse(read('package.json'));

describe('what the README promises about installing', () => {
  // F-146. ">=22" is a floor, so the sentence has to read as one.
  it('asks for the same Node the package does, as a floor and not one version', () => {
    const floor = pkg.engines.node.match(/>=\s*(\d+(?:\.\d+)*)/)?.[1];
    expect(floor).toBeTruthy();
    expect(readme).toContain(`Node ${floor} or newer`);
    expect(readme).not.toMatch(new RegExp(`need Node ${floor} and`));
  });

  // F-143. The count moves with every advisory, so the words are checked and
  // the number is not. The deprecation warnings are gone
  // (tests/a-clean-install-prints-no-deprecation-warnings), so the README no
  // longer promises them.
  it('says that install ends on a vulnerability count', () => {
    const install = readme.slice(readme.indexOf('## Install'), readme.indexOf('**In your browser.**'));
    expect(install).not.toMatch(/deprecation warnings/);
    expect(install).toMatch(/vulnerabilities/);
    expect(install).toMatch(/worked if it exits\s+without an error/);
  });
});

describe('the version a clone of main reports', () => {
  // F-147. The lockfile half of this is already held by
  // tests/the-lockfile-carries-the-same-version-as-the-app.
  //
  // A release is only ever cut above what main says (scripts/lib/deploy-rules).
  it('is a plain three-part number, which is what nextVersion counts on', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('what the build prints', () => {
  // F-144. Nothing here crosses a network: the window loads these files off
  // the disk and a tab loads them from 127.0.0.1, so vite's download warning
  // only ever read as a broken build.
  it('does not warn about chunk size', () => {
    expect(read('renderer/vite.config.ts')).toMatch(/chunkSizeWarningLimit:\s*\d{4}/);
  });

  // The build has to work on a machine that never had Claude Code on it, and
  // it says which committed table it is shipping. That is not a failure and
  // must not read as one.
  it('says a missing Claude Code is what the build is doing, not what went wrong', () => {
    for (const f of ['scripts/read-claude-commands.mjs', 'scripts/read-claude-models.mjs']) {
      expect(read(f)).toContain('building without Claude Code installed');
      expect(read(f)).not.toContain('no Claude Code here');
    }
  });
});
