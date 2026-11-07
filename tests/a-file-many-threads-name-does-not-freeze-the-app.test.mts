// Files finds a file's home project by comparing each thread that names it with
// every other thread that names it, in other projects, and checked the disk on
// each comparison. On a made-up store of 3,200 threads in 8 projects whose
// notes all named report.md (scripts/measure-speed.mjs, 2026-11-02), opening a
// thread held the app 41.6 s. A real inbox has such names: CLAUDE.md, README.md,
// a project's STATE.md. Counted here by disk checks, not by a clock.
import { it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { filesOf } from '../main/files-place.mts';

afterEach(() => vi.restoreAllMocks());

const PROJECTS = ['Website', 'Billing', 'Mobile'];
const PER = 200;

function threadsNaming(file, { onDisk }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'many-name-'));
  const out = [];
  let ts = 1_000;
  for (let i = 0; i < PER; i += 1) {
    for (const project of PROJECTS) {
      const dir = path.join(root, project);
      fs.mkdirSync(dir, { recursive: true });
      if (onDisk) fs.writeFileSync(path.join(dir, file), 'x');
      const id = `w-${String(out.length).padStart(10, '0')}`;
      ts += 1;
      out.push({
        ref: { kind: 'thread', product: project.toLowerCase(), id },
        title: `Thread ${id}`, project, dirs: [dir],
        lines: [{ id, ts, source: 'agent', patch: { note: `Read ${file} first.` } }],
      });
    }
  }
  return out;
}

const homes = (files) => Object.fromEntries(files.map((f) => [f.project, f.sentIn.length]));

it('a file on each project\'s own disk stays in each project, checked once per thread', () => {
  const threads = threadsNaming('CLAUDE.md', { onDisk: true });
  const exists = vi.spyOn(fs, 'existsSync');
  const files = filesOf(threads);
  expect(homes(files)).toEqual({ Website: PER, Billing: PER, Mobile: PER });
  expect(exists.mock.calls.length).toBeLessThanOrEqual(threads.length);
});

it('a file on no disk joins the project that named it first, without a check per pair', () => {
  const threads = threadsNaming('report.md', { onDisk: false });
  const exists = vi.spyOn(fs, 'existsSync');
  const files = filesOf(threads);
  // Each thread joins the oldest thread in another project naming the same
  // version: Website's first for Billing and Mobile, Billing's first for the
  // rest of Website. As it was before the comparisons were cut.
  expect(homes(files)).toEqual({ Website: 1 + 2 * PER, Billing: PER - 1 });
  expect(exists.mock.calls.length).toBeLessThanOrEqual(threads.length);
});

it('a thread that named it before any other project keeps it at home', () => {
  const threads = threadsNaming('report.md', { onDisk: false });
  // Billing's first thread now names it before anyone.
  const firstBilling = threads.find((t) => t.project === 'Billing');
  firstBilling.lines[0] = { ...firstBilling.lines[0], ts: 1 };
  const files = filesOf(threads);
  expect(homes(files).Billing).toBeGreaterThanOrEqual(1);
});
