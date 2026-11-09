// THE DOWNLOAD AND THE UPDATE FEED LIVE IN ONE PUBLIC REPO, agentboxhq/agentbox-releases.
//
// Found on 2026-10-05 publishing the first signed Agentbox build for agentbox.ac.
// The publish went through, and agentbox.ac/download still answered 404:
// Astral-Agent/astral-releases is a PRIVATE repo, so nobody signed out of
// GitHub (every visitor) could fetch its files, and no installed copy could
// fetch an update from it either. Its older releases also carried personal
// details, so rather than make it public the builds moved to a new public repo
// with no history: agentboxhq/agentbox-releases, holding only clean builds.
//
// Three places have to agree on that repo or a release goes somewhere nobody
// reads: the update config baked into the app (package.json build.publish), the
// publish script that uploads, and the release script that reports what is live.
// And a brand new repo has no release at all, which gh reports as "release not
// found"; that is nothing served yet, not a failure to read GitHub.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELEASE_REPO, DOWNLOAD_ASSET, noReleaseYet } from '../scripts/lib/live-download.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const pkg = JSON.parse(read('package.json'));

describe('where Agentbox is downloaded and updated from', () => {
  it('is the public agentboxhq/agentbox-releases repo', () => {
    expect(RELEASE_REPO).toBe('agentboxhq/agentbox-releases');
    expect(DOWNLOAD_ASSET).toBe('Agentbox.dmg');
  });

  it('is what the app checks for updates', () => {
    const feed = pkg.build.publish.find((p) => p.provider === 'github');
    expect(`${feed.owner}/${feed.repo}`).toBe(RELEASE_REPO);
  });

  it('is where the publish and release scripts look, and never the private repo', () => {
    for (const file of ['scripts/publish-download.mjs', 'scripts/release.mjs']) {
      const src = read(file);
      expect(src, file).toContain('RELEASE_REPO');
      expect(src, file).not.toMatch(/'Astral-Agent\/astral-releases'/);
    }
  });
});

describe('a release repo with no release yet', () => {
  it('is nothing served, so the first publish can go ahead', () => {
    expect(noReleaseYet('release not found\n')).toBe(true);
  });

  it('is not confused with gh failing for any other reason', () => {
    expect(noReleaseYet('HTTP 401: Bad credentials')).toBe(false);
    expect(noReleaseYet('Could not resolve to a Repository with the name')).toBe(false);
    expect(noReleaseYet('')).toBe(false);
  });
});
