// THE ONE JUDGEMENT THE WALK TAUGHT, AND NOTHING IN THE REAL APP SAID.
//
// On 2026-10-07 six beats were cut out of the walk because a new user clicked
// straight through twenty screens (w-d48aa1232e). Five of them taught a KEY —
// ⇥, L, B, ⌘K — and every one of those keys is printed on a hint plate, a
// button or the shortcuts page, so nothing was lost. The sixth taught a
// JUDGEMENT:
//
//    "This agent is waiting on your answer, and marking it done leaves it
//     stuck."
//
// That is the move this product exists to stop, and after the cut no screen in
// the app said it. `closingRefused` and `snoozeRefused` (renderer/src/
// onboarding.ts) still refuse E and L on the practice row and say why, but
// ONLY while the walk is on and ONLY on the walk's own staged rows: the moment
// the walk ends there is no guard and no sentence anywhere.
//
// So the sentence moves into the real app, once, as a first-use nudge: the
// first press that would take a stopped agent out of the inbox does not land,
// it says what it costs, and the pill it says it in opens the thread. The
// press after that goes through, and so does every press ever after, because
// somebody may really mean it and a guard that never lets go is a nag.
//
// WHAT COUNTS AS STOPPED is the two things the screen is already showing:
// a thread whose agent ended its run with numbered options still live
// (`offerIsLive`), and an outside Claude Code session parked on "input needed"
// (`replyReaches`). The second is the literal case: that process sits at its
// prompt forever, and closing the row touches it not at all.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STOPPED_WARNING_KEYS, holdForStoppedAgent, neverWarned, rememberWarned, stoppedWaiting,
  stoppedWarning,
} from '../renderer/src/stopped-agent.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');

// A thread an agent finished with options on the result, and nobody has
// answered: the shape the inbox draws a picker under.
const stopped = {
  id: 'w-stopped', product: 'zero',
  result: 'Done.\n\n## Options\n1. Ship it (recommended)\n2. Change the chip first',
  wrote: { result: { ts: 2000 } },
};
// The same thread after a pick: the offer is spent and the row is ordinary.
const answered = { ...stopped, answer: 'Option 1: Ship it', wrote: { result: { ts: 2000 }, answer: { ts: 3000 } } };
// A thread that finished with nothing to decide.
const finished = { id: 'w-plain', product: 'zero', result: 'Shipped to main as e4707e4.', wrote: { result: { ts: 2000 } } };
// An outside session parked at its prompt, and one that is working.
const parked = { id: 'agent:71', product: '', agent: { status: 'waiting', waitingFor: 'input needed' } };
const busy = { id: 'agent:72', product: '', agent: { status: 'busy', waitingFor: null } };
// And one stopped on a permission box, which Agentbox cannot clear from here:
// a reply would wait behind that box, so this row is not the lesson.
const atAPrompt = { id: 'agent:73', product: '', agent: { status: 'waiting', waitingFor: 'permission prompt' } };

const hold = (rows, over = {}) => holdForStoppedAgent({ rows, key: 'E', warned: false, walking: false, ...over });

describe('which rows are an agent stopped, waiting on you', () => {
  it('a live offer is one, because the screen is showing the answers it wants', () => {
    expect(stoppedWaiting(stopped)).toBe(true);
  });

  it('an outside session parked on input needed is one', () => {
    expect(stoppedWaiting(parked)).toBe(true);
  });

  it('a spent offer is not: the pick already reached it', () => {
    expect(stoppedWaiting(answered)).toBe(false);
  });

  it('a finished thread with nothing to decide is not', () => {
    expect(stoppedWaiting(finished)).toBe(false);
  });

  it('a session that is working is not, and nor is one held at a permission box', () => {
    expect(stoppedWaiting(busy)).toBe(false);
    expect(stoppedWaiting(atAPrompt)).toBe(false);
  });
});

describe('the first press that would leave one stuck says so instead', () => {
  it('holds it, names the cost, and offers the row to open', () => {
    const held = hold([stopped]);
    expect(held).toBeTruthy();
    expect(held.say).toContain('waiting on your answer');
    expect(held.say).toContain('leaves it stuck');
    expect(held.goes).toEqual({ product: 'zero', id: 'w-stopped' });
  });

  it('says the same thing about putting it off, in the same words', () => {
    const e = hold([stopped]).say;
    const l = hold([stopped], { key: 'L' }).say;
    expect(l).toContain('waiting on your answer');
    expect(l).toContain('leaves it stuck');
    // ONE LESSON, TWO VERBS. E and L say the same thing about this row, and two
    // wordings of it is two lessons; only the verb for what the key does may
    // differ. Same rule as STOPPED_REFUSAL in onboarding.ts.
    expect(e).not.toBe(l);
    expect(e.replace('marking it done', '')).toBe(l.replace('putting it off', ''));
  });

  it('and it says how to go ahead, because the press after this one lands', () => {
    for (const key of STOPPED_WARNING_KEYS) expect(stoppedWarning(key)).toMatch(/again/);
  });

  it('the press after it goes through, and so does every press after that', () => {
    expect(hold([stopped], { warned: true })).toBe(null);
  });

  it('a row that is not stopped is never held, warned or not', () => {
    expect(hold([finished])).toBe(null);
    expect(hold([answered])).toBe(null);
    expect(hold([busy, atAPrompt])).toBe(null);
    expect(hold([])).toBe(null);
  });

  it('a ticked selection is held by the one stopped row in it, and points at that one', () => {
    const held = hold([finished, parked, answered]);
    expect(held).toBeTruthy();
    expect(held.goes).toEqual({ product: '', id: 'agent:71' });
  });

  it('the walk keeps its own lesson, so a walk never spends the one nudge', () => {
    // `closingRefused` has the practice rows while the walk is on, and it
    // refuses them every time rather than once. A press inside the walk must
    // not be the press that uses this up.
    expect(hold([stopped], { walking: true })).toBe(null);
  });
});

describe('the nudge is remembered once, ever', () => {
  const store = () => {
    const held = new Map();
    return { getItem: (k) => (held.has(k) ? held.get(k) : null), setItem: (k, v) => held.set(k, v), held };
  };

  it('an install that has never been told is one that has never been told', () => {
    expect(neverWarned(store())).toBe(true);
  });

  it('and one that has been is not, for good', () => {
    const s = store();
    rememberWarned(s);
    expect(neverWarned(s)).toBe(false);
  });

  it('a store it cannot read reads as already told, because the quiet fallback is silence', () => {
    // Same call as `neverOffered` in ./tutorial.ts: a repeated question is the
    // thing being avoided, so a broken store says nothing rather than saying
    // it on every press.
    const broken = { getItem: () => { throw new Error('private mode'); }, setItem: () => {} };
    expect(neverWarned(broken)).toBe(false);
  });

  it('and a store that will not take the write is swallowed, not thrown', () => {
    expect(() => rememberWarned({ setItem: () => { throw new Error('disk full'); } })).not.toThrow();
  });
});

describe('every way a stopped row could leave the inbox goes past the nudge', () => {
  it('the single close does', () => {
    expect(app).toMatch(/const markDone[\s\S]{0,1400}?nudgeOnStopped\(\[item\], 'E'\)/);
  });

  it('a ticked selection does, so E over four ticks cannot take one out unwarned', () => {
    expect(app).toMatch(/const batchDone[\s\S]{0,1600}?nudgeOnStopped\(targets, 'E'\)/);
  });

  it('and the snooze picker does, because L empties the row exactly as E does', () => {
    expect(app).toMatch(/const openSnooze[\s\S]{0,2400}?nudgeOnStopped\(rows, 'L'\)/);
  });

  it('and all three go through one guard, which says it and writes it down once', () => {
    // showToast's second argument is what turns the pill into a button with
    // "Open it" on its end (App.tsx, `.toast-goes`). The sentence without it
    // would be advice with no way in. `rememberWarned` beside it is what makes
    // the next press land.
    expect(app).toMatch(
      /const nudgeOnStopped[\s\S]{0,500}?holdForStoppedAgent\([\s\S]{0,400}?rememberWarned\(localStorage\)[\s\S]{0,200}?showToast\(held\.say, held\.goes\)/,
    );
  });
});
