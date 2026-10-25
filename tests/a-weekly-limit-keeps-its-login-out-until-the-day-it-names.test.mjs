// A WEEKLY LIMIT KEEPS ITS LOGIN OUT UNTIL THE DAY IT NAMES (w-dcdf2cf961).
//
// A reply on a thread stopped with "This run stopped because the account hit
// its usage limit" while the login picked in Settings sat at 21% of its week.
// The run had gone to the thread's other login, whose chat it was, and Claude
// Code refused it with "You've hit your weekly limit · resets Oct 22 at 4pm
// (America/Los_Angeles)". `limitResetMoment` only read "resets 4pm", so the
// date in the way made it return null: the login was benched for the
// five-minute fallback (the state file held the death plus 300,000 ms with
// the reset 24 hours off), and every reply after those five minutes went
// back to it and died in six seconds. A state saved like that also has to
// hold the login out after the restart that installs the fix.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { limitResetMoment, troubleCause } from '../shared/spawn-trouble.mjs';
import { limitInResultLine } from '../main/cloud/run.mjs';
import { liveLine } from '../renderer/src/live-line.ts';

// Copied off the run log.
const WEEKLY = "You've hit your weekly limit · resets Oct 22 at 4pm (America/Los_Angeles)";
// 3:52:49pm on Oct 21 in Los Angeles, when it was printed, and the 4pm it names.
const PRINTED = Date.UTC(2026, 9, 21, 22, 52, 49);
const RESET = Date.UTC(2026, 9, 22, 23, 0);
const MINUTE = 60_000;

const CHOSEN = 'default';
const OTHER = '/Users/her/.claude-2';

describe('the day and hour a weekly limit names is read as a moment', () => {
  it('reads her line as 4pm the next day in Los Angeles', () => {
    expect(troubleCause(WEEKLY)).toBe('at-limit');
    expect(limitResetMoment(WEEKLY, PRINTED)).toBe(RESET);
  });

  it('reads minutes, and the hour in the zone the line names', () => {
    expect(limitResetMoment(WEEKLY.replace('4pm', '4:30pm'), PRINTED)).toBe(RESET + 30 * MINUTE);
    expect(limitResetMoment(WEEKLY.replace('America/Los_Angeles', 'Europe/Berlin'), PRINTED)).toBe(Date.UTC(2026, 9, 22, 14, 0));
    expect(limitResetMoment(WEEKLY.replace('America/Los_Angeles', 'UTC'), PRINTED)).toBe(Date.UTC(2026, 9, 22, 16, 0));
  });

  it('a line with no zone is this computer\'s clock', () => {
    expect(limitResetMoment("You've hit your weekly limit · resets Oct 22 at 4pm", PRINTED))
      .toBe(new Date(2026, 9, 22, 16, 0).getTime());
  });

  it('a date early in January printed in late December is next year', () => {
    const lateDecember = Date.UTC(2026, 11, 30, 12, 0);
    expect(limitResetMoment("You've hit your weekly limit · resets Jan 2 at 9am (UTC)", lateDecember))
      .toBe(Date.UTC(2027, 0, 2, 9, 0));
  });

  it('either side of the reset: a minute before, and minutes after, it is the same moment', () => {
    expect(limitResetMoment(WEEKLY, RESET - MINUTE)).toBe(RESET);
    expect(limitResetMoment(WEEKLY, RESET + 5 * MINUTE)).toBe(RESET);
  });

  it('leaves the wordings it already read alone', () => {
    const from = new Date(2026, 8, 24, 14, 10).getTime();
    expect(limitResetMoment("You've hit your limit · resets 6pm", from)).toBe(new Date(2026, 8, 24, 18, 0).getTime());
    expect(limitResetMoment('try again at Sep 28th, 2026 1:05 PM', from)).toBe(new Date(2026, 8, 28, 13, 5).getTime());
  });

  it('does not read a date that is not a reset, or a reset with no hour', () => {
    expect(limitResetMoment('Oct 22 at 4pm', PRINTED)).toBeNull();
    expect(limitResetMoment("You've hit your weekly limit · resets Oct 22", PRINTED)).toBeNull();
    expect(limitResetMoment("You've hit your weekly limit · resets Oct 22 at 4", PRINTED)).toBeNull();
  });

  it('the cloud reads the same line as the same moment, not thirty minutes', () => {
    const line = JSON.stringify({ type: 'result', is_error: true, result: WEEKLY });
    expect(limitInResultLine(line, PRINTED)).toBe(RESET);
  });
});

function bare(config = {}) {
  const s = Object.create(Supervisor.prototype);
  s.config = { authProfiles: [CHOSEN, OTHER], activeAccount: { claude: CHOSEN }, maxConcurrentSessions: 3, ...config };
  s._profileCooldown = {};
  s._profileStrikes = {};
  s._profileTrouble = {};
  s._saveState = () => {};
  return s;
}

const refused = (profile = OTHER, words = WEEKLY) => ({
  engine: 'claude', profile, startedAt: Date.now() - 6_000, result: words, resultIsError: true, tail: [],
});

describe('a login at its weekly limit holds no chat until that day', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(PRINTED);
  });
  afterEach(() => vi.useRealTimers());

  it('a reply 42 minutes later goes to a fresh session, not back to the full login', () => {
    const s = bare();
    s._rowSessions = { 'w-1': { sessionId: 's-1', product: 'p', profile: OTHER, engine: 'claude' } };
    s._engineFor = () => 'claude';
    s.transcriptFile = () => '/somewhere/s-1.jsonl';
    const item = { id: 'w-1', product: 'p' };
    s.noteExitForBackoff(refused());

    vi.setSystemTime(PRINTED + 42 * MINUTE);
    expect(s._profileResting(OTHER)).toBe(true);
    expect(s._profileCannotHoldAChat(OTHER, 'claude')).toBe(true);
    expect(s.rowSessionFor(item)).toBeNull();
    expect(s._profileResting(CHOSEN)).toBe(false);
  });

  it('a minute before the reset it is still out, and just after it is back', () => {
    const s = bare();
    s.noteExitForBackoff(refused());
    vi.setSystemTime(RESET - MINUTE);
    expect(s._profileResting(OTHER)).toBe(true);
    vi.setSystemTime(RESET + MINUTE);
    expect(s._profileResting(OTHER)).toBe(false);
  });

  it('a limit line with no reset in it still gets the short rest it always had', () => {
    const s = bare();
    s.noteExitForBackoff(refused(OTHER, "You've hit your weekly limit"));
    vi.setSystemTime(PRINTED + 42 * MINUTE);
    expect(s._profileResting(OTHER)).toBe(false);
  });
});

// Every login out and the reset now known, the row names it. A reset that is
// not today says its day, or "4:00pm" reads as this afternoon.
describe('a row held by a weekly limit says the day it resets', () => {
  const row = { id: 'w-1', status: 'open' };
  const now = new Date(2026, 9, 21, 15, 53).getTime();
  const held = (until) => liveLine(row, { queued: ['w-1'], atLimit: { 'w-1': { tool: 'Claude Code', until } }, inProgress: true, now }).line;

  it('tomorrow at 4pm is said with its day', () => {
    expect(held(new Date(2026, 9, 22, 16, 0).getTime()))
      .toBe('Claude Code is at its usage limit, so this starts on its own when it resets on Thu at 4:00pm.');
  });

  it('later today is the time alone, as it was', () => {
    expect(held(new Date(2026, 9, 21, 18, 30).getTime()))
      .toBe('Claude Code is at its usage limit, so this starts on its own when it resets at 6:30pm.');
  });

  it('no reset known still says why and no time', () => {
    expect(held(0)).toBe('Claude Code is at its usage limit, so this starts on its own when it resets.');
  });
});

describe('a weekly limit saved before this fix holds after the restart', () => {
  let root;
  let sup;

  const startWith = (state) => {
    fs.writeFileSync(path.join(root, '.zero-supervisor.json'), JSON.stringify(state));
    sup = new Supervisor(
      { home: '/nonexistent-home-for-this-test', storeRoot: root, maxConcurrentSessions: 3, authProfiles: [CHOSEN, OTHER] },
      { listItems: () => [], listProducts: () => [] },
      '/nonexistent-app',
    );
    return sup;
  };

  // What the state file held: the limit, no reset, and a five-minute bench.
  const savedBefore = (trouble = { cause: 'at-limit', raw: WEEKLY }) => ({
    profileTrouble: { [OTHER]: { since: PRINTED, at: PRINTED, ...trouble } },
    profileCooldown: { [OTHER]: PRINTED + 5 * MINUTE },
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'weekly-limit-'));
  });
  afterEach(() => {
    try { sup?.stop?.(); } catch {}
    vi.useRealTimers();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('keeps the login out until the day its line names', () => {
    vi.setSystemTime(PRINTED + 42 * MINUTE);
    const s = startWith(savedBefore());
    expect(s._profileResting(OTHER)).toBe(true);
    vi.setSystemTime(RESET + MINUTE);
    expect(s._profileResting(OTHER)).toBe(false);
  });

  it('a reset already past benches nothing', () => {
    vi.setSystemTime(RESET + 10 * MINUTE);
    const s = startWith(savedBefore());
    expect(s._profileResting(OTHER)).toBe(false);
  });

  it('a login waiting on something other than a limit is not benched by this', () => {
    vi.setSystemTime(PRINTED + 42 * MINUTE);
    const s = startWith(savedBefore({ cause: 'signed-out', raw: 'Failed to authenticate: OAuth session expired' }));
    expect(s._profileResting(OTHER)).toBe(false);
  });
});
