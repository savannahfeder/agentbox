// A run of a repeating task that ends with an answer for the person stays open,
// because answering a row they own does not close it. The next day's start
// read that open row as unfinished: it closed it, wrote "did not finish" over
// the answer, and counted a miss. The self-improve run of 2026-11-11 shipped
// its fix and still read as failed the next morning; two more runs in the
// store read the same way. Measured by serving two periods with the first run
// answered and reading the first row back.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Repeats } from '../main/repeats.mts';
import { loadStore } from '../main/store-modules.mts';

let dir: string;
let repeats: Repeats;
let mods: Awaited<ReturnType<typeof loadStore>>;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'answered-repeat-'));
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'p', name: 'P' }));
  mods = await loadStore();
  repeats = new Repeats(mods);
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();
const seed = () => repeats.setRule(dir, { title: 'Morning check', body: 'look', every: 'day', at: '09:00' }, at(2026, 8, 9, 9));
const ANSWER = 'Two things need you: the export is half done and the banner is new.';

describe('the next run of a repeating task', () => {
  it('leaves an answered run open with its answer, and does not count a miss', async () => {
    const rule = seed();
    await repeats.serve(dir, rule.id, '2026-08-11', at(2026, 8, 11, 10));
    const prevId = `${rule.id}-20260811`;
    mods.workItemsDisk.updateWorkItem(dir, prevId, { result: ANSWER }, { source: 'system', now: at(2026, 8, 11, 11) });

    const out = await repeats.serve(dir, rule.id, '2026-08-12', at(2026, 8, 12, 10));
    expect(out.created).toBe(true);
    expect(out.superseded).toBeNull();
    expect(out.misses).toBe(0);
    const prev = mods.workItemsDisk.readWorkItem(dir, prevId, at(2026, 8, 12, 10));
    expect(prev.status).toBe('open');
    expect(prev.result).toBe(ANSWER);
  });

  it('still supersedes a run that never answered', async () => {
    const rule = seed();
    await repeats.serve(dir, rule.id, '2026-08-11', at(2026, 8, 11, 10));
    const out = await repeats.serve(dir, rule.id, '2026-08-12', at(2026, 8, 12, 10));
    expect(out.superseded).toBe(`${rule.id}-20260811`);
    expect(out.misses).toBe(1);
  });

  it('still supersedes a run that is working right now, even with an answer from an earlier turn', async () => {
    const rule = seed();
    await repeats.serve(dir, rule.id, '2026-08-11', at(2026, 8, 11, 10));
    const prevId = `${rule.id}-20260811`;
    mods.workItemsDisk.updateWorkItem(dir, prevId, { result: ANSWER }, { source: 'system', now: at(2026, 8, 11, 11) });
    const now = at(2026, 8, 12, 10);
    const claim = await mods.workItemsDisk.claimWorkItem(dir, { id: prevId, holder: 'worker-1', now: now - 1000 });
    expect(claim.claimed).toBe(true);

    const out = await repeats.serve(dir, rule.id, '2026-08-12', now);
    expect(out.superseded).toBe(prevId);
    expect(out.misses).toBe(1);
  });
});
