// A FRESH FILE REWRITTEN AT THE SAME SIZE IS READ AGAIN.
//
// The version line remembers each file's hash by its size and modified time, so
// a restart does not read every file again. A disk stamps times coarsely: three
// writes of "one", "two", "three" to one path a few milliseconds apart carried
// one time, and the third was taken for the second (seen 2026-11-02 once Files
// got fast enough to look between them). A hash taken while its file was that
// fresh is not trusted again; an older file's still is.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { versionLine } from '../main/version-line.mts';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'racy-'));

describe('the hash a version line remembers', () => {
  it('is taken again for a fresh file whose size and time did not move', async () => {
    const dir = tmp();
    const file = path.join(dir, 'deck.pdf');
    const line = versionLine({ dir: path.join(dir, 'line') });
    // A whole second, so both writes carry exactly one time, as a coarse disk gives them.
    const at = Math.floor(Date.now() / 1000);
    fs.writeFileSync(file, 'one');
    fs.utimesSync(file, at, at);
    const first = await line.hashOf(file);
    fs.writeFileSync(file, 'two');
    fs.utimesSync(file, at, at);
    const second = await line.hashOf(file);
    expect(second.hash).not.toBe(first.hash);
  });

  it('is kept for a file that was already old when it was read', async () => {
    const dir = tmp();
    const file = path.join(dir, 'film.mp4');
    const line = versionLine({ dir: path.join(dir, 'line') });
    fs.writeFileSync(file, 'frames');
    const old = new Date(Date.now() - 3_600_000);
    fs.utimesSync(file, old, old);
    const first = await line.hashOf(file);
    expect(await line.hashOf(file)).toBe(first);
  });
});
