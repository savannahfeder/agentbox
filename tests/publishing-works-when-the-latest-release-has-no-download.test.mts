// PUBLISHING MUST WORK WHEN THE LATEST RELEASE CARRIES NO DOWNLOAD FILE.
//
// Found on 2026-10-05 publishing the first signed Agentbox build for agentbox.ac.
// The build was signed, notarised and stapled, and the dry run of
// scripts/publish-download.mjs stopped at once with:
//
//   Could not read the release on Astral-Agent/astral-releases.
//   This needs the gh CLI logged in to an account with write access there.
//
// gh was logged in with push access. The real cause: the latest release there,
// v0.1.6, had no files attached (`"assets":[]`), and the script treated "no
// Astral-arm64.dmg on the latest release" exactly like "gh could not read the
// release". So the one situation that most needs a publish, a website handing out
// nothing, was the one situation that could never be published out of.
//
// liveDownload() keeps the two apart: unreadable output is null (stop), a
// release without the file is a live release with nothing served (carry on).

import { describe, it, expect } from 'vitest';
import { liveDownload } from '../scripts/lib/live-download.mjs';

const ASSET = 'Astral-arm64.dmg';
const dmg = { name: ASSET, size: 217_000_000, updatedAt: '2026-09-02T08:18:34Z', downloadCount: 12 };

describe('reading what the website serves today', () => {
  it('a release with the download file is the live download', () => {
    const live = liveDownload(JSON.stringify({ tagName: 'v0.1.6', assets: [dmg] }), ASSET);
    expect(live).toMatchObject({ tag: 'v0.1.6', size: 217_000_000, missing: false });
  });

  it('a release with no files at all is live with nothing served, not an error', () => {
    const live = liveDownload(JSON.stringify({ tagName: 'v0.1.6', assets: [] }), ASSET);
    expect(live).toMatchObject({ tag: 'v0.1.6', size: 0, missing: true });
  });

  it('a release with other files but not the download is also nothing served', () => {
    const other = { ...dmg, name: 'Agentbox-0.1.6-universal-mac.zip' };
    const live = liveDownload(JSON.stringify({ tagName: 'v0.1.6', assets: [other] }), ASSET);
    expect(live).toMatchObject({ tag: 'v0.1.6', missing: true });
  });

  it('output that cannot be read is still null, so the script stops', () => {
    expect(liveDownload('', ASSET)).toBe(null);
    expect(liveDownload('not json', ASSET)).toBe(null);
    expect(liveDownload(JSON.stringify({ assets: [] }), ASSET)).toBe(null);
  });
});
