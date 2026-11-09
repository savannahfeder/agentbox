// A RELEASE SAYS WHICH COMMIT IT WAS BUILT FROM, AND WHAT THAT COMMIT CALLS
// ITSELF.
//
// QA on the Linux box, 2026-10-28 (F-138). A tester built the desktop app from
// the commit npm names for v0.1.18 and got an app reporting 0.1.17, so their
// report said one version and the binary said another.
//
// Nothing was broken: `nextVersion` picks the number when the release runs and
// `deploy` puts package.json back afterwards, on purpose, so main's number
// lags behind what is out. But nothing said so anywhere a person could read
// it, and nothing anywhere wrote down which commit became which version. Both
// now go in the release notes, which is the page a version number leads to.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseNotes } from '../scripts/lib/deploy-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const SHA = '8b03b0afcd0fa1f77c53620448d2d6f382c22261';

describe('the notes a release page carries', () => {
  it('names the commit it was built from, as a link somebody can follow', () => {
    const notes = releaseNotes({ version: '0.1.18', commit: SHA, sourceVersion: '0.1.18' });
    expect(notes).toContain('Agentbox 0.1.18');
    expect(notes).toContain(`https://github.com/savannahfeder/agentbox/commit/${SHA}`);
  });

  it('says what that commit calls itself when it is not this number', () => {
    const notes = releaseNotes({ version: '0.1.18', commit: SHA, sourceVersion: '0.1.17' });
    // The sentence a tester reading 0.1.17 in a build needs, on the page they
    // would already be on.
    expect(notes).toMatch(/0\.1\.17/);
    expect(notes).toMatch(/built from source/i);
  });

  it('says nothing about it when the commit and the release agree', () => {
    const notes = releaseNotes({ version: '0.1.18', commit: SHA, sourceVersion: '0.1.18' });
    expect(notes).not.toMatch(/built from source/i);
  });

  it('is still just the version when nobody said which commit', () => {
    // publish-download.mjs runs on its own to finish an interrupted release,
    // and a wrong commit on the page would be worse than none.
    expect(releaseNotes({ version: '0.1.18' })).toBe('Agentbox 0.1.18');
    expect(releaseNotes({ version: '0.1.18', commit: '' })).toBe('Agentbox 0.1.18');
  });
});

describe('the deploy hands the commit along', () => {
  it('gives publish-download.mjs the commit it pinned the build to', () => {
    const deploy = read('scripts/deploy.mjs');
    const call = deploy.slice(deploy.indexOf("'scripts/publish-download.mjs'"));
    expect(call.slice(0, 220)).toMatch(/AGENTBOX_RELEASE_COMMIT/);
  });

  it('and publish-download.mjs writes it into the notes rather than the version alone', () => {
    const publish = read('scripts/publish-download.mjs');
    expect(publish).toMatch(/releaseNotes/);
    expect(publish).toMatch(/AGENTBOX_RELEASE_COMMIT/);
  });
});
