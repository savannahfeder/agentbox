// A BIG FILE THAT COULD NOT BE OPENED STAYED "COMING" FOR EVER.
//
// A file over 10 MB goes up in parts, and its first open was outside the
// upload's try. A file that can be stat'ed but not opened (EACCES) rejected
// the upload before its `finally` ran, so it was never done: every send after
// answered "still working", and the sender's tile said coming, 0 done, for
// good. Measured with the carrier's own fs option refusing the open.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFileCarrier } from '../main/team/carry-files.mts';
import { MAX_CARRIED_BYTES } from '../shared/carried-files.mts';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unopenable-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

function carrier(openSync: typeof fs.openSync) {
  const file = path.join(dir, 'cut.mp4');
  const refusing = new Proxy(fs, { get: (t, k) => (k === 'openSync' ? openSync : Reflect.get(t, k)) });
  const sent: string[] = [];
  const c = createFileCarrier({
    dir,
    has: async () => [], put: async () => {}, get: async () => null,
    putPiece: async (name: string) => { sent.push(name); },
    find: () => ({ file, size: MAX_CARRIED_BYTES + 1, root: dir }),
    fs: refusing,
    sleep: async () => {}, retryMs: [0, 0],
  });
  return { c, sent };
}

describe('a file over 10 MB that cannot be opened', () => {
  it('ends as failed, not still working', async () => {
    const { c } = carrier(() => { throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }); });
    const first = await c.send('cut.mp4', { meant: true });
    // Not settled(): with the bug it spins for ever and the test never ends.
    await new Promise((r) => setTimeout(r, 50));
    const answer = first.failed ? first : await c.send('cut.mp4', { meant: true });
    expect(answer).toEqual({ sent: true, failed: true });
  });

  it('still goes up when it can be opened', async () => {
    fs.writeFileSync(path.join(dir, 'cut.mp4'), Buffer.alloc(MAX_CARRIED_BYTES + 1, 1));
    const { c, sent } = carrier(fs.openSync);
    await c.send('cut.mp4', { meant: true });
    await c.settled();
    const done = await c.send('cut.mp4', { meant: true });
    expect(done.sent).toBe(true);
    expect('failed' in done).toBe(false);
    expect(sent.length).toBeGreaterThan(1);
  });
});
