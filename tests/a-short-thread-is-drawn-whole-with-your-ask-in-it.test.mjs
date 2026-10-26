// A SHORT THREAD IS DRAWN WHOLE, WITH YOUR ASK IN IT (power test, 2026-10-25).
//
// A founder opened her onboarding thread from Needs you: her ask, the agent's
// "Starting on this now." and a result. The page folded her own message away
// behind "Show 2 earlier messages", and an engineer's two-message thread hid
// its only message, her ask, behind "Show 1 earlier message". Measured with
// `earlierCount` on those shapes: the page folded everything but the newest
// answer, however few messages that was. Now one or two messages are drawn,
// and the fold starts at three, where hiding them saves something.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawnWhole, earlierCount, earlierThan, standsAt } from '../renderer/src/one-thing-at-a-time.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const thread = fs.readFileSync(path.join(root, 'renderer/src/components/ItemThread.tsx'), 'utf8');

const you = (at, text) => ({ at, who: 'you', text });
const it_ = (at, text) => ({ at, who: 'it', text });
const work = (at) => ({ kind: 'work', at, verb: 'Listed', subject: './', output: '', lines: 0, failed: false });
const result = (at, text) => ({ at, text, field: 'result' });

describe('how many messages a thread can hide before the fold is worth it', () => {
  it('draws her ask and a short reply whole', () => {
    const events = [you(1, 'write tests for the refund flow')];
    const behind = earlierCount(events, result(5, 'Worked on it.'));
    expect(behind).toBe(1);
    expect(drawnWhole(behind)).toBe(true);
  });

  it('draws her ask, a progress note and the result whole', () => {
    const events = [you(1, 'the onboarding flow is still confusing people'), it_(2, 'Starting on this now.'), work(3)];
    const behind = earlierCount(events, result(9, 'Claude Code stopped partway through.'));
    expect(behind).toBe(2);
    expect(drawnWhole(behind)).toBe(true);
  });

  it('draws whole a thread she has answered since, with only her ask above the answer', () => {
    const events = [you(1, 'add pagination'), it_(5, 'Done, cursor based.'), you(9, 'also do the tests')];
    const from = standsAt(events, { at: 5 });
    expect(from).toBe(1);
    expect(drawnWhole(earlierThan(events, from))).toBe(true);
  });

  it('folds from three messages on, where hiding them helps', () => {
    expect(drawnWhole(3)).toBe(false);
    expect(drawnWhole(8)).toBe(false);
  });

  it('keeps the page as it was with no message behind the fold, where it holds only steps', () => {
    expect(drawnWhole(0)).toBe(false);
  });
});

describe('where the page reads it', () => {
  it('both folds, the newest answer alone and the view from the answer she followed up, ask it', () => {
    expect(thread).toMatch(/const short = !earlierOpen && drawnWhole\(behind\);/);
    expect(thread).toMatch(/const from = short \? -1 : stands;/);
    expect(thread).toMatch(/if \(queue && newest && !earlierOpen && !short && from < 0\)/);
  });

  it('and a thread drawn whole offers no fold to open', () => {
    expect(thread).toMatch(/earlier=\{short \? 0 : behind\}/);
    expect(thread).toMatch(/steps=\{!short && !!newest && /);
  });
});
