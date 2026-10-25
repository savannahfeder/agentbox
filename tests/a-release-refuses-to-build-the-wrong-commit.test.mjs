// 2026-10-13, after half a day lost to it: "I've spent half the day trying to
// deploy this. What's been going wrong? This is something we really need to
// fix."
//
// WHAT WENT WRONG. The app folder is the one the app runs from and it follows
// the public main on its own — except it had fallen nine commits behind. Two
// releases were built in it, each taking a quarter of an hour of signing and
// notarising, and each came out as the version that was already on the website
// carrying code from that morning. Nothing in the build said a word about it:
// it signed and notarised the wrong commit as happily as the right one.
//
// So the build now asks two questions before it starts, and both are cheap:
// is this checkout behind origin/main, and is this version already released.
// Either one stops it, by name, before a minute is spent.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { whyNotToRelease } from '../scripts/lib/ship-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = fs.readFileSync(path.join(root, 'scripts/release.mjs'), 'utf8');

const ok = { behind: 0, version: '0.1.14', released: ['v0.1.13', 'v0.1.12'] };

describe('what a release refuses to build', () => {
  it('builds when the checkout is current and the version is new', () => {
    expect(whyNotToRelease(ok)).toEqual([]);
  });

  it('refuses a checkout behind the public main, and says how far', () => {
    const said = whyNotToRelease({ ...ok, behind: 9 });
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('9');
    expect(said[0]).toMatch(/behind/i);
  });

  it('refuses one commit behind as surely as nine', () => {
    expect(whyNotToRelease({ ...ok, behind: 1 })).toHaveLength(1);
  });

  it('refuses a version that is already on the website', () => {
    const said = whyNotToRelease({ ...ok, version: '0.1.13' });
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('0.1.13');
  });

  it('says both when both are true, so one fix does not uncover the other', () => {
    expect(whyNotToRelease({ behind: 9, version: '0.1.13', released: ['v0.1.13'] })).toHaveLength(2);
  });

  it('is quiet when it could not find out, rather than guessing', () => {
    // no network, no tags read: a build on a plane is not a build of the wrong
    // commit, and refusing one would be its own kind of wasted evening.
    expect(whyNotToRelease({ behind: null, version: '0.1.14', released: null })).toEqual([]);
    expect(whyNotToRelease({})).toEqual([]);
  });

  it('is asked before anything is built, not after', () => {
    expect(release).toContain('whyNotToRelease({');
    const asked = release.indexOf('whyNotToRelease({');
    const built = release.indexOf("spawnSync('npx', ['electron-builder'");
    expect(built).toBeGreaterThan(0);
    expect(asked).toBeLessThan(built);
  });

  it('names the folder it ran in, which is the thing nobody checks', () => {
    expect(release).toContain('The folder this ran in is');
  });
});
