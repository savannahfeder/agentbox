// THE SUPERVISOR'S SAVED STATE STAYS SMALL, AND AN UNCHANGED SAVE WRITES NOTHING.
//
// macOS flagged the app for 137 GB of disk writes in 6.6 hours (5.8 MB/s). On
// the live app the writes came in 11-17 MB bursts, and `.zero-supervisor.json`
// was written 20 times in 40 s, 34 MB in all: a 2.4 MB file, 2.0 MB of it
// `nativeCommands`, the same ~1.6 KB list of slash commands kept again for each
// of 1,164 threads, rewritten whole on every save, often with nothing changed.
// Now each distinct list is written once and threads point at it, and a save
// whose text matches the last one written is skipped.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor, packCommands, unpackCommands } from '../main/supervisor.mts';

const LIST = Array.from({ length: 60 }, (_, i) => `plugin-${i}:command-${i}`);

describe('each list of commands is kept once', () => {
  it('threads that share a list point at one copy, and unpack to what they had', () => {
    const had = { 'w-1': LIST, 'w-2': [...LIST], 'w-3': ['review', 'init'], 'w-4': [] };
    const packed = packCommands(had);
    expect(packed.nativeCommandLists).toHaveLength(3);
    expect(unpackCommands(packed)).toEqual(had);
  });

  it('a file saved before this, with a list on every thread, still loads', () => {
    expect(unpackCommands({ nativeCommands: { 'w-1': ['review'] } })).toEqual({ 'w-1': ['review'] });
  });

  it('a pointer to a list that is not there is dropped, not turned into nothing', () => {
    expect(unpackCommands({ nativeCommandLists: [['review']], nativeCommands: { 'w-1': 0, 'w-2': 7 } })).toEqual({ 'w-1': ['review'] });
  });

  it('no saved commands is none', () => {
    expect(unpackCommands({})).toEqual({});
  });
});

describe('on disk', () => {
  let tmp;
  const make = () => new Supervisor({ storeRoot: tmp, home: tmp }, { listItems: () => [], listProducts: () => [], isDue: () => true }, tmp);
  const file = () => path.join(tmp, '.zero-supervisor.json');
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-saved-state-')); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('500 threads with the same commands cost a few kilobytes, and come back after a restart', () => {
    const sup = make();
    sup._nativeCommands = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`w-${i}`, LIST]));
    sup._saveState();
    expect(fs.statSync(file()).size).toBeLessThan(30_000);
    expect(make()._nativeCommands['w-499']).toEqual(LIST);
  });

  it('a save with nothing changed does not touch the file; a change does', () => {
    const sup = make();
    sup._nativeCommands = { 'w-1': LIST };
    sup._saveState();
    const old = new Date('2020-01-01T00:00:00Z');
    fs.utimesSync(file(), old, old);
    sup._saveState();
    expect(fs.statSync(file()).mtimeMs).toBe(old.getTime());
    sup._nativeCommands['w-2'] = ['review'];
    sup._saveState();
    expect(fs.statSync(file()).mtimeMs).toBeGreaterThan(old.getTime());
    expect(make()._nativeCommands['w-2']).toEqual(['review']);
  });
});
