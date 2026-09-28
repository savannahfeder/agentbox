// A BUILD IS NOT A SHIPMENT, AND THE RELEASE HAS TO SAY SO.
//
// She was right and nothing had gone wrong with the build. `npm run release`
// writes release/*.dmg on her Mac and stops, on purpose. The download button is
// a redirect in landing/vercel.json to a GitHub release asset that no build
// ever touches, so notarising could not have changed what she downloaded.
// Measured that night: the asset the button served was 135,629,579 bytes,
// uploaded 2026-08-21T19:02:20Z, with an app.asar packed 2026-08-21 11:23.
//
// The header of scripts/release.mjs had always said this. A header is not where
// anybody looks at the end of a ten-minute build, and the LAST thing it printed
// was "It opens with no warning on a Mac that has never seen it", which reads
// like a shipment. So the last thing it prints now is what the website is
// actually serving and the one command that changes it. These tests pin that,
// and pin that publishing stays a separate deliberate act.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const release = read('scripts/release.mjs');
const publish = read('scripts/publish-download.mjs');
// The landing page is not in this repo. Its `/download` is a redirect in
// landing/vercel.json in the product's own folder, and it points at
//   github.com/Astral-Agent/astral-releases/releases/latest/download/Astral-arm64.dmg
// Read there and confirmed live on 2026-08-23 by following astral.ac/download.
// Pinned here because the publish script has to write to that exact asset, and
// a repo or filename that drifts from it uploads to somewhere nobody reads.
describe('where the download actually comes from', () => {
  it('is the asset the publish script writes to', () => {
    expect(publish).toContain("const REPO = 'Astral-Agent/astral-releases'");
    expect(publish).toContain("const ASSET = 'Astral-arm64.dmg'");
    expect(publish).toContain("const DOWNLOAD = 'https://astral.ac/download'");
  });
});

describe('the end of a release', () => {
  it('says the website is not updated', () => {
    expect(release).toContain('THE WEBSITE IS NOT UPDATED');
  });

  it('names the one command that would update it', () => {
    expect(release).toContain('scripts/publish-download.mjs');
    expect(release).toContain('--publish');
  });

  // The whole point is that this line is the LAST thing on the screen, under
  // the sentence about a stranger's Mac that reads like a finished shipment.
  it('prints it after the line that says the dmg is notarised', () => {
    expect(release.indexOf('THE WEBSITE IS NOT UPDATED'))
      .toBeGreaterThan(release.indexOf('is signed, notarised and stapled'));
  });

  // A release must not be reported as broken because a laptop was off the
  // network, so reading the live asset is best effort and the sentence is
  // printed either way.
  // It measured the distance in characters (a 600-byte window back from the
  // sentence) and broke on 2026-08-28 when two more checks were added above it,
  // having found nothing wrong. The subject is "the read is best effort and the
  // sentence prints either way", so it is asked that way now: the whole block
  // from where `serving` is declared, which cannot drift.
  it('still says it when the live asset cannot be read', () => {
    const block = release.slice(release.indexOf('let serving = null'));
    expect(block).toContain('catch');
    expect(block).toContain('THE WEBSITE IS NOT UPDATED');
    // The sentence is printed outside the `if (serving)`, so a laptop off the
    // network still gets told the website did not change.
    expect(block).toContain('astral.ac/download is handing out whatever was last uploaded');
  });
});

describe('publishing', () => {
  // WHAT THIS ASSERTION USED TO SAY, AND WHY IT SAYS THE OPPOSITE NOW
  // (w-86452550e5, 2026-08-28). It used to require that `'--publish'` appear
  // NOWHERE in the release script, on the reasoning that a build with no publish
  // flag cannot publish. That reasoning stopped holding the moment package.json
  // gained a `build.publish` block, which it needs so the APP can find its own
  // updates: electron-builder's DEFAULT policy is `onTagOrDraft`, so from that
  // moment a build could upload itself with no flag at all. The absence the old
  // test checked for became the danger rather than the safety. So the flag is
  // now required to be there, and required to be `never`.
  it('is never done by a build, and now says so explicitly', () => {
    expect(release).not.toContain('gh release upload');
    expect(release).toContain("'--publish', 'never'");
  });

  it('uploads nothing without --publish, and exits before it could', () => {
    expect(publish).toContain('Nothing was uploaded. This was the dry run.');
    expect(publish.indexOf('Nothing was uploaded'))
      .toBeLessThan(publish.indexOf("'release', 'upload'"));
  });

  // NEVER DELETE THE OLD ONE FIRST. A delete-then-upload leaves the download
  // button 404ing for as long as a 150 MB upload takes.
  it('replaces the asset in place and never deletes it', () => {
    expect(publish).toContain("'--clobber'");
    expect(publish).not.toContain("'release', 'delete-asset'");
  });

  // A green upload log is not a published file (measured on this product more
  // than once), so the last step fetches the download and compares md5.
  it('proves it by downloading the file it just uploaded', () => {
    expect(publish).toContain('https://astral.ac/download');
    expect(publish).toContain('got !== mine');
  });

  it('refuses a dmg Gatekeeper would warn about', () => {
    expect(publish).toContain("'--assess'");
    expect(publish).toContain('Gatekeeper would warn about this dmg');
  });

  it('refuses a bundle that came out far smaller than the published one', () => {
    expect(publish).toContain('live.size * 0.8');
  });

  it('refuses to publish an older dmg while a newer one sits beside it', () => {
    expect(publish).toContain('is newer than the file you named');
  });
});

// THE ONE THAT ALREADY BIT, ON THE FIRST REAL PUBLISH (2026-08-23 05:2x).
//
// `gh release upload TAG "file#Astral-arm64.dmg"` looks like it renames the
// asset and does not: the part after the # is the LABEL, and the asset's NAME
// is the file's basename. So the first run uploaded a brand new asset called
// Astral-0.1.0-arm64.dmg, left Astral-arm64.dmg untouched, and reported
// success. astral.ac went on handing out the 21 August app.
//
// The download-back check caught it, which is the entire reason it exists. What
// is pinned here is the fix: the file is staged under the asset's real name
// before it goes up, so the name can never come from the build's filename.
describe('the name the asset goes up under', () => {
  it('comes from a file staged under that exact name, not from a # label', () => {
    expect(publish).toContain("const staged = path.join(releaseDir, ASSET);");
    // The dmg still goes up first and still goes up staged. What is new beside
    // it is the zip and the feed, which are uploaded under their own real names
    // because latest-mac.yml refers to the zip by that name and a rename would
    // break every update (w-86452550e5).
    expect(publish).toContain("'release', 'upload', tag, staged, zip, feedPath, '--clobber'");
    // The # form is what failed. It may not come back.
    expect(publish).not.toContain('#${ASSET}');
  });

  // The `finally` this used to pin is gone, replaced by a named `cleanup()`
  // called on every path out, because there are now three ways to leave this
  // section (release create failed, upload failed, upload succeeded) and a
  // single try/finally could no longer wrap them all.
  it('leaves nothing behind under the asset name', () => {
    const at = publish.indexOf('const staged =');
    const after = publish.slice(at);
    expect(after).toContain('const cleanup = () => fs.rmSync(staged, { force: true });');
    // Every exit from the upload section calls it: the two failures and the
    // success. If a fourth exit is ever added, this count is what notices.
    expect(after.match(/cleanup\(\);/g).length).toBeGreaterThanOrEqual(3);
  });

  it('does not let that staged file trip the newest-dmg guard', () => {
    expect(publish).toContain("f.endsWith('.dmg') && f !== ASSET");
  });
});
