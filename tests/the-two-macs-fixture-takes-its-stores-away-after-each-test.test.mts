// THE TWO-MACS FIXTURE TAKES ITS STORES AWAY AFTER EACH TEST.
//
// tests/lib/two-macs-over-one-cloud.mts made a carry-* store in the temp
// folder for every Mac and nothing removed it: the four files that use it sign
// their services out and stop there. One 33-file run left 28 of them, about
// 451 MiB. Measured on team-a-file-in-a-thread-says-whether-it-went alone in a
// temp folder of its own: 8 tests passed and 16 carry-* stores were left.
import { it, expect, beforeAll, afterAll, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aMac, createMemoryCloud, signUpMemory } from './lib/two-macs-over-one-cloud.mts';

// os.tmpdir() reads TMPDIR on macOS and Linux, TEMP or TMP on Windows.
const TEMP_VARS = ['TMPDIR', 'TEMP', 'TMP'];
let parent, sibling, was;
const stores = () => fs.readdirSync(parent).filter((n) => n.startsWith('carry-') && path.join(parent, n) !== sibling);
const aMaya = () => { const cloud = createMemoryCloud(); return aMac(cloud, signUpMemory(cloud, { email: 'maya@nw.test', name: 'Maya Chen' })); };

beforeAll(() => {
  parent = fs.mkdtempSync(path.join(os.tmpdir(), 'two-macs-owned-'));
  sibling = path.join(parent, 'carry-not-the-fixtures');
  fs.mkdirSync(sibling);
  fs.writeFileSync(path.join(sibling, 'keep.txt'), 'keep');
  was = Object.fromEntries(TEMP_VARS.map((k) => [k, process.env[k]]));
  for (const k of TEMP_VARS) process.env[k] = parent;
});
afterAll(() => {
  for (const k of TEMP_VARS) { if (was[k] === undefined) delete process.env[k]; else process.env[k] = was[k]; }
  fs.rmSync(parent, { recursive: true, force: true });
});

describe('a test that signs its Mac out afterwards, as the four users of the fixture do', () => {
  let mac, thereAtSignOut;
  beforeEach(async () => { mac = await aMaya(); });
  afterEach(async () => {
    thereAtSignOut = fs.existsSync(mac.storeRoot);
    await mac.service.signOut();
  });

  it('makes its store in the temp folder', () => {
    expect(path.dirname(mac.storeRoot)).toBe(parent);
  });

  it.fails('that fails', () => { throw new Error('the test itself broke'); });

  it('still had its store when it signed out, and none is left after either test', () => {
    expect(thereAtSignOut).toBe(true);
    expect(stores()).toEqual([mac.storeRoot].map((p) => path.basename(p)));
  });
});

describe('a setup that throws after a Mac is made', () => {
  beforeEach(async () => {
    await aMaya();
    throw new Error('setup broke after the first Mac');
  });
  it.fails('fails', () => {});
});

it('a store the test already removed is not an error when the fixture comes for it', async () => {
  const mac = await aMaya();
  await mac.service.signOut();
  fs.rmSync(mac.storeRoot, { recursive: true, force: true });
});

it('leaves no store behind, and the folder beside them stays', () => {
  expect(stores()).toEqual([]);
  expect(fs.readFileSync(path.join(sibling, 'keep.txt'), 'utf8')).toBe('keep');
});
