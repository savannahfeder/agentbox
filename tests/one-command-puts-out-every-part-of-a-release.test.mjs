// 2026-10-26, in their words: "quite often I'll ask the agent for the build
// steps, it'll return them, and then for some reason it doesn't work in a
// dozen ways... it's best for this to be a simpler process that we
// consistently get right, so it's not pushing the wrong version."
//
// Measured on the 0.1.17 release that day. Putting one version out took four
// commands from three scripts, with the Apple password pasted into each one,
// and it still went wrong:
//   - npm was signed out, which nothing found until the publish ran
//   - the cloud server's setup stopped at "run scripts/cloud-setup.mjs first",
//     because its AWS details had moved to ~/.agentbox/cloud.own-aws.json the
//     day before. The answer was to point the script at that file, and the
//     step handed over said the file was missing from the Mac.
//   - the release ended with "THE WEBSITE IS NOT UPDATED", which read as a
//     failure in the middle of a run that was going fine
//   - a version already on the website had to be bumped by hand first
//     (2026-10-13 and 2026-10-25)
//
// `npm run deploy` is now the whole release, and these tests hold its rules.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextVersion, serverConfig, whatIsLive } from '../scripts/lib/deploy-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('the version a deploy puts out', () => {
  it("is main's own number when nothing has used it", () => {
    expect(nextVersion('0.1.18', ['0.1.17', '0.1.16'])).toBe('0.1.18');
  });

  it("is the next one after the newest release when main's number is taken", () => {
    expect(nextVersion('0.1.17', ['0.1.17', '0.1.16'])).toBe('0.1.18');
  });

  it('goes past a number that only npm has', () => {
    expect(nextVersion('0.1.17', ['0.1.16', '0.1.17'])).toBe('0.1.18');
    expect(nextVersion('0.1.17', ['0.1.18'])).toBe('0.1.19');
  });

  it("never goes backwards when main's number is behind what is out", () => {
    expect(nextVersion('0.1.15', ['0.1.17', '0.1.16'])).toBe('0.1.18');
  });

  it('compares numbers as numbers, so 0.1.10 is newer than 0.1.9', () => {
    expect(nextVersion('0.1.9', ['0.1.10', '0.1.9'])).toBe('0.1.11');
    expect(nextVersion('0.1.11', ['0.1.10', '0.1.9'])).toBe('0.1.11');
  });

  it('takes tags with or without the v', () => {
    expect(nextVersion('0.1.17', ['v0.1.17'])).toBe('0.1.18');
  });

  it('is main\'s number when nothing has been released at all', () => {
    expect(nextVersion('0.2.0', [])).toBe('0.2.0');
  });
});

describe('which settings file the cloud server is deployed from', () => {
  const home = '/h/.agentbox';

  it('is the one with the AWS bucket in it, not the one with only the address', () => {
    expect(serverConfig({
      [`${home}/cloud.json`]: { gateway: 'https://x' },
      [`${home}/cloud.own-aws.json`]: { region: 'us-east-1', bucket: 'b', runtimeArn: 'r' },
    })).toBe(`${home}/cloud.own-aws.json`);
  });

  it('is cloud.json when that one has the bucket', () => {
    expect(serverConfig({
      [`${home}/cloud.json`]: { region: 'us-east-1', bucket: 'b', runtimeArn: 'r' },
      [`${home}/cloud.own-aws.json`]: { region: 'us-east-1', bucket: 'b2', runtimeArn: 'r2' },
    })).toBe(`${home}/cloud.json`);
  });

  it('is nothing when no file names a bucket, so the deploy stops instead of making a second cloud', () => {
    expect(serverConfig({ [`${home}/cloud.json`]: { gateway: 'https://x' } })).toBeNull();
    expect(serverConfig({})).toBeNull();
  });
});

describe('what the deploy says is live at the end', () => {
  const started = Date.parse('2026-10-26T20:00:00Z');
  const all = {
    version: '0.1.18', startedAt: started,
    npm: '0.1.18', download: 'v0.1.18', feed: '0.1.18', server: '2026-10-26T20:20:00.000+0000',
  };

  it('is every part, when every part says the new version', () => {
    expect(whatIsLive(all).every((l) => l.ok)).toBe(true);
  });

  it('names the one part still on the old version', () => {
    const lines = whatIsLive({ ...all, feed: '0.1.17' });
    expect(lines.filter((l) => !l.ok).map((l) => l.part)).toEqual(['update feed']);
  });

  it('does not count a server last deployed before this run started', () => {
    const lines = whatIsLive({ ...all, server: '2026-10-26T04:33:14.000+0000' });
    expect(lines.find((l) => l.part === 'cloud server').ok).toBe(false);
  });

  it('does not count a part it could not read', () => {
    const lines = whatIsLive({ ...all, npm: null });
    expect(lines.find((l) => l.part === 'npm').ok).toBe(false);
  });
});

describe('the deploy script', () => {
  const deploy = read('scripts/deploy.mjs');
  const release = read('scripts/release.mjs');

  it('is what npm run deploy runs', () => {
    expect(JSON.parse(read('package.json')).scripts.deploy).toBe('node scripts/deploy.mjs');
  });

  // The Mac build first: it is slow and the likeliest to fail, and until it is
  // done nothing public has changed, so a failure is fixed by running it again.
  it('runs the Mac build, npm, the download and the cloud server, in that order', () => {
    const at = (s) => deploy.indexOf(s);
    for (const s of ["'scripts/release.mjs'", "['publish']", "'scripts/publish-download.mjs'", "'scripts/cloud-gateway-setup.mjs'"]) {
      expect(at(s), s).toBeGreaterThan(-1);
    }
    expect(at("'scripts/release.mjs'")).toBeLessThan(at("['publish']"));
    expect(at("['publish']")).toBeLessThan(at("'scripts/publish-download.mjs'"));
    expect(at("'scripts/publish-download.mjs'")).toBeLessThan(at("'scripts/cloud-gateway-setup.mjs'"));
  });

  // w-6771163ced: file delivery reached main on 2026-10-28 and no cloud run
  // could use it, because the image those runs start from was last built on
  // 2026-10-25 and nothing in a release rebuilt it.
  it('rebuilds the cloud machine\'s image before the cloud server, against the same AWS settings', () => {
    const at = (s) => deploy.indexOf(s);
    expect(at("'scripts/cloud-setup.mjs'")).toBeGreaterThan(at("'scripts/publish-download.mjs'"));
    expect(at("'scripts/cloud-setup.mjs'")).toBeLessThan(at("'scripts/cloud-gateway-setup.mjs'"));
    expect(deploy).toMatch(/live\('node', \['scripts\/cloud-setup\.mjs'\], \{ AGENTBOX_CLOUD_CONFIG: serverFile \}\)/);
  });

  it('never handles the Apple password: Apple\'s own tool keeps it in the Keychain', () => {
    expect(deploy).not.toMatch(/APPLE_APP_SPECIFIC_PASSWORD\s*[:=]/);
    expect(deploy).toMatch(/delete appleEnv\.APPLE_APP_SPECIFIC_PASSWORD/);
    expect(deploy).toMatch(/notarytool', 'store-credentials'/);
    expect(deploy).toMatch(/APPLE_KEYCHAIN_PROFILE/);
  });

  it('builds the commit it checked, even when main moves during the run', () => {
    expect(deploy).toMatch(/AGENTBOX_RELEASE_COMMIT/);
    expect(release).toMatch(/AGENTBOX_RELEASE_COMMIT/);
  });
});

describe('the Mac build, signed with a saved Keychain entry', () => {
  const release = read('scripts/release.mjs');

  it('takes a Keychain profile in place of the Apple ID and password', () => {
    expect(release).toMatch(/process\.env\.APPLE_KEYCHAIN_PROFILE/);
    expect(release).toMatch(/'--keychain-profile'/);
  });

  it('still takes the three Apple values when there is no profile', () => {
    expect(release).toMatch(/'--apple-id', process\.env\.APPLE_ID/);
  });
});
