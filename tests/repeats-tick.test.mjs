// The tick serves the invariant and nothing else. It creates runs; the
// fresh-work pass that already exists spawns them, because a run carries the
// founder label like any work she composed.
//
// The rule itself is never touched by any pass, and that is not a guard here,
// it is a consequence of a rule not being a work item at all.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { Repeats } from '../main/repeats.mjs';
import { loadStore } from '../main/store-modules.mjs';

let dir, mods, repeats, filed;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tick-'));
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'p', name: 'P' }));
  mods = await loadStore();
  repeats = new Repeats(mods);
  filed = [];
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const at = (y, m, d, h) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();
const SEEDED_AT = at(2026, 8, 9, 9);
const items = () => mods.workItemsDisk.readWorkItems(dir);

const supervisor = (over = {}) => Object.assign(Object.create(Supervisor.prototype), {
  paused: false,
  config: {},
  store: {
    repeats,
    listProducts: () => [{ slug: 'p', name: 'P', dir }],
    fileItem: (slug, fields) => { filed.push({ slug, ...fields }); },
  },
}, over);

const seed = () => repeats.setRule(dir, { title: 'Onboarding QA', body: 'run it', every: 'day', at: '09:00' }, SEEDED_AT);

describe('the repeat pass', () => {
  it('creates one run for a due rule, labelled with its rule', async () => {
    const rule = seed();
    await supervisor().serveRepeats(at(2026, 8, 12, 10));
    const list = [...items()];
    expect(list.length).toBe(1);
    expect(list[0].labels).toContain(`repeat:${rule.id}`);
    expect(list[0].labels).toContain('founder');
    expect(list[0].status).toBe('open');
  });

  it('a second pass in the same period creates nothing', async () => {
    seed();
    const s = supervisor();
    await s.serveRepeats(at(2026, 8, 12, 10));
    await s.serveRepeats(at(2026, 8, 12, 11));
    expect([...items()].length).toBe(1);
  });

  it('three days away is one run, not four', async () => {
    seed();
    const s = supervisor();
    await s.serveRepeats(at(2026, 8, 13, 10));
    expect([...items()].length).toBe(1);
  });

  // Two cases used to sit here, a paused product and a personal workspace, and
  // both features are deleted (w-d19d6d387c, 2026-09-22). A repeat is served on
  // every project she set one on, and the whole-fleet pause below still holds
  // all of them.

  it('files the miss alert once, as an item she will see', async () => {
    seed();
    const s = supervisor();
    for (let i = 0; i < 4; i++) await s.serveRepeats(at(2026, 8, 10 + i, 10));
    expect(filed.length).toBe(1);
    expect(filed[0].title).toMatch(/Onboarding QA/);
    expect(filed[0].body).toMatch(/2026-08-10/);
    // Agent-filed, so it waits in her inbox as a proposal rather than spawning
    // a worker at a task that is already failing.
    expect(filed[0].labels ?? []).not.toContain('founder');
  });

  // One unreadable rule must not take every other product's runs with it.
  it('a product that cannot be read does not stop the others', async () => {
    seed();
    const broken = fs.mkdtempSync(path.join(os.tmpdir(), 'broken-'));
    fs.writeFileSync(path.join(broken, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'b', name: 'B' }));
    const s = supervisor({
      store: {
        repeats: { due: (d) => { if (d === broken) throw new Error('unreadable'); return repeats.due(d, at(2026, 8, 12, 10)); }, serve: (...a) => repeats.serve(...a) },
        listProducts: () => [{ slug: 'b', name: 'B', dir: broken }, { slug: 'p', name: 'P', dir }],
        fileItem: () => {},
      },
    });
    await s.serveRepeats(at(2026, 8, 12, 10));
    expect([...items()].length).toBe(1);
    fs.rmSync(broken, { recursive: true, force: true });
  });
});
