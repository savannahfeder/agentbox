// A FILE BACK FROM THE CLOUD NEVER WRITES OVER A NEWER ONE.
//
// What was wrong (2026-11-14, daily security review): an old film the cloud
// kept came back onto every path it had left, whatever sat there now. An agent
// that rendered a new film at the same path lost it the next time a thread
// started or the plan ended, because the old bytes were renamed over it.
// Measured with a real folder and a cloud in memory: the path held the new
// film, and after the bring-back it held the old one.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { filesKeeper } from '../main/files-cloud.mts';

const DAY = 24 * 60 * 60_000;
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'back-newer-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

async function offTheMac(paths: string[]) {
  const held = new Map<string, Buffer>();
  const storage = {
    async putFile(k: string, f: string) { held.set(k, fs.readFileSync(f)); },
    async getToFile(k: string, f: string) { const b = held.get(k); if (!b) return false; fs.writeFileSync(f, b); return true; },
    async exists(k: string) { return held.has(k); },
    async del(k: string) { held.delete(k); },
  };
  let t = 0;
  const logs: string[] = [];
  const keeper = filesKeeper({ dir: path.join(root, 'keeper'), storage: async () => storage, account: async () => ({ cap: 1e12, bytes: 0, full: false }), settings: () => ({ on: true, offAfterDays: 1 }), now: () => t, log: (m) => logs.push(m) });
  const old = Buffer.from('OLD FILM v1');
  for (const p of paths) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, old); }
  const v = { hash: sha(old), size: old.length, paths, kind: 'film', at: 0, name: 'demo.mp4', movable: true };
  await keeper.pass([v]);
  t = 3 * DAY;
  await keeper.pass([v]);
  expect(keeper.off(v.hash)).toBeTruthy();
  for (const p of paths) expect(fs.existsSync(p)).toBe(false);
  return { keeper, hash: v.hash, logs };
}

describe('bringing a film back from the cloud', () => {
  it('leaves a newer film at its path as it is', async () => {
    const P = path.join(root, 'proj', 'designs', 'demo.mp4');
    const { keeper, hash } = await offTheMac([P]);
    fs.writeFileSync(P, 'NEW FILM v2');
    await keeper.bringBack(hash);
    expect(fs.readFileSync(P, 'utf8')).toBe('NEW FILM v2');
  });

  it('still fills the paths that are free', async () => {
    const P = path.join(root, 'proj', 'designs', 'demo.mp4');
    const Q = path.join(root, 'proj', 'kept', 'demo.mp4');
    const { keeper, hash } = await offTheMac([P, Q]);
    fs.writeFileSync(P, 'NEW FILM v2');
    expect(await keeper.bringBack(hash)).toBe(true);
    expect(fs.readFileSync(P, 'utf8')).toBe('NEW FILM v2');
    expect(fs.readFileSync(Q, 'utf8')).toBe('OLD FILM v1');
  });

  it('and comes back as before when nothing took its place', async () => {
    const P = path.join(root, 'proj', 'designs', 'demo.mp4');
    const { keeper, hash } = await offTheMac([P]);
    expect(await keeper.bringBack(hash)).toBe(true);
    expect(fs.readFileSync(P, 'utf8')).toBe('OLD FILM v1');
    expect(keeper.off(hash)).toBeFalsy();
  });
});
