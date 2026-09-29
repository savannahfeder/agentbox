// The app should say when it is not the app on disk.
//
// Three times in two days a fix was written, tested, pushed, and not running:
// Electron reads main/*.mjs once at boot, so the process kept serving code that
// had been replaced beneath it.
//
// ⌘R does not help and can hurt: it reloads the renderer against the old main
// process, so new UI can call an IPC handler that is not there and fail in
// silence. Only a restart is a fix, and the app now says so.

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { changedSinceBoot, restartNeeded, _resetCacheForTests } from '../main/staleness.mjs';

const BOOT = 1_786_000_000_000;

describe('the rule', () => {
  it('names a main-process file written after the process read it', () => {
    expect(changedSinceBoot(BOOT, [
      { name: 'main/supervisor.mjs', mtimeMs: BOOT + 60_000 },
      { name: 'main/ipc.mjs', mtimeMs: BOOT - 60_000 },
    ])).toEqual(['main/supervisor.mjs']);
  });

  it('says nothing when the running app IS the app on disk', () => {
    expect(changedSinceBoot(BOOT, [
      { name: 'main/supervisor.mjs', mtimeMs: BOOT - 1 },
      { name: 'preload.cjs', mtimeMs: BOOT - 90_000 },
    ])).toEqual([]);
  });

  it('puts the most recently changed file first, so the list leads with the news', () => {
    expect(changedSinceBoot(BOOT, [
      { name: 'main/ipc.mjs', mtimeMs: BOOT + 10 },
      { name: 'preload.cjs', mtimeMs: BOOT + 9_000 },
      { name: 'main/supervisor.mjs', mtimeMs: BOOT + 500 },
    ])).toEqual(['preload.cjs', 'main/supervisor.mjs', 'main/ipc.mjs']);
  });

  it('ignores a file whose mtime cannot be read rather than calling it stale', () => {
    expect(changedSinceBoot(BOOT, [{ name: 'main/gone.mjs', mtimeMs: NaN }])).toEqual([]);
  });
});

describe('against a real directory', () => {
  let dir;
  beforeEach(() => {
    _resetCacheForTests();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-stale-'));
    fs.mkdirSync(path.join(dir, 'main'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'shared'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'main', 'supervisor.mjs'), '// code');
    fs.writeFileSync(path.join(dir, 'preload.cjs'), '// bridge');
  });

  it('is quiet for an app that booted after its files were written', () => {
    const bootedAt = Date.now() + 60_000; // booted "after" everything on disk
    expect(restartNeeded(dir, bootedAt)).toBeNull();
  });

  it('reports the files, and when the running process was read', () => {
    const bootedAt = Date.now() - 60_000; // the files were written after boot
    const verdict = restartNeeded(dir, bootedAt);
    expect(verdict).not.toBeNull();
    expect(verdict.files).toContain('main/supervisor.mjs');
    expect(verdict.files).toContain('preload.cjs');
    expect(verdict.since).toBe(bootedAt);
  });

  it('watches main and shared, and NOT the renderer', () => {
    // The renderer reloads with ⌘R, so it is never what a restart is for, and
    // listing it would cry wolf on every rebuild.
    fs.mkdirSync(path.join(dir, 'renderer', 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'renderer', 'src', 'App.tsx'), '// ui');
    fs.writeFileSync(path.join(dir, 'shared', 'rank.mjs'), '// shared');
    _resetCacheForTests();
    const verdict = restartNeeded(dir, Date.now() - 60_000);
    expect(verdict.files).toContain('shared/rank.mjs');
    expect(verdict.files.some((f) => f.includes('App.tsx'))).toBe(false);
  });

  it('does not walk the disk on every snapshot', () => {
    const bootedAt = Date.now() - 60_000;
    const first = restartNeeded(dir, bootedAt);
    fs.writeFileSync(path.join(dir, 'main', 'brand-new.mjs'), '// later');
    expect(restartNeeded(dir, bootedAt)).toBe(first); // same object: served from cache
    _resetCacheForTests();
    expect(restartNeeded(dir, bootedAt).files).toContain('main/brand-new.mjs');
  });
});
