// A THREAD THAT WILL TRY AGAIN SAYS WHEN.
//
// A thread stopped for a mechanical reason waits and then starts again on its
// own, but two kinds of row did not say when, so to the person it looked stuck:
//
//  - A limit that names a day ("resets Oct 22 at 4pm", Codex's "try again at
//    Oct 28th, 2026 1:05 PM") read "It starts again on its own when the limit
//    resets". `limitResetsAt` only read "resets <hour>", though
//    `limitResetMoment` already read both and the app waited for the right
//    moment. Measured by calling `limitResetsAt` on both lines: null.
//  - A run that died (crashed, cut off, or worked partway) read "Agentbox tries
//    again on its own" and nothing more, while the rest ladder (15m, 1h, 4h,
//    12h, 24h) already knew the moment. Measured on `sayTheRunDied`: the row
//    carried no time at all.

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deadRunSentence, limitResetsAt } from '../shared/spawn-trouble.mjs';
import { Supervisor } from '../main/supervisor.mjs';

// Tuesday Oct 20 2026, 2:30pm, in the zone the tests run in.
const now = new Date(2026, 9, 20, 14, 30).getTime();
const at = (day, h, m = 0) => new Date(2026, 9, day, h, m).getTime();

describe('a limit that names its day', () => {
  it('says the day and the hour, the way Claude Code prints it', () => {
    expect(limitResetsAt("You've hit your limit · resets Oct 22 at 4pm", now)).toBe('Thu 4pm');
  });

  it('says the day, the date and the hour, the way Codex prints it a week out', () => {
    expect(limitResetsAt("You've hit your usage limit. Upgrade to Pro, or try again at Oct 28th, 2026 1:05 PM.", now)).toBe('Wed Oct 28 1:05pm');
  });

  it('still says only the hour for a reset later today', () => {
    expect(limitResetsAt("You've hit your limit · resets 6pm", now)).toBe('6pm');
  });

  it('says nothing when the line names no time', () => {
    expect(limitResetsAt('Claude AI usage limit reached', now)).toBeNull();
  });
});

describe('the sentence on a row whose run died', () => {
  const retryAt = at(20, 15, 15);

  it('names the time it tries again, for a run that died before it began', () => {
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'unknown', retryAt, now })).toMatch(/tries again on its own at 3:15pm\.$/);
  });

  it('names the time for a run that worked partway', () => {
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'unknown', worked: true, retryAt, now })).toMatch(/tries it again on its own at 3:15pm\.$/);
  });

  it('names the time for a run that was cut off', () => {
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'interrupted', retryAt, now })).toMatch(/runs it again on its own at 3:15pm\.$/);
  });

  it('names the day when the rest runs past midnight', () => {
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'unknown', worked: true, retryAt: at(21, 14, 30), now })).toMatch(/at Wed 2:30pm\.$/);
  });

  it('keeps its old words with no time to give', () => {
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'unknown', worked: true })).toMatch(/tries it again on its own\.$/);
  });

  it('puts no ladder time on a cause that waits for her or for the account', () => {
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'signed-out', retryAt, now })).not.toContain('3:15pm');
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'at-limit', resetsAt: '6pm', retryAt, now })).toMatch(/at 6pm\.$/);
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'unknown', gaveUp: true, retryAt, now })).not.toContain('3:15pm');
  });
});

describe('sayTheRunDied', () => {
  const dirs = [];
  afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });

  it('writes the moment the rest ends onto the row', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'says-when-'));
    dirs.push(root);
    const written = [];
    const sup = new Supervisor(
      { storeRoot: root, home: root, authProfiles: ['default'] },
      { listItems: () => [], listProducts: () => [], isDue: () => true, recordSessionResult: (slug, id, patch) => { written.push(patch); return null; } },
      root,
    );
    sup._saveState = () => {};
    const item = { id: 'w-1', product: 'p', title: 'Add ini.js', status: 'open', wrote: { title: { ts: 1, source: 'founder' } } };
    const endedAt = Date.now();
    // Its third run that did nothing: the ladder rests it four hours.
    sup._fruitless['p:w-1'] = { runs: 3, endedAt, founderAt: 1 };
    sup.sayTheRunDied(item, { tail: ['stderr: something went wrong'], usedATool: true });
    const back = new Date(sup.restingUntil(item));
    const clock = `${back.getHours() % 12 || 12}${back.getMinutes() ? `:${String(back.getMinutes()).padStart(2, '0')}` : ''}${back.getHours() < 12 ? 'am' : 'pm'}`;
    expect(sup.restingUntil(item)).toBe(endedAt + 4 * 60 * 60_000);
    expect(written).toHaveLength(1);
    expect(written[0].result).toContain(`tries it again on its own at `);
    expect(written[0].result).toContain(clock);
  });
});
