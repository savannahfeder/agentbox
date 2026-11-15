// ON WINDOWS A FILE SOMETHING IS READING IS STILL REPLACED.
//
// atomicWriteJson, saveCreation's text write, saveConfig, the teammates files
// (writeMethod, writeTeamView) and the cloud config (noteImageCaps,
// writeCloudKey) each write a temporary file and rename it over the real one.
// On Windows that rename fails while another program has the real file open.
// Measured on Windows 11 with Node 24, a file held open by another process
// made fs.renameSync over it throw EPERM, even when the holder shared delete
// access, and the same rename went through once the handle closed. So a save
// made while an antivirus scan or the search indexer had the file open threw.
//
// On win32 replaceFileSync tries again after 15, 30, 60, 120 and 240 ms when
// the rename fails with EPERM, EACCES or EBUSY, then throws the last error.
// Any other error throws at once. It never deletes the target to make room,
// so the old file stays whole until the new one takes its name. A Mac and
// Linux rename once, exactly as before. Every case runs on fakes.

import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { replaceFileSync } from '../main/replace-file.mts';

const failure = (code) => Object.assign(new Error(`${code}: rename`), { code });

afterEach(() => { vi.restoreAllMocks(); });

function fakes(outcomes) {
  const calls = [];
  const pauses = [];
  const rename = (from, to) => {
    calls.push([from, to]);
    const next = outcomes[Math.min(calls.length, outcomes.length) - 1];
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, pauses, rename, pause: (ms) => pauses.push(ms) };
}

describe('replacing a file on Windows', () => {
  it('waits and tries again while something holds the file, then succeeds', () => {
    const f = fakes([failure('EPERM'), failure('EPERM'), undefined]);
    expect(replaceFileSync('a.tmp', 'a.json', { platform: 'win32', ...f })).toBeUndefined();
    expect(f.calls).toEqual([['a.tmp', 'a.json'], ['a.tmp', 'a.json'], ['a.tmp', 'a.json']]);
    expect(f.pauses).toEqual([15, 30]);
  });

  it.each(['EBUSY', 'EACCES'])('tries again on %s', (code) => {
    const f = fakes([failure(code), undefined]);
    replaceFileSync('a.tmp', 'a.json', { platform: 'win32', ...f });
    expect(f.calls).toHaveLength(2);
    expect(f.pauses).toEqual([15]);
  });

  it.each(['ENOENT', 'EXDEV', 'EISDIR'])('throws %s at once, with no wait', (code) => {
    const err = failure(code);
    const f = fakes([err, undefined]);
    expect(() => replaceFileSync('a.tmp', 'a.json', { platform: 'win32', ...f })).toThrow(err);
    expect(f.calls).toHaveLength(1);
    expect(f.pauses).toEqual([]);
  });

  it('throws an error with no code at once', () => {
    const err = new Error('no code');
    const f = fakes([err]);
    expect(() => replaceFileSync('a.tmp', 'a.json', { platform: 'win32', ...f })).toThrow(err);
    expect(f.calls).toHaveLength(1);
  });

  it('gives up after six tries and about half a second, with the last error itself', () => {
    const errors = [failure('EPERM'), failure('EBUSY'), failure('EPERM'), failure('EACCES'), failure('EPERM'), failure('EBUSY')];
    const f = fakes([...errors, undefined]);
    let thrown;
    try { replaceFileSync('a.tmp', 'a.json', { platform: 'win32', ...f }); } catch (err) { thrown = err; }
    expect(thrown).toBe(errors[5]);
    expect(f.calls).toHaveLength(6);
    expect(f.pauses).toEqual([15, 30, 60, 120, 240]);
    expect(f.pauses.reduce((a, b) => a + b, 0)).toBe(465);
  });

  it('stops trying when the error changes to one it does not wait on', () => {
    const err = failure('ENOENT');
    const f = fakes([failure('EPERM'), err, undefined]);
    expect(() => replaceFileSync('a.tmp', 'a.json', { platform: 'win32', ...f })).toThrow(err);
    expect(f.calls).toHaveLength(2);
    expect(f.pauses).toEqual([15]);
  });

  it('really waits when given no pause of its own', () => {
    const f = fakes([failure('EBUSY'), undefined]);
    const started = performance.now();
    replaceFileSync('a.tmp', 'a.json', { platform: 'win32', rename: f.rename });
    const waited = performance.now() - started;
    expect(waited).toBeGreaterThanOrEqual(10);
    expect(waited).toBeLessThan(2000);
  });

  it('passes on what the rename returns', () => {
    const f = fakes(['done']);
    expect(replaceFileSync('a.tmp', 'a.json', { platform: 'win32', ...f })).toBe('done');
  });

  it('never deletes the target or the temporary file', () => {
    const deletes = ['unlinkSync', 'rmSync', 'rmdirSync'].map((name) => vi.spyOn(fs, name).mockImplementation(() => {}));
    const f = fakes([failure('EPERM')]);
    expect(() => replaceFileSync('a.tmp', 'a.json', { platform: 'win32', ...f })).toThrow();
    for (const spy of deletes) expect(spy).not.toHaveBeenCalled();
    expect(f.calls.every(([from, to]) => from === 'a.tmp' && to === 'a.json')).toBe(true);
  });
});

describe.each(['darwin', 'linux'])('replacing a file on %s', (platform) => {
  it('renames once and throws the same error, with no wait', () => {
    for (const code of ['EPERM', 'EBUSY', 'EACCES', 'ENOENT']) {
      const err = failure(code);
      const f = fakes([err, undefined]);
      let thrown;
      try { replaceFileSync('a.tmp', 'a.json', { platform, ...f }); } catch (e) { thrown = e; }
      expect(thrown).toBe(err);
      expect(f.calls).toEqual([['a.tmp', 'a.json']]);
      expect(f.pauses).toEqual([]);
    }
  });

  it('returns what the rename returns', () => {
    const f = fakes(['done']);
    expect(replaceFileSync('a.tmp', 'a.json', { platform, ...f })).toBe('done');
    expect(f.calls).toHaveLength(1);
  });
});
