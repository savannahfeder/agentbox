// CLOUD RUNS FINISHING TOGETHER BRING THEIR WORK HOME TWO AT A TIME.
//
// What broke (2026-10-16, her Mac overloaded with every thread set to the
// cloud): read off main/cloud/run.mjs on 2026-10-17, every cloud run's process
// on this Mac brought its work home on its own as soon as it ended, holding
// both its commit bundles, every transcript archive and its whole event log in
// memory, so twenty runs ending together unpacked twenty of each at once.
//
// Now at most two runs bring their work home at a time, across every process
// on this Mac, and the downloads go to files instead of memory. A slot whose
// holder has died is free.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { takeImportSlot } from '../main/cloud/run.mjs';

const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });
const slotsDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'import-slots-')); dirs.push(d); return d; };

describe('bringing cloud work home', () => {
  it('lets two runs in and holds the third until one is done', async () => {
    const dir = slotsDir();
    const a = await takeImportSlot({ dir, everyMs: 10 });
    const b = await takeImportSlot({ dir, everyMs: 10 });
    let third = false;
    const c = takeImportSlot({ dir, everyMs: 10 }).then((release) => { third = true; return release; });
    await new Promise((r) => setTimeout(r, 100));
    expect(third).toBe(false);
    a();
    const release = await c;
    expect(third).toBe(true);
    b(); release();
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('takes the slot of a run whose process has died', async () => {
    const dir = slotsDir();
    const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout;
    fs.writeFileSync(path.join(dir, 'slot-0'), dead);
    fs.writeFileSync(path.join(dir, 'slot-1'), dead);
    const release = await Promise.race([takeImportSlot({ dir, everyMs: 10 }), new Promise((r) => setTimeout(() => r(null), 2000))]);
    expect(release).toBeTypeOf('function');
    release();
  });

  it('frees a slot nobody has touched for ten minutes, and one left empty by a crash', async () => {
    const dir = slotsDir();
    fs.writeFileSync(path.join(dir, 'slot-0'), `${process.pid}:someone-else`);
    const old = new Date(Date.now() - 11 * 60_000);
    fs.utimesSync(path.join(dir, 'slot-0'), old, old);
    fs.writeFileSync(path.join(dir, 'slot-1'), '');
    const a = await Promise.race([takeImportSlot({ dir, everyMs: 10 }), new Promise((r) => setTimeout(() => r(null), 2000))]);
    const b = await Promise.race([takeImportSlot({ dir, everyMs: 10 }), new Promise((r) => setTimeout(() => r(null), 2000))]);
    expect([typeof a, typeof b]).toEqual(['function', 'function']);
    a(); b();
  });

  it('frees its slot however the import ends', () => {
    const src = fs.readFileSync(new URL('../main/cloud/run.mjs', import.meta.url), 'utf8');
    const at = src.indexOf('const release = await takeImportSlot();');
    const tail = src.slice(at, at + 700);
    expect(tail.indexOf('try {')).toBeLessThan(tail.indexOf('mkdtempSync'));
    expect(tail).toMatch(/} finally {\s*release\(\);/);
  });

  it('downloads its bundles and transcripts to files, not into memory', () => {
    const src = fs.readFileSync(new URL('../main/cloud/run.mjs', import.meta.url), 'utf8');
    const home = src.slice(src.indexOf('async function layHome('), src.indexOf('function layArchive('));
    expect(home).toMatch(/fetchToFile\(storage, k\(name\), f\)/);
    expect(home).toMatch(/fetchToFile\(storage, k\(b\.name\), file\)/);
    expect(home).toMatch(/fetchToFile\(storage, k\('events\.jsonl'\), logFile\)/);
    expect(home).not.toMatch(/storage\.get\(k\(name\)\)|storage\.get\(k\(b\.name\)\)|storage\.get\(k\('events\.jsonl'\)\)/);
  });
});
