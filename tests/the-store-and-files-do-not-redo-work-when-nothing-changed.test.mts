// THE STORE AND FILES DO NOT REDO WORK WHEN NOTHING CHANGED.
//
// What broke (w-8918e86ce0, 2026-11-08): the Mac's freeze log put the store's
// folder lookup in a week's worth of stalls (machineryPath in about 1,290 s of
// them, ensureMachineryDir 1,230 s, readOrigin 950 s), and the owner said the
// app throttles "when I'm dealing with artifacts". Measured on a synthetic
// store of 1,500 threads naming 4 files each, set up the way the app runs:
//   - every ledger lookup read `.origin`, made the folder, read `.origin`
//     again and looked for five strays: 10,000 lookups took 760 ms;
//   - recording each file's version threw the whole version line's fold away,
//     so opening Files the first time refolded it once per file: 13.6 s.
// Now a folder `.origin` has decided is kept, the sweep runs again only when
// the product folder's modified time has moved (10,000 lookups: 172 ms), and a
// recorded version is folded onto what was folded (Files first open: 2.4 s).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { foldLine, foldOnto } from '../shared/version-line.mts';
import { ensureMachineryDir, machineryDir, machineryPath } from '../main/store/home.mts';

describe('a version folded on', () => {
  const hash = (n) => n.toString(16).padStart(64, '0');
  const file = (n) => n.toString(16).padStart(40, 'a');

  it('gives exactly what folding every entry again gives, conflicts included', () => {
    const entries = [];
    for (let i = 0; i < 400; i++) {
      // Repeated numbers and repeated bytes on the same file must lose, as in a full fold.
      entries.push({ file: file(i % 23), n: 1 + (i % 7), hash: hash(i % 31), name: null, by: null, at: i });
    }
    entries.push({ file: 'not an id', n: 1, hash: hash(1) });
    const step = new Map();
    for (const e of entries) foldOnto(step, e);
    expect([...step].sort()).toEqual([...foldLine(entries)].sort());
  });

  it('leaves a line it was already handed unchanged when the entry conflicts', () => {
    const folded = foldLine([{ file: file(1), n: 1, hash: hash(1) }]);
    const before = folded.get(file(1));
    foldOnto(folded, { file: file(1), n: 1, hash: hash(2) });
    foldOnto(folded, { file: file(1), n: 2, hash: hash(1) });
    expect(folded.get(file(1))).toBe(before);
    foldOnto(folded, { file: file(1), n: 2, hash: hash(2) });
    expect(folded.get(file(1)).map((v) => v.n)).toEqual([1, 2]);
  });
});

describe("a project's ledger folder", () => {
  let tmp, home, product;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-folder-'));
    home = path.join(tmp, 'home');
    product = path.join(tmp, 'accounts', 'a', 'acme');
    fs.mkdirSync(product, { recursive: true });
  });
  afterEach(() => { vi.restoreAllMocks(); fs.rmSync(tmp, { recursive: true, force: true }); });

  it('is found without reading or writing the disk again once nothing has moved', () => {
    // A folder changed in the last moments is swept every time (the next test
    // but one), so this one is a folder nobody has touched for an hour.
    const hourAgo = new Date(Date.now() - 3_600_000);
    fs.utimesSync(product, hourAgo, hourAgo);
    const first = machineryPath(product, 'work-items.jsonl', home);
    // The first lookup wrote `.origin`; the next reads it once and keeps the answer.
    machineryPath(product, 'work-items.jsonl', home);
    const reads = vi.spyOn(fs, 'readFileSync');
    const makes = vi.spyOn(fs, 'mkdirSync');
    const stats = vi.spyOn(fs, 'statSync');
    for (let i = 0; i < 100; i++) expect(machineryPath(product, 'work-items.jsonl', home)).toBe(first);
    expect(reads).not.toHaveBeenCalled();
    expect(makes).not.toHaveBeenCalled();
    // One look at the product folder's time per lookup, not one per name of ours.
    expect(stats.mock.calls.length).toBeLessThanOrEqual(100);
  });

  it('still carries in a file of ours that turns up in the product folder later, at once or after an hour', () => {
    machineryPath(product, 'work-items.jsonl', home);
    // Landing in the same moment as the sweep, which a coarse clock may not tell apart.
    fs.writeFileSync(path.join(product, 'repeats.jsonl'), '{"late":true}\n');
    expect(fs.existsSync(path.join(ensureMachineryDir(product, home), 'repeats.jsonl'))).toBe(true);
    fs.rmSync(path.join(ensureMachineryDir(product, home), 'repeats.jsonl'));
    const hourAgo = new Date(Date.now() - 3_600_000);
    fs.utimesSync(product, hourAgo, hourAgo);
    machineryPath(product, 'work-items.jsonl', home);
    fs.writeFileSync(path.join(product, 'repeats.jsonl'), '{"late":true}\n');
    const dir = ensureMachineryDir(product, home);
    expect(fs.existsSync(path.join(product, 'repeats.jsonl'))).toBe(false);
    expect(fs.readFileSync(path.join(dir, 'repeats.jsonl'), 'utf8')).toContain('"late":true');
  });

  it('is made again when it was removed from under the app', () => {
    const dir = ensureMachineryDir(product, home);
    fs.rmSync(dir, { recursive: true, force: true });
    expect(ensureMachineryDir(product, home)).toBe(dir);
    expect(fs.existsSync(path.join(dir, '.origin'))).toBe(true);
  });

  it('asks again while no folder has said whose it is, so a later claim is seen', () => {
    const wanted = machineryDir(product, home);
    expect(fs.existsSync(wanted)).toBe(false);
    // Another folder whose name encodes the same claims it first.
    fs.mkdirSync(wanted, { recursive: true });
    fs.writeFileSync(path.join(wanted, '.origin'), `${path.join(tmp, 'someone-else')}\n`);
    expect(machineryDir(product, home)).not.toBe(wanted);
    expect(machineryDir(product, home).startsWith(`${wanted}-`)).toBe(true);
  });
});
