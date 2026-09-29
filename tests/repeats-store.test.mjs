// Serving a period, which is the one piece of machinery the rule-not-an-item
// design did not make free. It has to be exactly once across two Zeros and
// across a crash in the middle of it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Repeats, OCCURRENCE_PROTOCOL } from '../main/repeats.mjs';
import { loadStore } from '../main/store-modules.mjs';

let dir, repeats, mods;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repeats-'));
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'p', name: 'P' }));
  mods = await loadStore();
  repeats = new Repeats(mods);
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const at = (y, m, d, h) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();
const items = () => mods.workItemsDisk.readWorkItems(dir);

// The rule is written with an explicit moment BEFORE the runs below, because
// the fold is timestamp-ordered: seeding with the real clock and then serving
// with fixed dates in the past means every one of those lines loses to the
// creation line, and the rule never appears to change at all.
const SEEDED_AT = at(2026, 8, 9, 9);
const seed = (now = SEEDED_AT) =>
  repeats.setRule(dir, { title: 'Onboarding QA', body: 'run it', every: 'day', at: '09:00' }, now);

describe('rules', () => {
  it('round-trips a rule through the file', () => {
    const rule = seed();
    expect(rule.id).toMatch(/^r-[0-9a-f]{10}$/);
    expect(repeats.list(dir).find((r) => r.id === rule.id)).toMatchObject({ at: '09:00', title: 'Onboarding QA' });
  });

  it('writes a rule and no work item', () => {
    seed();
    expect(repeats.list(dir).length).toBe(1);
    expect([...items()].length).toBe(0);
  });

  it('refuses a schedule it cannot keep, and leaves nothing behind', () => {
    expect(() => repeats.setRule(dir, { title: 'x', every: 'day', at: '25:00' })).toThrow(/cannot keep|not a schedule/i);
    expect(() => repeats.setRule(dir, { title: 'x', every: 'fortnight', at: '09:00' })).toThrow();
    expect(() => repeats.setRule(dir, { title: '  ', every: 'day', at: '09:00' })).toThrow(/title/);
    expect(repeats.list(dir).length).toBe(0);
    expect([...items()].length).toBe(0);
  });

  it('refuses a change that would leave a schedule it cannot keep', () => {
    const rule = seed();
    expect(() => repeats.patchRule(dir, rule.id, { at: 'half past nine' })).toThrow();
    expect(repeats.get(dir, rule.id).at).toBe('09:00');
  });

  it('an ended rule is never due', () => {
    const rule = seed();
    repeats.endRule(dir, rule.id);
    expect(repeats.due(dir, at(2026, 8, 12, 10))).toEqual([]);
  });
});

describe('serve', () => {
  it('creates one occurrence and marks the period served', async () => {
    const rule = seed();
    const now = at(2026, 8, 12, 10);
    const out = await repeats.serve(dir, rule.id, '2026-08-12', now);
    expect(out.created).toBe(true);
    expect(out.occurrenceId).toBe(`${rule.id}-20260812`);
    expect(repeats.due(dir, now)).toEqual([]);
    expect([...items()].length).toBe(1);
  });

  it('labels the run with its rule, and hands the worker the protocol first', async () => {
    const rule = seed();
    await repeats.serve(dir, rule.id, '2026-08-12', at(2026, 8, 12, 10));
    const [run] = [...items()];
    expect(run.labels).toEqual(['founder', `repeat:${rule.id}`]);
    expect(run.body.startsWith('THIS IS ONE RUN OF A REPEATING TASK')).toBe(true);
    expect(run.body).toContain(`repeat:${rule.id}`);
    expect(run.body.endsWith('run it')).toBe(true);
  });

  it('serving the same period twice creates nothing the second time', async () => {
    const rule = seed();
    const now = at(2026, 8, 12, 10);
    await repeats.serve(dir, rule.id, '2026-08-12', now);
    const again = await repeats.serve(dir, rule.id, '2026-08-12', now);
    expect(again.created).toBe(false);
    expect([...items()].length).toBe(1);
  });

  // The crash case: the occurrence landed, the watermark did not. The retry has
  // to find the occurrence present and mark the period, never run it twice.
  it('a crash between the occurrence and the watermark does not run twice', async () => {
    const rule = seed();
    const now = at(2026, 8, 12, 10);
    mods.workItemsDisk.createWorkItemIfAbsent(dir, `${rule.id}-20260812`, {
      title: 'Onboarding QA', labels: ['founder', `repeat:${rule.id}`],
    });
    const out = await repeats.serve(dir, rule.id, '2026-08-12', now);
    expect(out.created).toBe(false);
    expect(repeats.due(dir, now)).toEqual([]);
    expect([...items()].length).toBe(1);
  });

  // Two Zeros against one store. The lock serialises them; the deterministic id
  // is what makes the loser's write describe the same item rather than a second.
  it('two writers racing on one period produce exactly one occurrence', async () => {
    const rule = seed();
    const now = at(2026, 8, 12, 10);
    const other = new Repeats(mods);
    const [a, b] = await Promise.all([
      repeats.serve(dir, rule.id, '2026-08-12', now),
      other.serve(dir, rule.id, '2026-08-12', now),
    ]);
    expect([a.created, b.created].filter(Boolean).length).toBe(1);
    expect([...items()].length).toBe(1);
  });

  it('supersedes an unfinished run and counts the miss, without vetoing today', async () => {
    const rule = seed();
    await repeats.serve(dir, rule.id, '2026-08-11', at(2026, 8, 11, 10));
    const out = await repeats.serve(dir, rule.id, '2026-08-12', at(2026, 8, 12, 10));
    expect(out.created).toBe(true);
    expect(out.superseded).toBe(`${rule.id}-20260811`);
    expect(out.misses).toBe(1);
    const old = mods.workItemsDisk.readWorkItem(dir, `${rule.id}-20260811`);
    expect(old.status).toBe('done');
    expect(old.result).toMatch(/did not finish/i);
  });

  // A worker finishing between the tick's read and the write is the ordinary
  // case. Reporting that as a miss reports a failure that never happened.
  it('a run that finished just in time is not a miss', async () => {
    const rule = seed();
    await repeats.serve(dir, rule.id, '2026-08-11', at(2026, 8, 11, 10));
    mods.workItemsDisk.updateWorkItem(dir, `${rule.id}-20260811`, { status: 'done' });
    const out = await repeats.serve(dir, rule.id, '2026-08-12', at(2026, 8, 12, 10));
    expect(out.superseded).toBeNull();
    expect(out.misses).toBe(0);
  });

  it('three misses ask for the alert exactly once', async () => {
    const rule = seed();
    const outs = [];
    for (let i = 0; i < 4; i++) {
      const day = 10 + i;
      outs.push(await repeats.serve(dir, rule.id, `2026-08-${day}`, at(2026, 8, day, 10)));
    }
    expect(outs.filter((o) => o.alert).length).toBe(1);
    expect(outs[3].alert).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
    expect(outs[3].misses).toBe(3);
  });

  it('a finish resets the streak', async () => {
    const rule = seed();
    await repeats.serve(dir, rule.id, '2026-08-11', at(2026, 8, 11, 10));
    mods.workItemsDisk.updateWorkItem(dir, `${rule.id}-20260811`, { status: 'done' });
    const out = await repeats.serve(dir, rule.id, '2026-08-12', at(2026, 8, 12, 10));
    expect(out.misses).toBe(0);
  });

  it('an ended rule serves nothing, even if asked directly', async () => {
    const rule = seed();
    repeats.endRule(dir, rule.id);
    const out = await repeats.serve(dir, rule.id, '2026-08-12', at(2026, 8, 12, 10));
    expect(out.created).toBe(false);
    expect([...items()].length).toBe(0);
  });
});

describe('the protocol', () => {
  it('says the two things a worker gets wrong: labels replace, and done ends the hold', () => {
    expect(OCCURRENCE_PROTOCOL).toMatch(/REPLACE/);
    expect(OCCURRENCE_PROTOCOL).toMatch(/SAME CALL/i);
  });

  it('defaults to telling her when the worker is unsure', () => {
    expect(OCCURRENCE_PROTOCOL).toMatch(/unsure/i);
  });

  it('ends by handing over to her words, so truncation cannot eat it', () => {
    expect(OCCURRENCE_PROTOCOL.trimEnd().endsWith('HER INSTRUCTION FOLLOWS.')).toBe(true);
  });
});
