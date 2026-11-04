// A FILE THAT HAS ARRIVED NO LONGER SAYS "ON ITS WAY".
//
// Maya: a film played inline while the line under it said "On its
// way" for minutes and never changed. Seen again on 2026-10-30 with an agent's
// 300 KB film: on Maya's disk, playing, captioned "On its way". Measured: the
// reader notes every file a teammate's words name as expected, and a small
// attachment lands by the ordinary path without clearing that note, so the
// finder found the file and still handed back "coming".
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveArtifact } from '../main/artifact-path.mjs';
import { shelve } from '../main/team/carried-shelf.mjs';

let dir, products;
beforeEach(() => {
  dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'arrived-')), 'direct-1');
  fs.mkdirSync(dir, { recursive: true });
  products = [{ slug: 'direct-1', name: 'Sofia', dir, team: { direct: true, projectId: 'p' } }];
  shelve(dir, [{ ref: 'attachments/k-launch-cut-v3.mp4', expecting: true, by: 'p-sofia', at: Date.now() }]);
});
afterEach(() => fs.rmSync(path.dirname(dir), { recursive: true, force: true }));
const open = () => resolveArtifact({ src: 'attachments/k-launch-cut-v3.mp4', product: 'direct-1', products });

describe('a teammate\'s attachment', () => {
  it('once it is on disk, opens with nothing said under it', async () => {
    fs.mkdirSync(path.join(dir, 'attachments'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'attachments', 'k-launch-cut-v3.mp4'), 'film');
    const r = await open();
    expect(r.ok).toBe(true);
    expect(r.carry).toBeUndefined();
  });

  it('before it lands, is still on its way', async () => {
    const r = await open();
    expect(r.ok).toBe(false);
    expect(r.coming).toBe(true);
    expect(r.carry?.state).toBe('coming');
  });
});
